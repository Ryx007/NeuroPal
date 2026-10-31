import Foundation

/// Files shared between the app and its widget extension (App Group
/// `group.io.neuropal.ios`). One JSON file per owner:
///   appearance.json  the look (NPTheme writes; widgets resolve the palette)
///   day.json         check-ins, anchors, minimum day (NPDay)
///   reading.json     what's being read (NPReader)
/// Without the App Group (an unsigned simulator build) it falls back to the
/// app's own Application Support folder: the app keeps working, only the
/// widgets can't see its data.
public enum SharedContainer {
    public static let appGroup = "group.io.neuropal.ios"

    public static var directory: URL {
        if let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) {
            return group
        }
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "NeuroPal", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
        return support
    }

    /// True when the App Group is available (widgets can read what the app writes).
    public static var isShared: Bool {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) != nil
    }

    public static func url(_ name: String) -> URL { directory.appending(path: name) }

    public static func read<T: Decodable>(_ type: T.Type, from name: String) -> T? {
        guard let data = try? Data(contentsOf: url(name)) else { return nil }
        return try? JSONDecoder.neuropal.decode(T.self, from: data)
    }

    /// Atomic write (a widget never sees half a file).
    public static func write<T: Encodable>(_ value: T, to name: String) {
        guard let data = try? JSONEncoder.neuropal.encode(value) else { return }
        #if os(iOS)
        // Readable by the widget after the first unlock, even while locked.
        try? data.write(to: url(name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try? data.write(to: url(name), options: [.atomic])
        #endif
    }

    public static func remove(_ name: String) {
        try? FileManager.default.removeItem(at: url(name))
    }
}

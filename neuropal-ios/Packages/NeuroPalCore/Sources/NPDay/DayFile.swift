import Foundation
import NPCore

/// day.json on disk, for code that runs outside the app's DayStore — the
/// widget extension's check-in intent and its timelines. Same rules as the
/// app (DayRules.swift); the app picks the change up when it comes back to
/// the foreground (DayStore.reloadFromDisk).
public enum DayFile {
    /// day.json in the shared App Group container.
    public static var url: URL { SharedContainer.url(DayStore.fileName) }

    public static func load(from url: URL = DayFile.url) -> DayData? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder.neuropal.decode(DayData.self, from: data)
    }

    /// Atomic write: a reader never sees half a file.
    public static func save(_ day: DayData, to url: URL = DayFile.url) {
        guard let data = try? JSONEncoder.neuropal.encode(day) else { return }
        #if os(iOS)
        // Readable by the widget after the first unlock, even while locked.
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try? data.write(to: url, options: [.atomic])
        #endif
    }

    /// A check-in from a widget button: read, apply the app's rule, write.
    /// The day rolls over first if the file is from yesterday.
    @discardableResult
    public static func recordCheckIn(_ state: NervousState, at: Date = Date(), url: URL = DayFile.url) -> DayData {
        var day = load(from: url) ?? .starter
        day.rollOver(now: at)
        day.recordCheckIn(state, level: nil, at: at, now: at)
        save(day, to: url)
        return day
    }
}

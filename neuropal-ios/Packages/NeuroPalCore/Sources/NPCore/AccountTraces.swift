import Foundation

/// What one account leaves on this device, removed when its session ends
/// (`AppSession.onSessionEnd`), so the next person to sign in on the phone
/// doesn't see it: the reading snapshot behind "Continue reading" (and its
/// widget), Pal's chat, downloaded original PDFs and staged uploads, and the
/// app's URL cache (page images are fetched with ticket URLs).
///
/// The day (check-ins, anchors, minimum day — day.json) stays: it belongs to
/// the person holding the phone, not to an account (an owner decision).
public enum AccountTraces {
    /// In the shared container: reading.json (NPReader writes it) and
    /// pal-chat.json (NPPal writes it).
    public static let sharedFiles = [ReadingSnapshot.fileName, "pal-chat.json"]

    /// Temporary files named after documents or carrying their content.
    static let temporaryPrefixes = ["np-original-", "np-download-", "np-upload-"]

    public static func remove() {
        for name in sharedFiles { SharedContainer.remove(name) }
        removeTemporaryFiles(in: FileManager.default.temporaryDirectory)
        URLCache.shared.removeAllCachedResponses()
    }

    /// Downloaded originals (np-original-<id>.pdf), unfinished downloads and
    /// upload bodies, and staged uploads (np-uploads/).
    static func removeTemporaryFiles(in folder: URL) {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: folder.path) else { return }
        for name in names where name == "np-uploads" || temporaryPrefixes.contains(where: { name.hasPrefix($0) }) {
            try? fm.removeItem(at: folder.appending(path: name))
        }
    }
}

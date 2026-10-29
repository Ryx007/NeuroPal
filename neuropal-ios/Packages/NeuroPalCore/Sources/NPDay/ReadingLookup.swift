import Foundation
import NPCore

/// What is being read right now — Home's "Continue reading" and Pal's
/// "What now?" ask the same question.
public enum ReadingLookup {
    /// The newer of this device's reading.json (written by the reader) and
    /// the server's most recently read unfinished document. With
    /// `fallbackToFirst`, a never-opened ready document when nothing is in
    /// progress (Home offers to start it).
    /// - Parameters:
    ///   - api: nil when signed out (the snapshot alone is used).
    ///   - useSnapshot: false in previews and mock screenshots.
    public static func current(api: (any NeuroPalAPI)?, useSnapshot: Bool,
                               fallbackToFirst: Bool = false) async -> PalLogic.ReadingItem? {
        var best: PalLogic.ReadingItem?
        if useSnapshot, let snap = ReadingSnapshot.load() {
            best = PalLogic.ReadingItem(id: snap.documentID, title: snap.title, progress: snap.progress,
                                        lastReadAt: snap.updatedAt)
        }
        guard let api, let docs = try? await api.documents(query: nil) else { return best }
        if let b = best, !docs.contains(where: { $0.id == b.id }) { best = nil } // deleted meanwhile
        if let fromServer = PalLogic.unfinishedReading(docs) {
            if let b = best, b.id == fromServer.id || (b.lastReadAt ?? .distantPast) >= (fromServer.lastReadAt ?? .distantPast) {
                best?.pageCount = docs.first { $0.id == b.id }?.pageCount
            } else {
                best = fromServer
            }
        } else if best == nil, fallbackToFirst, let first = docs.first(where: { $0.status == .ready }) {
            best = PalLogic.ReadingItem(id: first.id, title: first.title, progress: first.readingProgress ?? 0,
                                        lastReadAt: first.lastReadAt, pageCount: first.pageCount)
        }
        if let b = best, b.progress >= 1, !fallbackToFirst { return nil }
        return best
    }
}

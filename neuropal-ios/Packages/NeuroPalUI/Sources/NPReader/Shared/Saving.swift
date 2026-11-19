import Foundation
import NPCore
import WidgetKit

/// When to save the reading position: 2 s after the reader stops moving,
/// and at least every 15 s while it keeps moving (the voice reading on), so
/// a long listen isn't lost if the app is closed.
@MainActor
final class SaveScheduler {
    var action: (@MainActor () async -> Void)?
    private var task: Task<Void, Never>?
    private var since: Date?

    func soon() {
        let now = Date()
        let first = since ?? now
        since = first
        task?.cancel()
        if now.timeIntervalSince(first) >= 15 {
            fire()
            return
        }
        task = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard let self, !Task.isCancelled else { return }
            self.fire()
        }
    }

    func cancel() {
        task?.cancel()
        task = nil
        since = nil
    }

    private func fire() {
        task = nil
        since = nil
        let run = self.action
        // Its own task: the next move must not cancel a save on its way.
        Task { await run?() }
    }
}

/// Home's "Continue reading" tile and the Continue reading widget read
/// reading.json (`ReadingSnapshot`); the reader keeps it current. The widget
/// reloads when what it shows changed: at most every 30 s while reading,
/// and once when the reader closes.
@MainActor
enum ContinueReading {
    /// The widget's kind (NeuroPalWidgets).
    static let widgetKind = "io.neuropal.ios.reading"

    private struct Shown: Equatable {
        var documentID: String
        var title: String
        var percent: Int
    }

    private static var lastReload = Date.distantPast
    private static var shown: Shown?

    static func record(documentID: String, title: String, progress: Double, leaving: Bool = false) {
        let p = min(1, max(0, progress))
        ReadingSnapshot(documentID: documentID, title: title, progress: p).save()
        let next = Shown(documentID: documentID, title: title, percent: Int((p * 100).rounded(.down)))
        guard next != shown else { return }
        let now = Date()
        guard leaving || now.timeIntervalSince(lastReload) >= 30 else { return }
        reload(showing: next)
    }

    /// A renamed document keeps its place under its new title.
    static func renamed(documentID: String, title: String) {
        guard var snapshot = ReadingSnapshot.load(), snapshot.documentID == documentID, snapshot.title != title else { return }
        snapshot.title = title
        snapshot.save()
        reload(showing: Shown(documentID: documentID, title: title, percent: Int((snapshot.progress * 100).rounded(.down))))
    }

    /// A deleted document leaves Continue reading (and the widget).
    static func forget(documentID: String) {
        guard ReadingSnapshot.load()?.documentID == documentID else { return }
        SharedContainer.remove(ReadingSnapshot.fileName)
        reload(showing: nil)
    }

    /// Signed out (the app removed reading.json and reloads every widget):
    /// nothing is shown any more.
    static func forgetShown() {
        shown = nil
        lastReload = .distantPast
    }

    private static func reload(showing next: Shown?) {
        lastReload = Date()
        shown = next
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }
}

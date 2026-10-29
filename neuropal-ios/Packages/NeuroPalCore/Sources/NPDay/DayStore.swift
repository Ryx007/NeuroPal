import Foundation
import Observation

/// Today's data, persisted to the shared container (day.json) so the
/// widgets read the same state. SKELETON: saves on every change; the Home
/// agent owns the rules (check-in merging/cap, day rollover, anchors).
@MainActor
@Observable
public final class DayStore {
    public nonisolated static let fileName = "day.json"

    public private(set) var day: DayData
    @ObservationIgnored private let persist: Bool

    /// `persist: false` for previews and tests.
    public init(day: DayData? = nil, persist: Bool = true) {
        self.persist = persist
        self.day = day ?? (persist ? SharedContainer.read(DayData.self, from: Self.fileName) : nil) ?? .starter
    }

    /// A check-in from the slider (with its level) or a button/widget (no level).
    public func checkIn(_ state: NervousState, level: Double? = nil, at: Date = Date()) {
        day.state = state
        day.level = level ?? state.middleLevel
        day.checkins.append(CheckIn(state: state, level: level, at: at))
        save()
    }

    public func toggleTask(_ id: String) {
        guard let i = day.tasks.firstIndex(where: { $0.id == id }) else { return }
        day.tasks[i].done.toggle()
        save()
    }

    public func update(_ change: (inout DayData) -> Void) {
        change(&day)
        save()
    }

    /// The next anchor still to come today, if any.
    public func nextAnchor(after now: Date = Date(), calendar: Calendar = .current) -> DayAnchor? {
        let c = calendar.dateComponents([.hour, .minute], from: now)
        let minutes = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        return day.anchors
            .filter { $0.status == .upcoming && $0.hour * 60 + $0.minute + $0.flexMinutes >= minutes }
            .min { ($0.hour, $0.minute) < ($1.hour, $1.minute) }
    }

    private func save() {
        guard persist else { return }
        SharedContainer.write(day, to: Self.fileName)
    }
}

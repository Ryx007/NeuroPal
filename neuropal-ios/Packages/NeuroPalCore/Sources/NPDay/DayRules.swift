import Foundation
import NPCore

// The day's rules as pure functions on DayData — a port of the Expo app's
// homeSlice.js (check-ins, minimum day, anchors) and palSlice.js (brain dump,
// "Sit with me"). DayStore (the app) and DayFile (the widgets) both use them,
// so a check-in behaves the same wherever it's made.

public extension DayData {
    /// CHECKIN_CAP: history entries kept (newest last).
    static let checkinCap = 200
    /// CHECKIN_MERGE_MS: adjustments within a minute of the last check-in
    /// refine it instead of adding a new one (one check-in = one settled
    /// feeling, not every slider movement).
    static let checkinMergeWindow: TimeInterval = 60
    /// The minimum viable day holds 3–5 things; adding stops at 5.
    static let taskCap = 5
    /// Brain-dump lines kept.
    static let dumpCap = 1000
    /// Sit notes kept.
    static let sitNotesCap = 30
    /// An unanswered "Want to note what you did?" goes away after this.
    static let sitForgetAfter: TimeInterval = 30 * 60

    // MARK: Check-ins

    /// The slider position for the current state (exact level, or the
    /// middle of the region; nil before the first check-in).
    var sliderLevel: Double? { NervousState.sliderLevel(state: state, level: level) }

    /// recordCheckin: the state, its exact level and a history entry,
    /// updated together so they never disagree.
    /// - A check-in older than the newest one (a widget tap the app hears
    ///   about later) joins the history in time order; the current state
    ///   stays as it is.
    /// - Within a minute of the newest one it replaces it.
    /// - `at` is never in the future.
    @discardableResult
    mutating func recordCheckIn(_ mood: NervousState, level: Double? = nil, at: Date = Date(), now: Date = Date()) -> CheckIn {
        record(CheckIn(state: mood, level: DayData.cleanLevel(level), at: min(at, now)))
    }

    /// The same rule for a check-in that already exists (one another process
    /// wrote): it keeps its id.
    @discardableResult
    mutating func record(_ entry: CheckIn) -> CheckIn {
        if let last = checkins.last, entry.at < last.at {
            var i = checkins.count
            while i > 0, checkins[i - 1].at > entry.at { i -= 1 }
            checkins.insert(entry, at: i)
        } else {
            state = entry.state
            level = entry.level
            if let last = checkins.last, entry.at.timeIntervalSince(last.at) < DayData.checkinMergeWindow {
                checkins[checkins.count - 1] = entry
            } else {
                checkins.append(entry)
            }
        }
        if checkins.count > DayData.checkinCap { checkins.removeFirst(checkins.count - DayData.checkinCap) }
        return entry
    }

    /// Today's check-ins (oldest first), for the history strip.
    func checkins(on date: Date, calendar: Calendar = .current) -> [CheckIn] {
        checkins.filter { calendar.isDate($0.at, inSameDayAs: date) }
    }

    // MARK: A new day

    /// New day → yesterday's checkmarks don't count any more: tasks are
    /// unchecked and anchors are upcoming again. Returns true if it rolled.
    @discardableResult
    mutating func rollOver(now: Date = Date(), calendar: Calendar = .current) -> Bool {
        let today = DayData.stamp(now, calendar: calendar)
        guard dayStamp != today else { return false }
        dayStamp = today
        for i in tasks.indices { tasks[i].done = false }
        for i in anchors.indices { anchors[i].status = .upcoming }
        return true
    }

    // MARK: Minimum viable day

    var remainingTasks: Int { tasks.filter { !$0.done }.count }
    var canAddTask: Bool { tasks.count < DayData.taskCap }

    /// Adds a task (trimmed). False when empty or the day already has five.
    @discardableResult
    mutating func addTask(_ title: String) -> Bool {
        let t = DayData.clean(title, max: 200)
        guard !t.isEmpty, canAddTask else { return false }
        tasks.append(DayTask(title: t))
        return true
    }

    mutating func removeTask(_ id: String) {
        tasks.removeAll { $0.id == id }
    }

    mutating func renameTask(_ id: String, to title: String) {
        let t = DayData.clean(title, max: 200)
        guard !t.isEmpty, let i = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[i].title = t
    }

    mutating func toggleTask(_ id: String) {
        guard let i = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[i].done.toggle()
    }

    mutating func setTask(_ id: String, done: Bool) {
        guard let i = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[i].done = done
    }

    // MARK: Anchors

    /// Adds or updates an anchor (matched by id). The title is trimmed and
    /// required; time and window are clamped; the list stays sorted by time.
    /// A new anchor starts as upcoming; an edit keeps its status.
    mutating func saveAnchor(_ anchor: DayAnchor) {
        var a = anchor
        a.title = DayData.clean(a.title, max: 80)
        guard !a.title.isEmpty else { return }
        let sub = DayData.clean(a.subtitle ?? "", max: 200)
        a.subtitle = sub.isEmpty ? nil : sub
        a.hour = min(23, max(0, a.hour))
        a.minute = min(59, max(0, a.minute))
        a.flexMinutes = min(240, max(0, a.flexMinutes))
        if let i = anchors.firstIndex(where: { $0.id == a.id }) {
            a.status = anchors[i].status
            anchors[i] = a
        } else {
            a.status = .upcoming
            anchors.append(a)
        }
        sortAnchors()
    }

    mutating func removeAnchor(_ id: String) {
        anchors.removeAll { $0.id == id }
    }

    mutating func setAnchor(_ id: String, status: DayAnchor.Status) {
        guard let i = anchors.firstIndex(where: { $0.id == id }) else { return }
        anchors[i].status = status
    }

    private mutating func sortAnchors() {
        // Stable: anchors at the same minute keep their order.
        anchors = anchors.enumerated()
            .sorted { ($0.element.minuteOfDay, $0.offset) < ($1.element.minuteOfDay, $1.offset) }
            .map(\.element)
    }

    /// The next anchor still to come: the first upcoming one (not done or
    /// skipped) whose window hasn't closed yet. A missed one just drops out —
    /// no "overdue", no shame.
    func nextAnchor(now: Date = Date(), calendar: Calendar = .current) -> DayAnchor? {
        let nowMin = DayData.minuteOfDay(now, calendar: calendar)
        return anchors
            .filter { $0.status == .upcoming && $0.minuteOfDay + $0.flexMinutes >= nowMin }
            .min { $0.minuteOfDay < $1.minuteOfDay }
    }

    /// The upcoming anchors after the next one (widgets' medium size).
    func anchorsAfterNext(now: Date = Date(), calendar: Calendar = .current, limit: Int = 2) -> [DayAnchor] {
        guard let next = nextAnchor(now: now, calendar: calendar) else { return [] }
        return Array(anchors.filter { $0.status == .upcoming && $0.minuteOfDay > next.minuteOfDay }.prefix(limit))
    }

    static func minuteOfDay(_ date: Date, calendar: Calendar = .current) -> Int {
        let c = calendar.dateComponents([.hour, .minute], from: date)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    /// Minutes from `now` to the anchor's time today (negative once it has started).
    static func minutesUntil(_ anchor: DayAnchor, now: Date = Date(), calendar: Calendar = .current) -> Int {
        anchor.minuteOfDay - minuteOfDay(now, calendar: calendar)
    }

    /// The anchor's time today as a Date.
    static func date(of anchor: DayAnchor, on day: Date = Date(), calendar: Calendar = .current) -> Date {
        calendar.date(bySettingHour: anchor.hour, minute: anchor.minute, second: 0, of: day) ?? day
    }

    // MARK: Brain dump

    /// Adds a line at the top (whitespace collapsed). Nil when empty.
    @discardableResult
    mutating func addDump(_ text: String, now: Date = Date()) -> DumpItem? {
        let t = DayData.clean(text, max: 2000)
        guard !t.isEmpty else { return nil }
        let item = DumpItem(text: t, at: now)
        dump.insert(item, at: 0)
        if dump.count > DayData.dumpCap { dump.removeLast(dump.count - DayData.dumpCap) }
        return item
    }

    @discardableResult
    mutating func removeDump(_ id: String) -> DumpItem? {
        guard let i = dump.firstIndex(where: { $0.id == id }) else { return nil }
        return dump.remove(at: i)
    }

    /// Undo of a delete: the line comes back at the top.
    mutating func restoreDump(_ item: DumpItem) {
        guard !dump.contains(where: { $0.id == item.id }) else { return }
        dump.insert(item, at: 0)
        if dump.count > DayData.dumpCap { dump.removeLast(dump.count - DayData.dumpCap) }
    }

    // MARK: Sit with me

    /// Starts a new block (any running one is replaced).
    @discardableResult
    mutating func startSit(minutes: Int, label: String = "", taskID: String? = nil, anchorID: String? = nil,
                           now: Date = Date()) -> SitSession {
        let m = max(1, min(240, minutes))
        let s = SitSession(minutes: m, label: DayData.clean(label, max: 120), taskID: taskID, anchorID: anchorID,
                           startedAt: now, endsAt: now.addingTimeInterval(TimeInterval(m * 60)))
        sit = s
        return s
    }

    /// "Still going" / "Not really, keep going" (yes/no) to the current check-in.
    mutating func answerSitCheckIn(_ answer: SitSession.CheckIn) {
        guard sit?.isRunning == true else { return }
        sit?.checkIn = answer
    }

    /// Ends the block: the user said they're done or stopped (`.done`), or
    /// the time ran out (`.time`, ending at `endsAt`).
    mutating func endSit(_ reason: SitSession.EndReason, now: Date = Date()) {
        guard var s = sit, s.isRunning else { return }
        s.endReason = reason
        s.endedAt = reason == .time ? s.endsAt : min(now, s.endsAt)
        s.checkIn = s.checkIn == .asked ? nil : s.checkIn
        sit = s
    }

    /// The block is over without a note.
    mutating func clearSit() { sit = nil }

    /// Saves a note about the finished block (an empty note just clears it).
    mutating func saveSitNote(_ note: String, now: Date = Date()) {
        guard let s = sit else { return }
        let n = DayData.clean(note, max: 500)
        if !n.isEmpty {
            sitNotes.insert(SitNote(minutes: s.minutesSpent, label: s.label, note: n, at: now), at: 0)
            if sitNotes.count > DayData.sitNotesCap { sitNotes.removeLast(sitNotes.count - DayData.sitNotesCap) }
        }
        sit = nil
    }

    /// One tick of the block's clock: asks a check-in when one is due, ends
    /// the block when the time is up, and forgets an end prompt nobody
    /// answered for half an hour. Returns what happened, if anything.
    mutating func tickSit(now: Date = Date()) -> SitEvent? {
        guard var s = sit else { return nil }
        if let ended = s.endedAt {
            if now.timeIntervalSince(ended) > DayData.sitForgetAfter {
                sit = nil
                return .forgotten
            }
            return nil
        }
        if now >= s.endsAt {
            endSit(.time, now: now)
            return .ended
        }
        let due = s.checkInTimes.filter { $0 <= now }.count
        if due > s.checkInsAsked {
            s.checkInsAsked = due
            s.checkIn = .asked
            sit = s
            return .checkInAsked
        }
        return nil
    }

    // MARK: -

    /// Whitespace collapsed to single spaces, trimmed, at most `max` characters.
    static func clean(_ text: String, max: Int) -> String {
        let collapsed = text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return String(collapsed.prefix(max))
    }
}

/// What a tick of the "Sit with me" clock did.
public enum SitEvent: Sendable, Equatable {
    case checkInAsked
    case ended
    case forgotten
}

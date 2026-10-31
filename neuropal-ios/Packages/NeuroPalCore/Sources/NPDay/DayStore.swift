import Foundation
import NPCore
import Observation
#if canImport(UIKit)
import UIKit
#endif
#if os(iOS) && canImport(WidgetKit)
import WidgetKit
#endif

/// Today's data (check-ins, anchors, the minimum day, Pal's brain dump and
/// "Sit with me"), saved to day.json in the shared container so the widgets
/// read the same day. Pal's chat lives beside it in pal-chat.json (app-only).
///
/// Every change saves at once. A widget's check-in (written straight into
/// day.json by its intent) is picked up when the app returns to the
/// foreground, and is never overwritten by a save in between: saves are
/// coordinated with the widget's writes (DayFile.update), and check-ins are
/// merged by id, never replaced wholesale.
///
/// "Sit with me" also sets one local notification for the end of the block
/// (permission is asked when the first block starts, never at launch), and
/// takes it back when the block ends early or is put away.
@MainActor
@Observable
public final class DayStore {
    public nonisolated static let fileName = "day.json"
    public nonisolated static let chatFileName = "pal-chat.json"
    /// Chat lines kept on the device (the sheet shows the last 10).
    public nonisolated static let chatKeep = 30

    public private(set) var day: DayData
    /// Pal's chat on this device, oldest first.
    public private(set) var chat: [PalChatLine]
    /// The last thing the "Sit with me" clock did (views can react to it).
    public private(set) var sitEvent: SitEventStamp? = nil
    /// Whether the running block's end will be announced while the app is
    /// closed (`.off`: notifications are off, and the sit screen says so).
    public private(set) var sitReminder: SitReminderState = .unknown
    /// Pal as the user built it — the name and talk style of what the store
    /// says out loud ("Still with it?"). Home and Pal keep it current.
    @ObservationIgnored public var pal = Appearance.Pal()

    @ObservationIgnored private let fileURL: URL?
    @ObservationIgnored private let chatURL: URL?
    /// Every check-in id this copy has read from or written to disk: any
    /// other id on disk was written by another process (a widget) and gets
    /// merged in. It only grows — an id this copy dropped (refined within a
    /// minute, or past the cap) must never come back from an old file.
    @ObservationIgnored private var knownCheckinIDs: Set<UUID>
    @ObservationIgnored private let reminders: (any SitReminderScheduling)?
    /// The reminder being set or checked (tests wait for it).
    @ObservationIgnored private(set) var reminderTask: Task<Void, Never>? = nil
    /// The block whose reminder is being set up right now.
    @ObservationIgnored private var schedulingSitID: String? = nil
    @ObservationIgnored private var sitClock: Task<Void, Never>? = nil
    @ObservationIgnored private var widgetReload: Task<Void, Never>? = nil
    @ObservationIgnored nonisolated(unsafe) private var observers: [NSObjectProtocol] = []

    /// `persist: false` for previews, tests and the -NPMock screenshots
    /// (nothing is read or written, and no notifications).
    public convenience init(day: DayData? = nil, persist: Bool = true) {
        self.init(day: day, fileURL: persist ? DayFile.url : nil, chatURL: persist ? DayStore.defaultChatURL() : nil,
                  reminders: persist ? DayStore.systemReminders() : nil)
    }

    init(day: DayData?, fileURL: URL?, chatURL: URL?, reminders: (any SitReminderScheduling)? = nil, now: Date = Date()) {
        self.fileURL = fileURL
        self.chatURL = chatURL
        self.reminders = reminders
        var d = day ?? fileURL.flatMap { DayFile.load(from: $0) } ?? .starter
        let rolled = d.rollOver(now: now)
        self.day = d
        self.knownCheckinIDs = Set(d.checkins.map(\.id))
        self.chat = chatURL.flatMap(Self.loadChat) ?? []
        if fileURL == nil { applyLaunchDemo(now: now) }
        if rolled { save() }
        startSitClockIfNeeded()
        observeApp()
    }

    deinit {
        for o in observers { NotificationCenter.default.removeObserver(o) }
    }

    /// False for previews and mock screenshots.
    public var isPersistent: Bool { fileURL != nil }

    /// Where the slider knob rests (nil before the first check-in).
    public var sliderLevel: Double? { day.sliderLevel }

    // MARK: Check-ins

    /// A check-in from the slider (with its level) or a button (no level).
    public func checkIn(_ state: NervousState, level: Double? = nil, at: Date = Date()) {
        mutate { $0.recordCheckIn(state, level: level, at: at, now: Date()) }
    }

    // MARK: Minimum viable day

    public func toggleTask(_ id: String) { mutate { $0.toggleTask(id) } }

    public func setTask(_ id: String, done: Bool) { mutate { $0.setTask(id, done: done) } }

    /// False when the title is empty or the day already holds five things.
    @discardableResult
    public func addTask(_ title: String) -> Bool {
        var added = false
        mutate { added = $0.addTask(title) }
        return added
    }

    public func removeTask(_ id: String) { mutate { $0.removeTask(id) } }

    public func renameTask(_ id: String, to title: String) { mutate { $0.renameTask(id, to: title) } }

    // MARK: Anchors

    /// Adds a new anchor or updates one with the same id.
    public func saveAnchor(_ anchor: DayAnchor) { mutate { $0.saveAnchor(anchor) } }

    public func removeAnchor(_ id: String) { mutate { $0.removeAnchor(id) } }

    public func setAnchor(_ id: String, status: DayAnchor.Status) { mutate { $0.setAnchor(id, status: status) } }

    /// The next anchor still to come today, if any.
    public func nextAnchor(after now: Date = Date(), calendar: Calendar = .current) -> DayAnchor? {
        day.nextAnchor(now: now, calendar: calendar)
    }

    // MARK: Brain dump

    @discardableResult
    public func addDump(_ text: String) -> DumpItem? {
        var item: DumpItem?
        mutate { item = $0.addDump(text) }
        return item
    }

    @discardableResult
    public func removeDump(_ id: String) -> DumpItem? {
        var item: DumpItem?
        mutate { item = $0.removeDump(id) }
        return item
    }

    public func restoreDump(_ item: DumpItem) { mutate { $0.restoreDump(item) } }

    // MARK: Sit with me

    /// Starts a block (replacing any other) and sets the notification for
    /// its end — asking for permission the first time. The clock never waits
    /// for that answer.
    @discardableResult
    public func startSit(minutes: Int, label: String = "", taskID: String? = nil, anchorID: String? = nil) -> SitSession {
        var d = day
        d.rollOver(now: Date())
        let s = d.startSit(minutes: minutes, label: label, taskID: taskID, anchorID: anchorID)
        day = d
        save()
        sitClock?.cancel() // a clock left from an earlier block may be napping for 30 s
        sitClock = nil
        startSitClockIfNeeded()
        scheduleSitReminder(for: s)
        return s
    }

    public func answerSitCheckIn(_ answer: SitSession.CheckIn) { mutate { $0.answerSitCheckIn(answer) } }

    /// "I’m done" or "Stop": the block ends now; Pal offers to note it.
    public func endSit() {
        mutate { $0.endSit(.done) }
        cancelSitReminder()
    }

    /// Over without a note ("Not now").
    public func clearSit() {
        mutate { $0.clearSit() }
        cancelSitReminder()
    }

    public func saveSitNote(_ note: String) {
        mutate { $0.saveSitNote(note) }
        cancelSitReminder()
    }

    /// The sit screen appeared, or the app came back: is the running block's
    /// end still going to be announced? Never asks for permission.
    public func refreshSitReminder() {
        guard let reminders, let s = day.sit, s.isRunning,
              schedulingSitID != s.id // just started: still being set up (maybe asking)
        else { return }
        let notice = PalLogic.sitEndNotice(minutes: s.minutes, pal: pal)
        reminderTask = Task { [weak self] in
            let state = await reminders.refresh(s, title: notice.title, body: notice.body)
            guard let self, self.day.sit?.id == s.id, self.day.sit?.isRunning == true else { return }
            self.sitReminder = state
        }
    }

    private func scheduleSitReminder(for s: SitSession) {
        sitReminder = .unknown
        guard let reminders else { return }
        reminders.cancel() // the block this one replaces
        let notice = PalLogic.sitEndNotice(minutes: s.minutes, pal: pal)
        schedulingSitID = s.id
        reminderTask = Task { [weak self] in
            let state = await reminders.schedule(s, title: notice.title, body: notice.body) { [weak self] in
                self?.day.sit?.id == s.id && self?.day.sit?.isRunning == true
            }
            guard let self else { return }
            if self.schedulingSitID == s.id { self.schedulingSitID = nil }
            guard self.day.sit?.id == s.id else { return }
            self.sitReminder = state
        }
    }

    private func cancelSitReminder() {
        reminders?.cancel()
        sitReminder = .unknown
    }

    // MARK: Pal's chat

    public func appendChat(_ line: PalChatLine) {
        guard !line.text.isEmpty else { return }
        chat.append(line)
        if chat.count > Self.chatKeep { chat.removeFirst(chat.count - Self.chatKeep) }
        saveChat()
    }

    public func clearChat() {
        chat = []
        saveChat()
    }

    // MARK: Anything else

    public func update(_ change: (inout DayData) -> Void) { mutate(change) }

    /// The app came back: take in the check-ins a widget wrote into day.json
    /// meanwhile — merged by id, never by replacing what this copy holds —
    /// and roll the day over if the date changed. Only check-ins come from
    /// other processes; everything else here is the app's own and stays.
    public func reloadFromDisk(now: Date = Date()) {
        guard let url = fileURL, let disk = DayFile.load(from: url) else {
            rollOverIfNeeded(now: now)
            return
        }
        var d = day
        d.mergeCheckins(from: disk, known: knownCheckinIDs)
        let rolled = d.rollOver(now: now)
        if d != day { day = d }
        knownCheckinIDs.formUnion(disk.checkins.map(\.id))
        // The file lacks a check-in this copy has (or the day rolled): write
        // the union. (Ids, not whole days: the file keeps dates to the millisecond.)
        if rolled || Set(day.checkins.map(\.id)) != Set(disk.checkins.map(\.id)) { save() }
        startSitClockIfNeeded()
        tickSit(now: now)
        refreshSitReminder()
    }

    /// Midnight passed while the app was open.
    public func rollOverIfNeeded(now: Date = Date()) {
        var d = day
        guard d.rollOver(now: now) else { return }
        day = d
        save()
    }

    // MARK: - Saving

    private func mutate(_ change: (inout DayData) -> Void) {
        var d = day
        d.rollOver(now: Date())
        change(&d)
        guard d != day else { return }
        day = d
        save()
    }

    private func save() {
        guard let url = fileURL else { return }
        // A widget may have written check-ins since we last touched the file:
        // merge them in (same rule, same ids) instead of overwriting them —
        // read, merge and write under the file coordinator, so the widget
        // can't write in between.
        let known = knownCheckinIDs
        let mine = day
        let written = DayFile.update(at: url) { disk in
            var d = mine
            if let disk { d.mergeCheckins(from: disk, known: known) }
            return d
        }
        if written != day { day = written }
        knownCheckinIDs.formUnion(written.checkins.map(\.id))
        reloadWidgets()
    }

    private func saveChat() {
        guard let url = chatURL, let data = try? JSONEncoder.neuropal.encode(chat) else { return }
        #if os(iOS)
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try? data.write(to: url, options: [.atomic])
        #endif
    }

    private nonisolated static func loadChat(_ url: URL) -> [PalChatLine]? {
        guard let data = try? Data(contentsOf: url),
              let lines = try? JSONDecoder.neuropal.decode([Lenient<PalChatLine>].self, from: data)
        else { return nil }
        return Array(lines.compactMap(\.value).suffix(chatKeep))
    }

    /// pal-chat.json in the app's own Application Support folder: the chat
    /// never goes to the App Group (the widgets have no use for it).
    private nonisolated static func defaultChatURL() -> URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "NeuroPal", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
        return support.appending(path: chatFileName)
    }

    /// The system's notifications (the app); none on macOS (the tests).
    private static func systemReminders() -> (any SitReminderScheduling)? {
        #if os(iOS)
        return SystemSitReminders()
        #else
        return nil
        #endif
    }

    private func reloadWidgets() {
        #if os(iOS) && canImport(WidgetKit)
        widgetReload?.cancel()
        widgetReload = Task {
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled else { return }
            WidgetCenter.shared.reloadAllTimelines()
        }
        #endif
    }

    // MARK: - The "Sit with me" clock

    private func startSitClockIfNeeded() {
        guard day.sit != nil else {
            sitClock?.cancel()
            sitClock = nil
            return
        }
        guard sitClock == nil else { return }
        sitClock = Task { [weak self] in
            while !Task.isCancelled {
                let running = self?.day.sit?.isRunning ?? false
                try? await Task.sleep(for: .seconds(running ? 1 : 30))
                guard let self, !Task.isCancelled else { return }
                self.tickSit(now: Date())
                if self.day.sit == nil {
                    self.sitClock = nil
                    return
                }
            }
        }
    }

    private func tickSit(now: Date) {
        var d = day
        guard let event = d.tickSit(now: now) else { return }
        day = d
        save()
        sitEvent = SitEventStamp(event: event, at: now)
        switch event {
        case .ended: sitReminder = .unknown // the notification (if any) says it by itself
        case .forgotten: cancelSitReminder() // nothing left to note: clear it from Notification Center too
        case .checkInAsked: break
        }
        say(event)
    }

    /// VoiceOver hears the check-in and the end, wherever the user is.
    private func say(_ event: SitEvent) {
        let line: String
        switch event {
        case .checkInAsked: line = "\(pal.name): \(Tokens.palSay(pal, "sitCheck"))"
        case .ended: line = "\(pal.name): \(Tokens.palSay(pal, "sitEnd"))"
        case .forgotten: return
        }
        #if canImport(UIKit)
        UIAccessibility.post(notification: .announcement, argument: line)
        #else
        _ = line
        #endif
    }

    // MARK: - App lifecycle

    private func observeApp() {
        #if canImport(UIKit)
        guard fileURL != nil else { return }
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil,
                                            queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.reloadFromDisk() }
        })
        observers.append(center.addObserver(forName: UIApplication.significantTimeChangeNotification, object: nil,
                                            queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.rollOverIfNeeded() }
        })
        #endif
    }

    // MARK: - Screenshots

    /// Mock launches only (-NPMock 1, nothing persisted): optional launch
    /// arguments that put the day in a state worth a screenshot.
    ///   -NPCheckIn green|yellow|red   a check-in now (and two earlier today)
    ///   -NPSitMinutes 25              a "Sit with me" block running for 6 min
    ///   -NPSitReminder off|scheduled  with it: notifications off (the sit says so) or set
    ///   -NPPalChat 1 | crisis         a short chat with Pal (or one the safety net answered)
    ///   -NPPalDump 1                  a few brain-dump lines
    private func applyLaunchDemo(now: Date) {
        if let raw = DebugLaunch.string("NPCheckIn"), let state = NervousState(rawValue: raw) {
            var d = day
            let cal = Calendar.current
            let morning = cal.date(bySettingHour: 8, minute: 5, second: 0, of: now) ?? now
            let noon = cal.date(bySettingHour: 12, minute: 40, second: 0, of: now) ?? now
            if morning < now { d.recordCheckIn(.green, level: 0.12, at: morning, now: now) }
            if noon < now { d.recordCheckIn(.yellow, level: 0.46, at: noon, now: now) }
            d.recordCheckIn(state, level: state.middleLevel + 0.03, at: now, now: now)
            day = d
        }
        let minutes = DebugLaunch.int("NPSitMinutes") ?? 0
        if minutes > 0 {
            var d = day
            d.startSit(minutes: minutes, label: "Intro of the thesis", taskID: nil, now: now.addingTimeInterval(-6 * 60))
            day = d
            switch DebugLaunch.string("NPSitReminder") {
            case "off": sitReminder = .off
            case "scheduled": sitReminder = .scheduled
            default: break
            }
        }
        if DebugLaunch.bool("NPPalDump") {
            var d = day
            d.addDump("Email the lab about the SPAD array time slot", now: now.addingTimeInterval(-3600))
            d.addDump("Buy coffee filters", now: now.addingTimeInterval(-1800))
            d.addDump("That idea about correlation imaging with two cameras", now: now.addingTimeInterval(-300))
            day = d
        }
        if DebugLaunch.string("NPPalChat") == "crisis" {
            chat = [
                PalChatLine(role: .user, text: "I don’t want to be here anymore", at: now.addingTimeInterval(-60)),
                PalChatLine(role: .pal, text: PalLogic.crisisReply, at: now.addingTimeInterval(-59), crisis: true, local: true),
            ]
        } else if DebugLaunch.bool("NPPalChat") {
            chat = [
                PalChatLine(role: .user, text: "Everything feels loud today and I can’t start the paper.",
                            at: now.addingTimeInterval(-120)),
                PalChatLine(role: .pal, text: "That sounds like a lot to hold at once. Want to pick just the next small "
                                + "thing together? Opening the paper counts.", at: now.addingTimeInterval(-110)),
            ]
        }
    }
}

/// One line of Pal's chat.
public struct PalChatLine: Codable, Hashable, Sendable, Identifiable {
    public enum Role: String, Codable, Sendable { case user, pal }

    public var id: String
    public var role: Role
    public var text: String
    public var at: Date
    /// Pal's careful crisis answer: shows the calming steps and help lines.
    public var crisis: Bool
    /// Written on this device (the crisis answer or an offline line), not by the server.
    public var local: Bool

    public init(id: String = UUID().uuidString, role: Role, text: String, at: Date = Date(), crisis: Bool = false,
                local: Bool = false) {
        self.id = id
        self.role = role
        self.text = String(text.prefix(4000))
        self.at = at
        self.crisis = crisis
        self.local = local
    }
}

/// A "Sit with me" event with when it happened (so two equal events differ).
public struct SitEventStamp: Equatable, Sendable {
    public let event: SitEvent
    public let at: Date
}

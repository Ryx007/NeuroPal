import Foundation
@_exported import NPCore

/// The nervous-system check-in: green "Okay", yellow "Bit off", red "Overwhelmed".
/// Never shown by colour alone: every state has a word and a shape
/// (circle / triangle / square), as in the Expo app (stateScale.js).
public enum NervousState: String, Codable, CaseIterable, Hashable, Sendable {
    case green, yellow, red

    /// The short word (slider, widgets, legends).
    public var label: String {
        switch self {
        case .green: return "Okay"
        case .yellow: return "Bit off"
        case .red: return "Overwhelmed"
        }
    }

    /// The longer words of the Home state buttons.
    public var buttonLabel: String {
        switch self {
        case .green: return "I feel okay"
        case .yellow: return "A bit off"
        case .red: return "Overwhelmed"
        }
    }

    /// What VoiceOver says for the state buttons.
    public var spokenLabel: String {
        switch self {
        case .green: return "I feel okay"
        case .yellow: return "Feeling a bit off"
        case .red: return "Help, I'm overwhelmed"
        }
    }

    /// The shape cue that goes with the colour.
    public var shape: StateShape {
        switch self {
        case .green: return .circle
        case .yellow: return .triangle
        case .red: return .square
        }
    }

    /// Pal's face mirrors the state.
    public var mood: PalMood {
        switch self {
        case .green: return .okay
        case .yellow: return .off
        case .red: return .over
        }
    }

    /// Region edges on the 0…1 slider (REGION_EDGES in stateScale.js): the
    /// 0–100 number always agrees with the region — 0–33 okay, 34–66 bit
    /// off, 67–100 overwhelmed.
    public static let lowerEdge = 0.335
    public static let upperEdge = 0.665

    /// The slider region a level 0…1 falls in (0 = calm end).
    public static func forLevel(_ level: Double) -> NervousState {
        let l = level.isFinite ? min(1, max(0, level)) : 0
        return l < lowerEdge ? .green : (l < upperEdge ? .yellow : .red)
    }

    /// The middle of this state's slider region (STATE_REGIONS[].middle).
    public var middleLevel: Double {
        switch self {
        case .green: return 0.17
        case .yellow: return 0.5
        case .red: return 0.83
        }
    }

    /// One step towards overwhelmed (VoiceOver "increment").
    public var next: NervousState? {
        switch self {
        case .green: return .yellow
        case .yellow: return .red
        case .red: return nil
        }
    }

    /// One step towards okay (VoiceOver "decrement").
    public var previous: NervousState? {
        switch self {
        case .green: return nil
        case .yellow: return .green
        case .red: return .yellow
        }
    }

    /// Where the slider knob rests for a stored check-in (levelFor): the
    /// exact level when it agrees with the state, otherwise the middle of the
    /// state's region; nil before the first check-in.
    public static func sliderLevel(state: NervousState?, level: Double?) -> Double? {
        guard let state else { return nil }
        if let level, level.isFinite, forLevel(level) == state { return min(1, max(0, level)) }
        return state.middleLevel
    }

    /// 0–1 → the 0–100 number people see.
    public static func value(_ level: Double) -> Int {
        Int((min(1, max(0, level.isFinite ? level : 0)) * 100).rounded())
    }
}

/// The shape that goes with a state (StateGlyph).
public enum StateShape: String, Sendable, Hashable { case circle, triangle, square }

/// Pal's face: mirrors the check-in (narrower, dimmer visor when overwhelmed).
public enum PalMood: String, Sendable, Hashable {
    case okay, off, over

    public init(_ state: NervousState?) { self = state?.mood ?? .okay }
}

/// One check-in: the state, the exact slider level, when.
public struct CheckIn: Codable, Hashable, Sendable, Identifiable {
    public var id: UUID
    public var state: NervousState
    /// 0…1 on the Home slider (nil for a check-in from a button or widget).
    public var level: Double?
    public var at: Date

    public init(id: UUID = UUID(), state: NervousState, level: Double? = nil, at: Date = Date()) {
        self.id = id
        self.state = state
        self.level = level
        self.at = at
    }
}

/// A timed anchor in the day (medication, a break, an appointment).
public struct DayAnchor: Codable, Hashable, Sendable, Identifiable {
    public enum Status: String, Codable, Sendable { case upcoming, done, skipped }

    public var id: String
    public var title: String
    public var subtitle: String?
    public var hour: Int
    public var minute: Int
    /// The ADHD-friendly window either side of the time, in minutes.
    public var flexMinutes: Int
    /// The server's Anchor categories (AnchorCategory.all): "medication" |
    /// "meal" | "movement" | "focus" | "social" | "rest" | "wind-down" | "custom".
    public var category: String
    public var status: Status

    public init(id: String = UUID().uuidString, title: String, subtitle: String? = nil, hour: Int, minute: Int,
                flexMinutes: Int = DayAnchor.defaultFlex, category: String = "custom", status: Status = .upcoming) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.hour = hour
        self.minute = minute
        self.flexMinutes = flexMinutes
        self.category = category
        self.status = status
    }

    /// The server's default window (windowMinutesBefore/After = 30).
    public static let defaultFlex = 30
    /// Windows the editor offers, in minutes (0 = exactly on time).
    public static let flexChoices = [0, 10, 15, 30, 45, 60, 90, 120]

    /// Minutes after midnight.
    public var minuteOfDay: Int { hour * 60 + minute }

    /// "08:30"
    public var clock: String { String(format: "%02d:%02d", hour, minute) }

    public var kind: AnchorCategory { AnchorCategory.of(category) }

    enum CodingKeys: String, CodingKey { case id, title, subtitle, hour, minute, flexMinutes, category, status }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? UUID().uuidString
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? ""
        subtitle = try? c.decodeIfPresent(String.self, forKey: .subtitle)
        hour = min(23, max(0, (try? c.decodeIfPresent(Int.self, forKey: .hour)) ?? 9))
        minute = min(59, max(0, (try? c.decodeIfPresent(Int.self, forKey: .minute)) ?? 0))
        flexMinutes = min(240, max(0, (try? c.decodeIfPresent(Int.self, forKey: .flexMinutes)) ?? Self.defaultFlex))
        category = (try? c.decodeIfPresent(String.self, forKey: .category)) ?? "custom"
        status = (try? c.decodeIfPresent(Status.self, forKey: .status)) ?? .upcoming
    }
}

/// An anchor's kind: the server's category, a word and an SF Symbol.
public struct AnchorCategory: Hashable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let symbol: String

    public init(id: String, label: String, symbol: String) {
        self.id = id
        self.label = label
        self.symbol = symbol
    }

    /// The editor's choices — the backend Anchor.category enum, with the
    /// Expo planner's words where it had them (Meds, Break, Study, Move, Other).
    public static let all: [AnchorCategory] = [
        AnchorCategory(id: "medication", label: "Meds", symbol: "pills.fill"),
        AnchorCategory(id: "meal", label: "Meal", symbol: "fork.knife"),
        AnchorCategory(id: "rest", label: "Break", symbol: "cup.and.saucer.fill"),
        AnchorCategory(id: "focus", label: "Study", symbol: "book.fill"),
        AnchorCategory(id: "movement", label: "Move", symbol: "figure.walk"),
        AnchorCategory(id: "social", label: "People", symbol: "person.2.fill"),
        AnchorCategory(id: "wind-down", label: "Wind down", symbol: "moon.stars.fill"),
        AnchorCategory(id: "custom", label: "Other", symbol: "flag.fill"),
    ]

    public static func of(_ id: String) -> AnchorCategory {
        all.first { $0.id == id } ?? legacy[id] ?? all[all.count - 1]
    }

    /// Categories an older build of the app wrote.
    private static let legacy: [String: AnchorCategory] = [
        "morning": AnchorCategory(id: "morning", label: "Morning", symbol: "sunrise.fill"),
        "transition": AnchorCategory(id: "transition", label: "Transition", symbol: "arrow.left.arrow.right"),
        "evening": AnchorCategory(id: "evening", label: "Evening", symbol: "moon.fill"),
    ]
}

/// One item of the minimum viable day (3–5 core items, reset each morning).
public struct DayTask: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var done: Bool

    public init(id: String = UUID().uuidString, title: String, done: Bool = false) {
        self.id = id
        self.title = title
        self.done = done
    }
}

/// One brain-dump line (Pal's Brain dump), newest first.
public struct DumpItem: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var text: String
    public var at: Date

    public init(id: String = UUID().uuidString, text: String, at: Date = Date()) {
        self.id = id
        self.text = text
        self.at = at
    }
}

/// "Sit with me": body doubling. Pal keeps you company for a block of time,
/// checks in now and then, and offers to note what you did at the end.
/// The Home Focus tile shows the same block.
public struct SitSession: Codable, Hashable, Sendable, Identifiable {
    public enum CheckIn: String, Codable, Sendable { case asked, yes, no }
    public enum EndReason: String, Codable, Sendable {
        /// The time ran out.
        case time
        /// The user said they were done, or stopped.
        case done
    }

    public var id: String
    public var minutes: Int
    /// What the user is working on ("" = just company).
    public var label: String
    public var taskID: String?
    public var anchorID: String?
    public var startedAt: Date
    public var endsAt: Date
    /// The check-in being asked now, or the answer to the last one.
    public var checkIn: CheckIn?
    /// Check-ins asked so far (see `checkInTimes`).
    public var checkInsAsked: Int
    public var endedAt: Date?
    public var endReason: EndReason?

    public init(id: String = UUID().uuidString, minutes: Int, label: String = "", taskID: String? = nil,
                anchorID: String? = nil, startedAt: Date, endsAt: Date) {
        self.id = id
        self.minutes = minutes
        self.label = label
        self.taskID = taskID
        self.anchorID = anchorID
        self.startedAt = startedAt
        self.endsAt = endsAt
        self.checkIn = nil
        self.checkInsAsked = 0
        self.endedAt = nil
        self.endReason = nil
    }

    public var isRunning: Bool { endedAt == nil }

    /// When Pal checks in: halfway for blocks up to 25 minutes, every 15
    /// minutes for longer ones — never in the last minute.
    public var checkInTimes: [Date] {
        let length = endsAt.timeIntervalSince(startedAt)
        guard length > 0 else { return [] }
        let points: [TimeInterval] = length <= 25 * 60
            ? [length / 2]
            : Array(stride(from: 15 * 60.0, to: length - 5 * 60, by: 15 * 60))
        return points.map { startedAt.addingTimeInterval($0) }.filter { endsAt.timeIntervalSince($0) > 60 }
    }

    /// 0…1 of the block done at `now`.
    public func fractionDone(at now: Date) -> Double {
        let total = max(1, endsAt.timeIntervalSince(startedAt))
        return min(1, max(0, now.timeIntervalSince(startedAt) / total))
    }

    /// Whole minutes the user actually spent (≥ 1).
    public var minutesSpent: Int {
        max(1, Int(((endedAt ?? endsAt).timeIntervalSince(startedAt) / 60).rounded()))
    }

    /// "12 min left" | "under a minute left" | "time’s up" (leftLabel in sitControl.js).
    public func leftLabel(at now: Date) -> String {
        let s = endsAt.timeIntervalSince(now)
        if s <= 0 { return "time’s up" }
        if s < 60 { return "under a minute left" }
        return "\(Int((s / 60).rounded(.up))) min left"
    }

    /// Whole minutes left, rounded up (0 when over).
    public func minutesLeft(at now: Date) -> Int {
        max(0, Int((endsAt.timeIntervalSince(now) / 60).rounded(.up)))
    }
}

/// A finished sit the user wrote a note about ("Last time: 25 min · intro").
public struct SitNote: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var minutes: Int
    public var label: String
    public var note: String
    public var at: Date

    public init(id: String = UUID().uuidString, minutes: Int, label: String, note: String, at: Date = Date()) {
        self.id = id
        self.minutes = minutes
        self.label = label
        self.note = note
        self.at = at
    }
}

/// Everything about today, saved as day.json in the shared container (the
/// widgets read it, and the check-in widget writes check-ins into it).
public struct DayData: Codable, Hashable, Sendable {
    public var state: NervousState?
    /// The exact slider level of the current state (nil = a button or
    /// widget check-in; the knob then rests in the middle of the region).
    public var level: Double?
    /// Newest last; capped at `checkinCap` (see DayRules.swift).
    public var checkins: [CheckIn]
    public var tasks: [DayTask]
    /// Sorted by time of day.
    public var anchors: [DayAnchor]
    /// "yyyy-MM-dd" of the day the checkmarks belong to.
    public var dayStamp: String
    /// Brain-dump lines, newest first.
    public var dump: [DumpItem]
    /// The running (or just-finished) "Sit with me" block.
    public var sit: SitSession?
    /// Notes about finished sits, newest first.
    public var sitNotes: [SitNote]

    public init(state: NervousState? = nil, level: Double? = nil, checkins: [CheckIn] = [], tasks: [DayTask] = [],
                anchors: [DayAnchor] = [], dayStamp: String = DayData.stamp(Date()), dump: [DumpItem] = [],
                sit: SitSession? = nil, sitNotes: [SitNote] = []) {
        self.state = state
        self.level = level
        self.checkins = checkins
        self.tasks = tasks
        self.anchors = anchors
        self.dayStamp = dayStamp
        self.dump = dump
        self.sit = sit
        self.sitNotes = sitNotes
    }

    public static func stamp(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// A first-run day: three starter tasks and four anchors.
    public static let starter = DayData(
        tasks: [
            DayTask(id: "t1", title: "Take meds with breakfast"),
            DayTask(id: "t2", title: "Read one section of the CPI paper"),
            DayTask(id: "t3", title: "Reply to one email"),
        ],
        anchors: [
            DayAnchor(id: "a1", title: "Morning meds", subtitle: "With water", hour: 8, minute: 30, flexMinutes: 15,
                      category: "medication"),
            DayAnchor(id: "a2", title: "Deep work block", subtitle: "Phone in the other room", hour: 10, minute: 0,
                      category: "focus"),
            DayAnchor(id: "a3", title: "Lunch + walk", hour: 13, minute: 0, category: "meal"),
            DayAnchor(id: "a4", title: "Wind down", hour: 21, minute: 30, category: "wind-down"),
        ])

    // Lenient decoding: an older save (or a hand-edited file) never loses
    // the day — malformed parts are dropped, never thrown.
    enum CodingKeys: String, CodingKey { case state, level, checkins, tasks, anchors, dayStamp, dump, sit, sitNotes }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        state = try? c.decodeIfPresent(NervousState.self, forKey: .state)
        level = Self.cleanLevel(try? c.decodeIfPresent(Double.self, forKey: .level))
        let rawCheckins = (try? c.decodeIfPresent([Lenient<CheckIn>].self, forKey: .checkins)) ?? []
        checkins = rawCheckins.compactMap(\.value)
            .map { var x = $0; x.level = Self.cleanLevel(x.level); return x }
            .sorted { $0.at < $1.at }
            .suffix(Self.checkinCap)
            .map { $0 }
        tasks = ((try? c.decodeIfPresent([Lenient<DayTask>].self, forKey: .tasks)) ?? []).compactMap(\.value)
        anchors = ((try? c.decodeIfPresent([Lenient<DayAnchor>].self, forKey: .anchors)) ?? []).compactMap(\.value)
            .filter { !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .sorted { $0.minuteOfDay < $1.minuteOfDay }
        dayStamp = (try? c.decodeIfPresent(String.self, forKey: .dayStamp)) ?? Self.stamp(Date())
        // The first builds saved the brain dump as plain strings.
        if let lines = try? c.decodeIfPresent([String].self, forKey: .dump) {
            dump = lines.map { DumpItem(text: $0) }
        } else if let items = try? c.decodeIfPresent([Lenient<DumpItem>].self, forKey: .dump) {
            dump = items.compactMap(\.value)
        } else {
            dump = []
        }
        dump = Array(dump.prefix(Self.dumpCap))
        sit = try? c.decodeIfPresent(SitSession.self, forKey: .sit)
        sitNotes = Array((((try? c.decodeIfPresent([Lenient<SitNote>].self, forKey: .sitNotes)) ?? [])
            .compactMap(\.value)).prefix(Self.sitNotesCap))
    }

    static func cleanLevel(_ value: Double?) -> Double? {
        guard let value, value.isFinite else { return nil }
        return min(1, max(0, value))
    }
}

/// Decodes one element of an array, or nil if that element is malformed.
struct Lenient<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

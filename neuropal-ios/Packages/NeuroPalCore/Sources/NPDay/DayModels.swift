import Foundation
@_exported import NPCore

/// The nervous-system check-in: green "Okay", yellow "Bit off", red "Overwhelmed".
public enum NervousState: String, Codable, CaseIterable, Hashable, Sendable {
    case green, yellow, red

    public var label: String {
        switch self {
        case .green: return "Okay"
        case .yellow: return "Bit off"
        case .red: return "Overwhelmed"
        }
    }

    /// The slider region a level 0…1 falls in (0 = calm end).
    public static func forLevel(_ level: Double) -> NervousState {
        level < 1.0 / 3 ? .green : (level < 2.0 / 3 ? .yellow : .red)
    }

    /// The middle of this state's slider region.
    public var middleLevel: Double {
        switch self {
        case .green: return 1.0 / 6
        case .yellow: return 0.5
        case .red: return 5.0 / 6
        }
    }
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
    /// The ADHD-friendly window either side of the time.
    public var flexMinutes: Int
    /// "morning" | "transition" | "evening" | "medication" | "custom"
    public var category: String
    public var status: Status

    public init(id: String = UUID().uuidString, title: String, subtitle: String? = nil, hour: Int, minute: Int,
                flexMinutes: Int = 15, category: String = "custom", status: Status = .upcoming) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.hour = hour
        self.minute = minute
        self.flexMinutes = flexMinutes
        self.category = category
        self.status = status
    }
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

/// Everything about today, saved as day.json in the shared container.
public struct DayData: Codable, Hashable, Sendable {
    public var state: NervousState?
    public var level: Double?
    /// Newest last; capped (see DayStore).
    public var checkins: [CheckIn]
    public var tasks: [DayTask]
    public var anchors: [DayAnchor]
    /// "yyyy-MM-dd" of the day the checkmarks belong to.
    public var dayStamp: String
    /// Brain-dump lines (Pal's sheet).
    public var dump: [String]

    public init(state: NervousState? = nil, level: Double? = nil, checkins: [CheckIn] = [], tasks: [DayTask] = [],
                anchors: [DayAnchor] = [], dayStamp: String = DayData.stamp(Date()), dump: [String] = []) {
        self.state = state
        self.level = level
        self.checkins = checkins
        self.tasks = tasks
        self.anchors = anchors
        self.dayStamp = dayStamp
        self.dump = dump
    }

    public static func stamp(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// A first-run day: the same starter tasks and anchors as the Expo app.
    public static let starter = DayData(
        tasks: [
            DayTask(id: "t1", title: "Take meds with breakfast"),
            DayTask(id: "t2", title: "Read one section of the CPI paper"),
            DayTask(id: "t3", title: "Reply to one email"),
        ],
        anchors: [
            DayAnchor(id: "a1", title: "Morning meds", hour: 8, minute: 30, category: "medication"),
            DayAnchor(id: "a2", title: "Deep work block", subtitle: "Phone in the other room", hour: 10, minute: 0,
                      flexMinutes: 30, category: "transition"),
            DayAnchor(id: "a3", title: "Lunch + walk", hour: 13, minute: 0, flexMinutes: 30, category: "transition"),
            DayAnchor(id: "a4", title: "Wind down", hour: 21, minute: 30, category: "evening"),
        ])
}

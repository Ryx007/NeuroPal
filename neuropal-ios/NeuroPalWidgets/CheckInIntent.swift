import AppIntents
import NPDay

/// A check-in from the Home Screen, without opening the app: the widget's
/// Okay / Bit off buttons. It writes into day.json with the app's own rule
/// (DayFile → DayRules: the one-minute merge, time order), coordinated with
/// the app's own writes, and WidgetKit redraws the widgets after it runs.
/// The app picks the check-in up when it next comes to the foreground.
///
/// A locked device (StandBy, the Lock Screen) asks to unlock first: how
/// someone feels is theirs to record, not anyone's who picks up the phone.
///
/// Overwhelmed is not an intent: the widget links to neuropal://calm, which
/// opens the calming steps (a link can only navigate, never record).
struct CheckInIntent: AppIntent {
    static let title: LocalizedStringResource = "Check in"
    static let description = IntentDescription("Tell NeuroPal how you are right now.")
    static let isDiscoverable = false
    static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

    @Parameter(title: "State")
    var state: String

    init() {}

    init(state: NervousState) {
        self.state = state.rawValue
    }

    func perform() async throws -> some IntentResult {
        if let s = NervousState(rawValue: state), s != .red {
            DayFile.recordCheckIn(s)
        }
        return .result()
    }
}

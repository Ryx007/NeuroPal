import Foundation

/// People to call — shown in the calming steps and under Pal's crisis
/// answer. Works offline: nothing here is fetched.
public struct HelpLine: Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    /// As printed: "02 2327 2327".
    public let number: String
    /// What to dial: "0223272327".
    public let dial: String
    public let note: String

    public init(id: String, name: String, number: String, dial: String, note: String) {
        self.id = id
        self.name = name
        self.number = number
        self.dial = dial
        self.note = note
    }

    /// tel: link for the dial button.
    public var url: URL? { URL(string: "tel:\(dial)") }
}

public enum HelpLines {
    public static let all: [HelpLine] = [
        HelpLine(id: "it-112", name: "Emergency (Italy)", number: "112", dial: "112",
                 note: "If you might act on these thoughts or you’re in danger."),
        HelpLine(id: "it-telefono-amico", name: "Telefono Amico Italia", number: "02 2327 2327", dial: "0223272327",
                 note: "Someone to talk to, in Italian."),
    ]

    /// For everyone outside Italy.
    public static let elsewhere = "Elsewhere, call your local emergency number."
}

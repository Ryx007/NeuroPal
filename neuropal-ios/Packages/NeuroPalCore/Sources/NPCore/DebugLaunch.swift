import Foundation

/// Launch arguments for screenshots and UI checks (`-NPMock 1`,
/// `-NPScreen reader`, `-NPSettingsPane account`, …).
///
/// Read from THIS launch's process arguments only — never from saved
/// settings — and only in debug builds: a Release build ignores them all,
/// so nothing a user (or another app) can pass at launch changes how the
/// shipped app behaves.
public enum DebugLaunch {
    /// The value after `-<name>`; nil when absent, and always nil in a Release build.
    public static func string(_ name: String) -> String? {
        #if DEBUG
        return value(name, in: ProcessInfo.processInfo.arguments)
        #else
        return nil
        #endif
    }

    /// `-<name> 1` (also YES / true).
    public static func bool(_ name: String) -> Bool {
        guard let v = string(name)?.lowercased() else { return false }
        return v == "1" || v == "yes" || v == "true"
    }

    /// `-<name> 25`
    public static func int(_ name: String) -> Int? {
        string(name).flatMap { Int($0.trimmingCharacters(in: .whitespaces)) }
    }

    /// `-NPMock 1`: the app runs on the offline fixtures. Feature-level
    /// switches act only in this mode.
    public static var mock: Bool { bool("NPMock") }

    /// The value after `-<name>` in an argument list (the first entry is the
    /// program itself).
    static func value(_ name: String, in arguments: [String]) -> String? {
        let flag = "-" + name
        guard let i = arguments.dropFirst().firstIndex(of: flag), i + 1 < arguments.count else { return nil }
        return arguments[i + 1]
    }
}

import Foundation

/// Pal's offline logic: what to suggest now, steps when the server can't
/// break a task down, and the crisis check that runs BEFORE any message
/// leaves the phone. SKELETON — the Home+Pal agent ports these from
/// neuropal-expo-app/src/services/palAssistant.js (the crisis pattern must
/// match neuropal-backend/src/routes/pal.js CRISIS).
public enum PalLogic {
    /// True when a message sounds like a crisis: the app shows the calming
    /// steps and help lines and never sends it to a model.
    public static func soundsLikeCrisis(_ text: String) -> Bool {
        false // SKELETON
    }

    /// Template steps used when the server is unreachable (the app says so).
    public static func offlineSteps(for task: String) -> [String] {
        ["Look at “\(task)” for one minute.", "Do the smallest first piece.", "Take a short break, then decide what's next."]
    }
}

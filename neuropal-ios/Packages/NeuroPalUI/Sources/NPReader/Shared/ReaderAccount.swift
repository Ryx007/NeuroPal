import Foundation
import NPCore

/// The reader's part of forgetting an account when its session ends (the
/// app calls this from `AppSession.onSessionEnd`, beside
/// `AccountTraces.remove()`): the voice stops and lets go of the text, the
/// lock screen clears, and pending hand-offs to Ask are dropped.
public enum ReaderAccount {
    @MainActor public static func forget() {
        ReadAloudPlayer.shared.stop()
        ReaderInbox.shared.questions.removeAll()
        ReaderInbox.shared.citations.removeAll()
        ContinueReading.forgetShown()
    }
}

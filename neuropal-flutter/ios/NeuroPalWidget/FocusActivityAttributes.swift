import ActivityKit
import Foundation

// Shared by the app (which starts and ends the activity) and the widget
// extension (which draws it on the Lock Screen and in the Dynamic Island).
// Compiled into BOTH targets — keep it dependency-free. The app's
// deployment target is lower than ActivityKit's, hence the annotation.
@available(iOS 16.1, *)
struct FocusActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // When the current block or break ends.
        var endsAt: Date
        // "work" or "break".
        var phase: String
    }

    // What the block is for, e.g. "CPI notes".
    var title: String
}

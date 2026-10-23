import SwiftUI
import WidgetKit

// The iOS-only extras the Flutter app cannot draw itself (PLATFORM-PLAN §1):
// Home Screen / Lock Screen widgets and the focus Live Activity.
// Deployment target of this extension: iOS 17 (interactive widgets).
@main
struct NeuroPalWidgetBundle: WidgetBundle {
    var body: some Widget {
        StateWidget()
        ReadingWidget()
        FocusLiveActivity()
    }
}

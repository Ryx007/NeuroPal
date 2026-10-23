import ActivityKit
import Flutter
import UIKit
import WidgetKit

// The app's side of the iOS extras: one method channel the Dart code calls
// (lib/platform/ios_extras.dart). Android never registers it, and every
// Dart call is a no-op off iOS.
//
//   updateWidget(json)          share the latest snapshot with the widgets
//   takePendingState() -> str?  a check-in tapped on the widget, once
//   startFocus({title, endsAtMs, phase}) / updateFocus({endsAtMs, phase})
//   endFocus()                  the focus-block Live Activity
final class NeuroPalIOSExtras: NSObject, FlutterPlugin {
    static let appGroup = "group.io.neuropal.flutter"

    static func register(with registrar: FlutterPluginRegistrar) {
        let channel = FlutterMethodChannel(name: "io.neuropal/ios_extras", binaryMessenger: registrar.messenger())
        registrar.addMethodCallDelegate(NeuroPalIOSExtras(), channel: channel)
    }

    private var defaults: UserDefaults {
        UserDefaults(suiteName: Self.appGroup) ?? .standard
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        let args = call.arguments as? [String: Any] ?? [:]
        switch call.method {
        case "updateWidget":
            guard let json = call.arguments as? String else {
                result(FlutterError(code: "bad_args", message: "updateWidget expects a JSON string", details: nil))
                return
            }
            defaults.set(json, forKey: "np.widget")
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
            result(nil)
        case "takePendingState":
            let state = defaults.string(forKey: "np.pendingState")
            defaults.removeObject(forKey: "np.pendingState")
            result(state)
        case "startFocus":
            if #available(iOS 16.2, *) {
                startFocus(args, result: result)
            } else {
                result(false)
            }
        case "updateFocus":
            if #available(iOS 16.2, *) {
                updateFocus(args)
            }
            result(nil)
        case "endFocus":
            if #available(iOS 16.2, *) {
                endFocus()
            }
            result(nil)
        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private static func date(_ ms: Any?) -> Date {
        let v = (ms as? NSNumber)?.doubleValue ?? Date().timeIntervalSince1970 * 1000
        return Date(timeIntervalSince1970: v / 1000)
    }

    @available(iOS 16.2, *)
    private func startFocus(_ args: [String: Any], result: @escaping FlutterResult) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            result(false)
            return
        }
        endFocus()
        let attributes = FocusActivityAttributes(title: args["title"] as? String ?? "Focus block")
        let state = FocusActivityAttributes.ContentState(
            endsAt: Self.date(args["endsAtMs"]),
            phase: args["phase"] as? String ?? "work"
        )
        do {
            _ = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: state.endsAt)
            )
            result(true)
        } catch {
            result(false)
        }
    }

    @available(iOS 16.2, *)
    private func updateFocus(_ args: [String: Any]) {
        let state = FocusActivityAttributes.ContentState(
            endsAt: Self.date(args["endsAtMs"]),
            phase: args["phase"] as? String ?? "work"
        )
        for activity in Activity<FocusActivityAttributes>.activities {
            Task { await activity.update(ActivityContent(state: state, staleDate: state.endsAt)) }
        }
    }

    @available(iOS 16.2, *)
    private func endFocus() {
        for activity in Activity<FocusActivityAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
    }
}

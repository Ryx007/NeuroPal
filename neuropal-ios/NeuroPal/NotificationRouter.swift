import Foundation
import NPCore
import UserNotifications

/// NeuroPal's own notifications (the end of "Sit with me"): a tap opens the
/// place its `url` names (neuropal://pal?tool=sit, through `DeepLink`) in
/// the window in front, and one that arrives while the app is in front
/// still shows. It's the notification centre's delegate from the moment
/// the app launches, so a tap that launched the app isn't lost: it waits
/// until the app model takes it.
final class NotificationRouter: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = NotificationRouter()

    /// Where a tapped notification's place goes (the app model). Setting
    /// it hands over a tap that came before.
    @MainActor var onOpen: (@MainActor (NPRoute) -> Void)? {
        didSet {
            guard let onOpen, let route = pending else { return }
            pending = nil
            onOpen(route)
        }
    }

    @MainActor private var pending: NPRoute?

    /// Becomes the notification centre's delegate (call as the app starts).
    static func install() {
        UNUserNotificationCenter.current().delegate = shared
    }

    /// The place in a notification's `url` (only neuropal: links count).
    static func route(from userInfo: [AnyHashable: Any]) -> NPRoute? {
        guard let text = userInfo["url"] as? String, let url = URL(string: text) else { return nil }
        return DeepLink.route(for: url)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        // A tap on the notification itself (not a dismissal).
        if response.actionIdentifier == UNNotificationDefaultActionIdentifier,
           let route = Self.route(from: response.notification.request.content.userInfo) {
            Task { @MainActor in self.deliver(route) }
        }
        completionHandler()
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    @MainActor private func deliver(_ route: NPRoute) {
        if let onOpen { onOpen(route) } else { pending = route }
    }
}

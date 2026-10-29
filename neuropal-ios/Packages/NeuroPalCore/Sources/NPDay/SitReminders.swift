import Foundation
import NPCore
#if os(iOS)
import UserNotifications
#endif

/// Whether the end of the running "Sit with me" block will be announced
/// while NeuroPal is closed (the app's own clock says it when it's open).
public enum SitReminderState: Equatable, Sendable {
    /// Not known: nothing running, still asking, or no notifications here
    /// (previews, tests, mock screenshots).
    case unknown
    /// A notification will say when time's up.
    case scheduled
    /// Notifications are off for NeuroPal: the end only shows in the app.
    case off
}

/// The one local notification at the end of a sit. The app uses the
/// system's (`SystemSitReminders`); tests use their own.
@MainActor
public protocol SitReminderScheduling: AnyObject {
    /// The block just started. Asks for permission if it was never asked —
    /// this moment, never at launch — then schedules the notification for
    /// `sit.endsAt`. `stillWanted` is asked after every wait: a block
    /// stopped or replaced meanwhile gets nothing.
    func schedule(_ sit: SitSession, title: String, body: String,
                  stillWanted: @escaping @MainActor () -> Bool) async -> SitReminderState
    /// For a block already running (the app came back): never asks; sets
    /// the notification if notifications were switched on since.
    func refresh(_ sit: SitSession, title: String, body: String) async -> SitReminderState
    /// The block ended early, was stopped or is done with: no notification
    /// to come, and none left in Notification Center.
    func cancel()
}

#if os(iOS)
/// UNUserNotificationCenter: one request, always under the same identifier
/// (there is only ever one sit), so a new block replaces the old one's.
@MainActor
public final class SystemSitReminders: SitReminderScheduling {
    public nonisolated static let identifier = "io.neuropal.ios.sit-end"
    private static let sitKey = "sitID"

    public init() {}

    public func schedule(_ sit: SitSession, title: String, body: String,
                         stillWanted: @escaping @MainActor () -> Bool) async -> SitReminderState {
        let center = UNUserNotificationCenter.current()
        var status = await center.notificationSettings().authorizationStatus
        if status == .notDetermined {
            // The first sit: the one moment the question makes sense.
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
            status = await center.notificationSettings().authorizationStatus
        }
        guard Self.allows(status) else { return .off }
        guard stillWanted(), await add(sit, title: title, body: body) else { return .unknown }
        guard stillWanted() else {
            cancel() // stopped while the request was being added
            return .unknown
        }
        return .scheduled
    }

    public func refresh(_ sit: SitSession, title: String, body: String) async -> SitReminderState {
        let center = UNUserNotificationCenter.current()
        let status = await center.notificationSettings().authorizationStatus
        if status == .notDetermined { return .unknown }
        guard Self.allows(status) else { return .off }
        let pending = await center.pendingNotificationRequests()
        if pending.contains(where: { $0.identifier == Self.identifier && $0.content.userInfo[Self.sitKey] as? String == sit.id }) {
            return .scheduled
        }
        return await add(sit, title: title, body: body) ? .scheduled : .unknown
    }

    public func cancel() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [Self.identifier])
        center.removeDeliveredNotifications(withIdentifiers: [Self.identifier])
    }

    private func add(_ sit: SitSession, title: String, body: String) async -> Bool {
        let wait = sit.endsAt.timeIntervalSinceNow
        guard sit.isRunning, wait >= 1 else { return false }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = "sit"
        content.userInfo = [Self.sitKey: sit.id, "url": DeepLink.url(for: .pal(.sit)).absoluteString]
        let request = UNNotificationRequest(identifier: Self.identifier, content: content,
                                            trigger: UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false))
        do {
            try await UNUserNotificationCenter.current().add(request)
            return true
        } catch {
            return false
        }
    }

    private static func allows(_ status: UNAuthorizationStatus) -> Bool {
        switch status {
        case .authorized, .provisional, .ephemeral: return true
        case .denied, .notDetermined: return false
        @unknown default: return false
        }
    }
}
#endif

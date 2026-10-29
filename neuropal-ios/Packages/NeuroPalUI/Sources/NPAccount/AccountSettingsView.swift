import NPCore
import NPTheme
import SwiftUI

/// Settings → Account: who's signed in, sign out, sign out everywhere,
/// change password, the server address. SKELETON — Core+Account agent.
public struct AccountSettingsView: View {
    @Environment(AppSession.self) private var session

    public init() {}

    public var body: some View {
        Section("Account") {
            if let user = session.user {
                LabeledContent("Signed in as", value: user.email)
            }
            Button("Sign out", role: .destructive) { session.signOut() }
        }
    }
}

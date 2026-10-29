import NPCore
import NPTheme
import SwiftUI

/// Settings → Account, as one Form section: who's signed in, the server,
/// change password, sign out, sign out everywhere. A single-user server has
/// no account to sign out of, so only the server shows there. Mirrors the
/// Account group of neuropal-expo-app/src/screens/SettingsScreen.jsx.
public struct AccountSettingsView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.npTheme) private var theme
    @State private var confirmEverywhere = false
    @State private var changingPassword = false
    @State private var changingServer = false
    @State private var busy = false
    @State private var error: String?
    @State private var note: String?

    public init() {}

    public var body: some View {
        Section {
            who
            Button {
                changingServer = true
            } label: {
                LabeledContent {
                    HStack(spacing: 6) {
                        Text(ServerAddress.label(session.host))
                            .foregroundStyle(theme.onSurfaceVariant)
                            .multilineTextAlignment(.trailing)
                        Image(systemName: "chevron.right")
                            .font(theme.font(.bodySemi, size: 13, relativeTo: .footnote))
                            .foregroundStyle(theme.onSurfaceVariant)
                            .accessibilityHidden(true)
                    }
                } label: {
                    Text("Server").foregroundStyle(theme.onSurface)
                }
            }
            .accessibilityHint("Shows the server address, to change it")

            if hasAccount {
                Button("Change password") { changingPassword = true }
                    .foregroundStyle(theme.accentText)
                    .disabled(busy)
                Button("Sign out") {
                    session.signOut()
                }
                .foregroundStyle(theme.accentText)
                .disabled(busy)
                Button {
                    confirmEverywhere = true
                } label: {
                    HStack {
                        Text("Sign out everywhere")
                        if busy {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .foregroundStyle(theme.error)
                .disabled(busy)
                .accessibilityLabel("Sign out on every device, including this one")
            }
            if let error {
                ErrorLine(text: error)
            }
            if let note {
                Text(note)
                    .font(theme.font(.body, size: 15, relativeTo: .callout))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .onAppear { Announce.say(note) }
            }
        } header: {
            Text("Account")
        } footer: {
            if session.isLocalMode {
                Text("This server has a single user and no sign-in.")
            } else if session.phase == .offline {
                Text("Offline — changes to the account wait until the server answers.")
            }
        }
        .confirmationDialog("Sign out on every device?", isPresented: $confirmEverywhere, titleVisibility: .visible) {
            Button("Sign out everywhere", role: .destructive) { Task { await signOutEverywhere() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Every device signed in to this account, this one too, will ask for the password again.")
        }
        .sheet(isPresented: $changingPassword) {
            ChangePasswordSheet(onChanged: {
                error = nil
                note = "Password changed. Other devices were signed out."
            })
            .npTheme(theme)
        }
        .sheet(isPresented: $changingServer) {
            ServerSheet()
                .npTheme(theme)
        }
    }

    @ViewBuilder private var who: some View {
        if let user = session.user, hasAccount {
            VStack(alignment: .leading, spacing: 2) {
                Text(user.name.flatMap { $0.isEmpty ? nil : $0 } ?? "Signed in")
                    .font(theme.font(.bodySemi, size: 16, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                Text(user.email)
                    .font(theme.font(.body, size: 15, relativeTo: .subheadline))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .textSelection(.enabled)
            }
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Signed in as \(user.name.map { "\($0), " } ?? "")\(user.email)")
        } else if session.isLocalMode {
            LabeledContent("Account", value: "Single user")
        } else if session.phase == .offline {
            Text("Signed in on this device")
                .foregroundStyle(theme.onSurface)
        }
    }

    /// A real account (not a single-user server's fixed user).
    private var hasAccount: Bool {
        guard !session.isLocalMode else { return false }
        return session.user?.email != "local@neuropal.app"
    }

    private func signOutEverywhere() async {
        busy = true
        error = nil
        note = nil
        defer { busy = false }
        do {
            try await session.signOutEverywhere()
        } catch APIError.offline {
            error = "Can’t reach the server, so the other devices are still signed in. Try again when you’re online."
        } catch {
            self.error = AccountWords.message(for: error)
        }
    }
}

/// Current password, new password twice. The server signs every other
/// device out and hands this one a fresh session.
struct ChangePasswordSheet: View {
    @Environment(AppSession.self) private var session
    @Environment(\.npTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    var onChanged: () -> Void
    @State private var current = ""
    @State private var new = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var failure: String?
    @State private var invalid: Set<Field> = []
    @FocusState private var focus: Field?

    enum Field: Hashable { case current, new, confirm }

    static let minLength = 8
    static let maxLength = 200

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Other devices will be signed out. This one stays signed in.")
                        .font(theme.font(.body, size: 15, relativeTo: .subheadline))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .fixedSize(horizontal: false, vertical: true)
                    LabeledField(label: "Current password", text: $current, secure: true,
                                 invalid: invalid.contains(.current), contentType: .password, submitLabel: .next,
                                 focus: $focus, id: .current, onSubmit: { focus = .new })
                    LabeledField(label: "New password", text: $new, secure: true,
                                 helper: "At least \(Self.minLength) characters",
                                 invalid: invalid.contains(.new), contentType: .newPassword, submitLabel: .next,
                                 focus: $focus, id: .new, onSubmit: { focus = .confirm })
                    LabeledField(label: "New password again", text: $confirm, secure: true,
                                 invalid: invalid.contains(.confirm), contentType: .newPassword, submitLabel: .done,
                                 focus: $focus, id: .confirm, onSubmit: { Task { await save() } })
                    ErrorLine(text: failure)
                    Button {
                        Task { await save() }
                    } label: {
                        HStack(spacing: 10) {
                            if busy { ProgressView().tint(theme.accentInk) }
                            Text(busy ? "Saving…" : "Save new password")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.npPrimary)
                    .disabled(busy)
                }
                .padding(24)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(NPBackground())
            .navigationTitle("Change password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(busy)
                }
            }
        }
        .presentationDetents([.large])
        .interactiveDismissDisabled(busy)
        .onAppear { focus = .current }
    }

    private func save() async {
        guard !busy else { return }
        invalid = []
        if current.isEmpty {
            show("Type your current password first", .current)
            return
        }
        if new.count < Self.minLength {
            show("Use at least \(Self.minLength) characters for the new password", .new)
            return
        }
        if new.count > Self.maxLength {
            show("Use at most \(Self.maxLength) characters for the new password", .new)
            return
        }
        if new != confirm {
            show("The two new passwords don’t match", .confirm)
            return
        }
        failure = nil
        busy = true
        defer { busy = false }
        do {
            try await session.changePassword(current: current, new: new)
            onChanged()
            dismiss()
        } catch APIError.server(status: 401, let message) {
            show(message.isEmpty ? "The current password is not right" : AccountWords.sentence(message), .current)
        } catch {
            failure = AccountWords.message(for: error)
        }
    }

    private func show(_ text: String, _ field: Field) {
        failure = text
        invalid = [field]
        focus = field
    }
}

/// Which server the app talks to, and a way to change it.
struct ServerSheet: View {
    @Environment(AppSession.self) private var session
    @Environment(\.npTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    AccountPanel {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Connected to")
                                .font(theme.font(.bodyMedium, size: 13, relativeTo: .footnote))
                                .foregroundStyle(theme.onSurfaceVariant)
                            Text(ServerAddress.label(session.host))
                                .font(theme.font(.bodySemi, size: 17, relativeTo: .headline))
                                .foregroundStyle(theme.onSurface)
                                .textSelection(.enabled)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    Text("Another server has its own accounts: the app asks you to sign in there.")
                        .font(theme.font(.body, size: 15, relativeTo: .subheadline))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .fixedSize(horizontal: false, vertical: true)
                    ServerAddressEditor(onDone: { dismiss() })
                }
                .padding(24)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(NPBackground())
            .navigationTitle("Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

#Preview("Account settings") {
    let session = AppSession(host: URL(string: "https://mock.neuropal.invalid")!,
                             store: MemorySessionStore(StoredSession(host: "https://mock.neuropal.invalid", token: "mock-token")),
                             makeAPI: { MockNeuroPalAPI(host: $0, latency: .zero) })
    return Form { AccountSettingsView() }
        .environment(session)
        .task { await session.boot() }
}

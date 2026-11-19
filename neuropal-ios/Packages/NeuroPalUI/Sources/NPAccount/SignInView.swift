import NPCore
import NPTheme
import SwiftUI

/// Sign in, or create an account (with the invite code when the server asks
/// for one), for a server that wants an account — a single-user server
/// signs in by itself and never shows this. The server address can be
/// changed right here, and the calming steps are one tap away while signed
/// out. Mirrors neuropal-expo-app/src/screens/LoginScreen.jsx.
public struct SignInView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppNavigator.self) private var nav
    @Environment(\.npTheme) private var theme
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dynamicTypeSize) private var typeSize

    enum Mode { case signIn, signUp }
    enum Field: Hashable { case name, email, password, invite }
    enum ServerState: Equatable { case checking, ready(AuthConfig), down }

    struct Failure: Equatable {
        var text: String
        var fields: Set<Field> = []
    }

    @State private var mode: Mode
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var inviteCode = ""
    @State private var busy = false
    @State private var failure: Failure?
    @State private var cooldownUntil: Date?
    @State private var server: ServerState = .checking
    @State private var editingServer: Bool
    @State private var switchingServer = false
    @FocusState private var focus: Field?
    private let serverText: String?

    /// `creatingAccount`: open on "Create your account"; `editingServer`:
    /// with the server address open; `serverText`: an address already typed
    /// into it (all for screenshots).
    public init(creatingAccount: Bool = false, editingServer: Bool = false, serverText: String? = nil) {
        _mode = State(initialValue: creatingAccount ? .signUp : .signIn)
        _editingServer = State(initialValue: editingServer || serverText != nil)
        self.serverText = serverText
    }

    public var body: some View {
        GeometryReader { geo in
            ScrollView {
                Group {
                    if sizeClass == .regular {
                        AccountPanel(padding: 36) { form }
                            .frame(maxWidth: 520)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 40)
                    } else {
                        form
                            .frame(maxWidth: 520)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 28)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: geo.size.height)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(NPBackground())
        .task(id: session.host) { await loadConfig() }
    }

    // MARK: The form

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            Wordmark()
                .padding(.bottom, 28)

            Text(signingUp ? "Create your account" : "Welcome back")
                .font(theme.font(.display, size: 28, relativeTo: .title))
                .foregroundStyle(theme.onSurface)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 6)
            Text(signingUp
                 ? "No marketing emails. Your library stays on your NeuroPal server."
                 : "Sign in to pick up where you left off.")
                .font(theme.font(.body, size: 15, relativeTo: .subheadline))
                .foregroundStyle(theme.onSurfaceVariant)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 24)

            fields
                .padding(.bottom, failure == nil ? 0 : 4)

            ErrorLine(text: failure?.text)
                .padding(.bottom, failure == nil ? 0 : 12)

            submitButton
                .padding(.top, 8)

            modeSwitch
                .frame(maxWidth: .infinity)
                .padding(.top, 18)

            serverCard
                .padding(.top, 24)

            Button {
                nav.open(.calm)
            } label: {
                Label("Need help right now?", systemImage: "heart")
                    .font(theme.font(.bodyMedium, size: 15, relativeTo: .callout))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity)
            .padding(.top, 18)
            .accessibilityLabel("Need help right now? Open the calming steps")

            Text("Your documents and notes are stored on your NeuroPal server, never sold. Questions you ask are answered by the AI service that server uses.")
                .font(theme.font(.body, size: 13, relativeTo: .footnote))
                .foregroundStyle(theme.onSurfaceVariant)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
                .padding(.top, 14)
        }
    }

    @ViewBuilder private var fields: some View {
        VStack(alignment: .leading, spacing: 14) {
            if signingUp {
                LabeledField(label: "Name", text: $name, prompt: "What should Pal call you?",
                             contentType: .name, capitalization: .words, submitLabel: .next,
                             focus: $focus, id: .name, onSubmit: { focus = .email })
            }
            LabeledField(label: "Email", text: $email, prompt: "you@example.com",
                         invalid: failure?.fields.contains(.email) == true, errorText: problem(.email),
                         contentType: .username, keyboard: .emailAddress, submitLabel: .next,
                         focus: $focus, id: .email, onSubmit: { focus = .password })
            LabeledField(label: "Password", text: $password,
                         prompt: signingUp ? "Choose a password" : "Your password", secure: true,
                         helper: signingUp ? "At least \(Self.minPassword) characters" : nil,
                         invalid: failure?.fields.contains(.password) == true, errorText: problem(.password),
                         contentType: signingUp ? .newPassword : .password,
                         submitLabel: signingUp && needsInvite ? .next : (signingUp ? .join : .go),
                         focus: $focus, id: .password,
                         onSubmit: { if signingUp && needsInvite { focus = .invite } else { Task { await submit() } } })
            if signingUp && needsInvite {
                LabeledField(label: "Invite code", text: $inviteCode, prompt: "From whoever runs this server",
                             invalid: failure?.fields.contains(.invite) == true, errorText: problem(.invite),
                             submitLabel: .join, focus: $focus, id: .invite, onSubmit: { Task { await submit() } })
            }
        }
        .padding(.bottom, 14)
    }

    @ViewBuilder private var submitButton: some View {
        if let until = cooldownUntil {
            // Counts down while the server asks us to wait.
            TimelineView(.periodic(from: .now, by: 1)) { context in
                primaryButton(wait: Int(ceil(until.timeIntervalSince(context.date))))
            }
        } else {
            primaryButton(wait: 0)
        }
    }

    private func primaryButton(wait: Int) -> some View {
        Button {
            Task { await submit() }
        } label: {
            HStack(spacing: 10) {
                if busy { ProgressView().tint(theme.accentInk) }
                Text(buttonTitle(wait: wait))
                if !busy && wait <= 0 { Image(systemName: "arrow.right").accessibilityHidden(true) }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.npPrimary)
        .disabled(busy || wait > 0 || switchingServer)
    }

    @ViewBuilder private var modeSwitch: some View {
        if signupOpen {
            Button {
                failure = nil
                mode = mode == .signIn ? .signUp : .signIn
                Announce.say(mode == .signUp
                             ? "Create your account. Name, email and password."
                             : "Welcome back. Sign in with your email and password.")
            } label: {
                Text(mode == .signIn ? "No account yet? Create one" : "Already have an account? Sign in")
                    .font(theme.font(.bodySemi, size: 15, relativeTo: .callout))
                    .foregroundStyle(theme.accentText)
                    .multilineTextAlignment(.center)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            Text("New accounts are closed on this server.")
                .font(theme.font(.body, size: 14, relativeTo: .footnote))
                .foregroundStyle(theme.onSurfaceVariant)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: Which server

    private var serverCard: some View {
        AccountPanel(padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                // One line at ordinary text sizes; at the accessibility sizes
                // the address gets a line of its own.
                if !typeSize.isAccessibilitySize {
                    HStack(alignment: .center, spacing: 10) {
                        serverIcon
                        Text("Server · \(serverLine)")
                            .font(theme.font(.body, size: 14, relativeTo: .footnote))
                            .foregroundStyle(theme.onSurfaceVariant)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        changeServerButton
                    }
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .center, spacing: 10) {
                            serverIcon
                            Text("Server")
                                .font(theme.font(.body, size: 14, relativeTo: .footnote))
                                .foregroundStyle(theme.onSurfaceVariant)
                            Spacer(minLength: 8)
                            changeServerButton
                        }
                        Text(serverLine)
                            .font(theme.font(.bodyMedium, size: 14, relativeTo: .footnote))
                            .foregroundStyle(theme.onSurface)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                if serverDown && !editingServer {
                    Button {
                        Task { await loadConfig() }
                    } label: {
                        Label("Try again", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.npSecondary)
                    .accessibilityHint("Checks the server again")
                }
                if editingServer {
                    ServerAddressEditor(preset: serverText, connecting: $switchingServer,
                                        onDone: { editingServer = false })
                }
            }
        }
    }

    private var serverIcon: some View {
        Image(systemName: serverDown ? "icloud.slash" : "server.rack")
            .font(theme.font(.bodyMedium, size: 15, relativeTo: .callout))
            .foregroundStyle(theme.onSurfaceVariant)
            .accessibilityHidden(true)
    }

    private var changeServerButton: some View {
        Button {
            editingServer.toggle()
        } label: {
            Text(editingServer ? "Done" : "Change")
                .font(theme.font(.bodySemi, size: 15, relativeTo: .callout))
                .foregroundStyle(theme.accentText)
                .fixedSize()
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .layoutPriority(1)
        // The server can't change under a sign-in that's on its way.
        .disabled(busy || session.isAuthenticating || switchingServer)
        .accessibilityLabel(editingServer ? "Done with the server address" : "Change the server address")
    }

    private var serverDown: Bool { server == .down && !session.isChecking }

    private var serverLine: String {
        let label = ServerAddress.label(session.host)
        if session.isChecking { return "Checking the server…" }
        switch server {
        case .checking: return "Checking the server…"
        case .down: return "Can’t reach \(label)"
        case .ready: return label
        }
    }

    // MARK: State

    static let minPassword = 8

    private var config: AuthConfig {
        if case .ready(let c) = server { return c }
        // Until the server answers: sign-in, with sign-up by invite.
        return AuthConfig(localMode: false, signup: "invite")
    }

    private var signupOpen: Bool { config.signupOpen }
    private var needsInvite: Bool { config.needsInvite }
    private var signingUp: Bool { mode == .signUp && signupOpen }

    private func buttonTitle(wait: Int) -> String {
        if wait > 0 { return "Try again in \(wait) s" }
        if busy { return signingUp ? "Creating account…" : "Signing in…" }
        return signingUp ? "Create account" : "Sign in"
    }

    private func loadConfig() async {
        server = .checking
        let asked = session.host
        do {
            let c = try await session.api.authConfig()
            guard session.host == asked else { return }
            server = .ready(c)
            // A NeuroPal server answered: a newly chosen address is kept.
            session.serverAnswered()
            // A single-user server signs in by itself: hand back to the session check.
            if c.localMode { await session.recheck() }
        } catch is CancellationError {
        } catch APIError.offline {
            server = .down
        } catch {
            // An older server without /config: sign-in with an invite.
            server = .ready(AuthConfig(localMode: false, signup: "invite"))
        }
    }

    /// The error line's words, for VoiceOver on the field at fault.
    private func problem(_ field: Field) -> String? {
        guard let failure, failure.fields.contains(field) else { return nil }
        return failure.text
    }

    private func fail(_ text: String, fields: Set<Field> = []) {
        failure = Failure(text: text, fields: fields)
    }

    private func submit() async {
        if busy || switchingServer { return }
        if let until = cooldownUntil, until > Date() { return }
        let mail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let invite = inviteCode.trimmingCharacters(in: .whitespacesAndNewlines)
        if mail.isEmpty || password.isEmpty {
            var missing: Set<Field> = []
            if mail.isEmpty { missing.insert(.email) }
            if password.isEmpty { missing.insert(.password) }
            fail("Email and password, please", fields: missing)
            focus = mail.isEmpty ? .email : .password
            return
        }
        if signingUp && password.count < Self.minPassword {
            fail("Use at least \(Self.minPassword) characters for the password", fields: [.password])
            focus = .password
            return
        }
        if signingUp && needsInvite && invite.isEmpty {
            fail("This server needs an invite code to create an account", fields: [.invite])
            focus = .invite
            return
        }

        failure = nil
        busy = true
        focus = nil
        let creating = signingUp
        defer { busy = false }
        do {
            if creating {
                let given = name.trimmingCharacters(in: .whitespacesAndNewlines)
                try await session.register(email: mail, password: password, name: given.isEmpty ? nil : given,
                                           inviteCode: needsInvite ? invite : nil)
            } else {
                try await session.signIn(email: mail, password: password)
            }
            Announce.say(creating ? "Account created" : "Signed in")
        } catch is CancellationError {
        } catch APIError.rateLimited(let seconds) {
            let wait = max(1, seconds ?? 30)
            cooldownUntil = Date().addingTimeInterval(TimeInterval(wait))
            fail(AccountWords.tooManyTries(wait))
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(wait))
                if let until = cooldownUntil, until <= Date() {
                    cooldownUntil = nil
                    if failure?.text == AccountWords.tooManyTries(wait) { failure = nil }
                }
            }
        } catch APIError.server(status: 401, let message) {
            fail(message.isEmpty ? "That email and password don’t match." : AccountWords.sentence(message), fields: [.password])
        } catch APIError.forbidden(let message) {
            fail(message.isEmpty ? "That invite code is not right." : AccountWords.sentence(message),
                 fields: creating ? [.invite] : [])
        } catch APIError.server(status: 409, let message) {
            fail(message.isEmpty ? "That email already has an account." : AccountWords.sentence(message), fields: [.email])
        } catch {
            fail(AccountWords.message(for: error))
        }
    }
}

#Preview("Sign in") {
    SignInView()
        .environment(AppSession(host: URL(string: "https://mock.neuropal.invalid")!, store: MemorySessionStore(),
                                makeAPI: { MockNeuroPalAPI(host: $0, token: nil, latency: .zero) }))
        .environment(AppNavigator())
}

#Preview("Sign in — Signal") {
    SignInView()
        .environment(AppSession(host: URL(string: "https://mock.neuropal.invalid")!, store: MemorySessionStore(),
                                makeAPI: { MockNeuroPalAPI(host: $0, token: nil, latency: .zero) }))
        .environment(AppNavigator())
        .npTheme(.signal)
}

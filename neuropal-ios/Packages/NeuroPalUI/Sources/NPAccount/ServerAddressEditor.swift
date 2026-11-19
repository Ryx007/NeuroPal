import NPCore
import NPTheme
import SwiftUI

/// The server address, editable: checked before anything is sent, then the
/// app connects to it (the sign-in screen's "Server" and Settings → Account).
/// A new address is used only once a NeuroPal server answers there, and an
/// http:// address says plainly, before it's saved, that the connection
/// isn't encrypted. A wrong default is never a dead end.
struct ServerAddressEditor: View {
    @Environment(AppSession.self) private var session
    @Environment(\.npTheme) private var theme
    /// An address already typed in (screenshots); else the current one.
    var preset: String?
    /// True while the new address is being tried (the sign-in screen holds
    /// its own button meanwhile).
    @Binding var connecting: Bool
    var onDone: () -> Void
    @State private var text = ""
    @State private var filled = false
    @State private var problem: String?
    @State private var toldUnencrypted = false
    @FocusState private var focus: Field?

    enum Field: Hashable { case address }

    init(preset: String? = nil, connecting: Binding<Bool> = .constant(false), onDone: @escaping () -> Void = {}) {
        self.preset = preset
        _connecting = connecting
        self.onDone = onDone
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LabeledField(
                label: "Server address", text: $text, prompt: ServerAddress.defaultHost.absoluteString,
                helper: "https:// for a server on the internet. Plain http:// works only on your own network.",
                invalid: problem != nil, errorText: problem, contentType: .URL, keyboard: .URL, submitLabel: .go,
                focus: $focus, id: .address, onSubmit: { Task { await connect() } })
            ErrorLine(text: problem)
            if unencrypted != nil {
                unencryptedNote
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { buttons }
                VStack(alignment: .leading, spacing: 10) { buttons }
            }
        }
        .onAppear {
            guard !filled else { return }
            filled = true
            text = preset ?? session.host.absoluteString
        }
        .onChange(of: text) { _, _ in problem = nil }
        .onChange(of: unencrypted != nil) { _, on in
            // Once per address typed: VoiceOver hears it without having to find it.
            if on && !toldUnencrypted {
                toldUnencrypted = true
                Announce.say(Self.unencryptedSpoken)
            } else if !on {
                toldUnencrypted = false
            }
        }
    }

    /// The typed address when it's a plain http:// one to another device
    /// (http:// to this device itself never crosses a network).
    private var unencrypted: URL? {
        guard let url = try? ServerAddress.parse(text), ServerAddress.isUnencrypted(url),
              ServerAddress.kind(of: url) != .loopback else { return nil }
        return url
    }

    static let unencryptedTitle = "Not encrypted"
    static let unencryptedBody = "With http://, anyone on the same network can read what the app sends to this server, your password too. Use it only on a network you trust, like your home Wi-Fi or Tailscale. If your server has an https:// address, use that instead."
    static var unencryptedSpoken: String { "\(unencryptedTitle). \(unencryptedBody)" }

    private var unencryptedNote: some View {
        let shape = RoundedRectangle(cornerRadius: theme.isSignal ? min(theme.radiusMedium, 10) : 14, style: .continuous)
        return Label {
            VStack(alignment: .leading, spacing: 4) {
                Text(Self.unencryptedTitle)
                    .font(theme.font(.bodySemi, size: 15, relativeTo: .callout))
                Text(Self.unencryptedBody)
                    .font(theme.font(.body, size: 14, relativeTo: .footnote))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(theme.onSurface)
        } icon: {
            Image(systemName: "lock.open").foregroundStyle(theme.warn)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.warn.opacity(0.12), in: shape)
        .overlay(shape.strokeBorder(theme.warn.opacity(0.5), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var buttons: some View {
        Button {
            Task { await connect() }
        } label: {
            HStack(spacing: 8) {
                if connecting { ProgressView().tint(theme.accentInk) }
                Text(connecting ? "Connecting…" : "Save and connect")
            }
        }
        .buttonStyle(.npPrimary)
        .disabled(connecting || session.isAuthenticating)
        .accessibilityHint(unencrypted != nil ? "Not encrypted. Use it only on a network you trust." : "")
        if AppSession.origin(session.host) != AppSession.origin(ServerAddress.defaultHost) {
            Button("Use the default server") {
                text = ServerAddress.defaultHost.absoluteString
                Task { await connect() }
            }
            .buttonStyle(.npSecondary)
            .disabled(connecting || session.isAuthenticating)
            .accessibilityHint("Connects to \(ServerAddress.label(ServerAddress.defaultHost))")
        }
    }

    private func connect() async {
        guard !connecting, !session.isAuthenticating else { return }
        switch ServerAddress.validate(text) {
        case .failure(let p):
            problem = p.errorDescription
            focus = .address
        case .success(let url):
            problem = nil
            text = url.absoluteString
            focus = nil
            if url == session.host {
                onDone()
                return
            }
            connecting = true
            // Nothing changes until a NeuroPal server answers there (the
            // built-in address is known to be one).
            if !AppSession.isDefault(url) {
                let answers = await session.serverAnswers(at: url)
                guard answers else {
                    connecting = false
                    problem = "No NeuroPal server answered at \(ServerAddress.label(url)). Check the address, and that the server is on, then try again."
                    focus = .address
                    return
                }
            }
            // A sign-in started meanwhile: it finishes on the server it began with.
            guard !session.isAuthenticating else {
                connecting = false
                return
            }
            await session.switchHost(url)
            connecting = false
            onDone()
        }
    }
}

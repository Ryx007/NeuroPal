import NPCore
import NPTheme
import SwiftUI

/// The server address, editable: checked before anything is sent, then the
/// app connects to it (the sign-in screen's "Server" and Settings → Account).
/// A wrong default is never a dead end.
struct ServerAddressEditor: View {
    @Environment(AppSession.self) private var session
    @Environment(\.npTheme) private var theme
    var onDone: () -> Void = {}
    @State private var text = ""
    @State private var problem: String?
    @State private var connecting = false
    @FocusState private var focus: Field?

    enum Field: Hashable { case address }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LabeledField(
                label: "Server address", text: $text, prompt: ServerAddress.defaultHost.absoluteString,
                helper: "https:// for a server on the internet. Plain http:// works only on your own network.",
                invalid: problem != nil, contentType: .URL, keyboard: .URL, submitLabel: .go,
                focus: $focus, id: .address, onSubmit: { Task { await connect() } })
            ErrorLine(text: problem)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { buttons }
                VStack(alignment: .leading, spacing: 10) { buttons }
            }
        }
        .onAppear {
            text = session.host.absoluteString
        }
        .onChange(of: text) { _, _ in problem = nil }
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
        .disabled(connecting)
        if AppSession.origin(session.host) != AppSession.origin(ServerAddress.defaultHost) {
            Button("Use the default server") {
                text = ServerAddress.defaultHost.absoluteString
                Task { await connect() }
            }
            .buttonStyle(.npSecondary)
            .disabled(connecting)
            .accessibilityHint("Connects to \(ServerAddress.label(ServerAddress.defaultHost))")
        }
    }

    private func connect() async {
        guard !connecting else { return }
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
            await session.switchHost(url)
            connecting = false
            onDone()
        }
    }
}

import NPCore
import NPDay
import NPTheme
import SwiftUI

/// "Talk" — a short chat with Pal (POST /api/pal/chat), PalTalk.jsx.
/// Safety first, and offline: a message that sounds like a crisis is never
/// sent — Pal answers on the device with the careful reply, the calming
/// steps and the help lines. The check sees the message exactly as the
/// server would (whitespace collapsed), so doubled spaces, tabs or no-break
/// spaces don't hide anything. A server reply marked `crisis` is shown the
/// same way. The check can miss phrasings, and the note under the chat says so.
struct TalkPanel: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Environment(AppSession.self) private var session
    let onCalm: () -> Void

    @State private var draft = ""
    @State private var sending = false
    @State private var confirmClear = false
    @State private var cleared: String?
    @State private var lifetime = Lifetime()
    @FocusState private var focused: Bool

    /// Whether the panel is still on screen when a reply lands.
    final class Lifetime { var alive = true }

    private static let shownLines = 10
    /// Mock screenshots: the -NPPalSay message is sent once per launch.
    @MainActor private static var saidAtLaunch = false
    private var pal: Appearance.Pal { theme.appearance.pal }

    var body: some View {
        VStack(spacing: 0) {
            if day.day.state == .red { redBanner.padding(.horizontal, 18).padding(.top, 10) }
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        PanelTitle("Talk")
                        Intro(Tokens.palSay(pal, "talk")).padding(.top, 4)
                        VStack(spacing: 8) {
                            ForEach(day.chat.suffix(Self.shownLines)) { line in
                                MessageView(line: line, onCalm: onCalm)
                            }
                        }
                        .padding(.top, 10)
                        if sending {
                            HStack(spacing: 8) {
                                ProgressView().tint(theme.accentText)
                                Text("\(pal.name) is thinking…")
                                    .font(theme.font(.body, size: 13.5, relativeTo: .callout))
                                    .foregroundStyle(theme.onSurfaceVariant)
                            }
                            .padding(.top, 8)
                            .accessibilityElement(children: .combine)
                        }
                        Text("Talk sends your message and today’s plan to your NeuroPal server’s AI. If a message sounds "
                             + "like a crisis, \(pal.name) answers on this device and doesn’t send it. This check can miss things.")
                            .font(theme.font(.body, size: 12, relativeTo: .caption))
                            .foregroundStyle(theme.onSurfaceVariant)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 14)
                        if !day.chat.isEmpty { clearRow.padding(.top, 4) }
                        if let cleared {
                            Text(cleared)
                                .font(theme.font(.body, size: 12.5, relativeTo: .caption))
                                .foregroundStyle(theme.onSurfaceVariant)
                        }
                        Color.clear.frame(height: 1).id("end")
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 14)
                    .padding(.bottom, 10)
                    .frame(maxWidth: 680, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: day.chat.count) { _, _ in scrollToEnd(proxy) }
                .onChange(of: sending) { _, _ in scrollToEnd(proxy) }
                .onAppear { scrollToLatest(proxy) }
            }
            inputBar
        }
        .onAppear {
            lifetime.alive = true
            sayAtLaunch()
        }
        .onDisappear { lifetime.alive = false }
    }

    /// Mock screenshots only: -NPPalSay "…" types that message and sends it
    /// through the real path (the crisis check included).
    private func sayAtLaunch() {
        guard !Self.saidAtLaunch, !day.isPersistent,
              let text = UserDefaults.standard.string(forKey: "NPPalSay"), !text.isEmpty else { return }
        Self.saidAtLaunch = true
        draft = text
        send()
    }

    private func scrollToEnd(_ proxy: ScrollViewProxy) {
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(80))
            withAnimation(theme.animates ? .easeOut(duration: 0.2) : nil) { scrollToLatest(proxy) }
        }
    }

    /// The end of the chat — but a careful crisis answer from its top, so
    /// Pal's words and the calming steps are in view, not just the numbers.
    private func scrollToLatest(_ proxy: ScrollViewProxy) {
        if let last = day.chat.last, last.crisis {
            proxy.scrollTo(last.id, anchor: .top)
        } else {
            proxy.scrollTo("end", anchor: .bottom)
        }
    }

    // MARK: Parts

    private var redBanner: some View {
        HStack(spacing: 10) {
            Text("If this feels like too much, the calming steps are here.")
                .font(theme.font(.bodySemi, size: 14, relativeTo: .callout))
                .foregroundStyle(theme.onSurface)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: onCalm) {
                Label("Calming steps", systemImage: "leaf")
            }
            .buttonStyle(.npPrimary)
            .accessibilityLabel("Open the calming steps")
        }
        .padding(12)
        .background(theme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusMedium : 16,
                                                                    style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusMedium : 16, style: .continuous)
            .strokeBorder(theme.isSignal ? theme.accent : theme.accent.opacity(0.5), lineWidth: 1.5))
    }

    @ViewBuilder private var clearRow: some View {
        if confirmClear {
            WrapLayout(spacing: 10, lineSpacing: 4) {
                Text("Clear the whole chat?")
                    .font(theme.font(.bodySemi, size: 13.5, relativeTo: .subheadline))
                    .foregroundStyle(theme.onSurface)
                    .frame(minHeight: 44)
                Button("Yes, clear it", action: clearAll).buttonStyle(TextActionStyle(tone: theme.error))
                Button("Keep it") { confirmClear = false }.buttonStyle(TextActionStyle())
            }
        } else {
            Button("Clear chat") { confirmClear = true }
                .buttonStyle(TextActionStyle())
                .accessibilityLabel("Clear your chat with \(pal.name)")
        }
    }

    private var inputBar: some View {
        let empty = PalLogic.collapseWhitespace(draft).isEmpty
        return HStack(spacing: 8) {
            TextField("Message \(pal.name)", text: $draft)
                .focused($focused)
                .submitLabel(.send)
                .onSubmit(send)
                .onChange(of: draft) { _, t in
                    // The server counts UTF-16 units (an emoji is two).
                    if t.utf16.count > PalLogic.messageMaxChars { draft = PalLogic.capUTF16(t, PalLogic.messageMaxChars) }
                }
                .palField()
                .accessibilityLabel("Message to \(pal.name)")
            Button(action: send) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(theme.accentInk)
                    .frame(width: 48, height: 48)
                    .background(theme.accentFill, in: RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 24,
                                                                       style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 24, style: .continuous)
                        .strokeBorder(theme.isSignal ? theme.shadowColor : Color.clear, lineWidth: 1.5))
                    .opacity(empty || sending ? 0.45 : 1)
            }
            .buttonStyle(.plain)
            .disabled(empty || sending)
            .accessibilityLabel("Send")
            .keyboardShortcut(.return, modifiers: .command)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: 700)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .top) { Rectangle().fill(theme.outlineVariant.opacity(0.5)).frame(height: 1) }
    }

    // MARK: Sending

    private func send() {
        guard !sending else { return }
        let text: String
        switch PalLogic.outgoing(draft, max: PalLogic.messageMaxChars) {
        case .nothing:
            return
        case .crisis(let message):
            // Safety first, and offline: the same careful answer every time,
            // straight away, and nothing is sent anywhere.
            draft = ""
            cleared = nil
            day.appendChat(PalChatLine(role: .user, text: message))
            day.appendChat(PalChatLine(role: .pal, text: PalLogic.crisisReply, crisis: true, local: true))
            AccessibilityNotification.Announcement("\(pal.name): \(PalLogic.crisisReply)").post()
            return
        case .send(let message):
            text = message
        }
        draft = ""
        cleared = nil
        day.appendChat(PalChatLine(role: .user, text: text))
        sending = true
        AccessibilityNotification.Announcement("\(pal.name) is thinking…").post()
        let context = PalLogic.chatContext(state: day.day.state, now: Date(), anchors: day.day.anchors,
                                           tasks: day.day.tasks, pal: pal)
        let api = session.api
        let name = pal.name
        let lines = (offline: Tokens.palSay(pal, "talkOffline"), error: Tokens.palSay(pal, "talkError"))
        let life = lifetime
        Task {
            let line: PalChatLine
            do {
                let r = try await api.palChat(message: text, context: context)
                let reply = r.reply.trimmingCharacters(in: .whitespacesAndNewlines)
                line = reply.isEmpty ? PalChatLine(role: .pal, text: lines.error, local: true)
                    : PalChatLine(role: .pal, text: reply, crisis: r.crisis)
            } catch {
                line = PalChatLine(role: .pal, text: Self.fallback(error, offline: lines.offline, failed: lines.error), local: true)
            }
            // The reply lands in the chat even if the sheet closed meanwhile.
            day.appendChat(line)
            sending = false
            if life.alive { AccessibilityNotification.Announcement("\(name): \(line.text)").post() }
        }
    }

    /// What Pal says when the server can't answer (reachable but failing ≠ offline).
    static func fallback(_ error: Error, offline: String, failed: String) -> String {
        switch error as? APIError {
        case .offline?: return offline
        case .rateLimited?: return "That’s a lot of chat for now. The other tools here still work."
        case .unauthorized?: return "You’re signed out, so chat is off for now. Everything else here works offline."
        default: return (error as? URLError) != nil ? offline : failed
        }
    }

    private func clearAll() {
        day.clearChat()
        confirmClear = false
        let api = session.api
        Task {
            do {
                try await api.clearPalChat()
                cleared = "Cleared here and on your server."
            } catch {
                cleared = "Cleared on this device. The server copy stays until it can be reached."
            }
            AccessibilityNotification.Announcement(cleared ?? "").post()
        }
    }
}

/// One chat line: yours on the right, Pal's on the left; Pal's careful
/// crisis answer carries the calming steps and the help lines.
private struct MessageView: View {
    @Environment(\.npTheme) private var theme
    let line: PalChatLine
    let onCalm: () -> Void

    private var mine: Bool { line.role == .user }

    var body: some View {
        let name = theme.appearance.pal.name
        VStack(alignment: mine ? .trailing : .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                if !mine {
                    Text(name)
                        .font(theme.font(.label, size: 10.5, relativeTo: .caption2))
                        .tracking(1)
                        .textCase(.uppercase)
                        .foregroundStyle(theme.onSurfaceVariant)
                }
                Text(line.text)
                    .font(theme.font(.body, size: 15, relativeTo: .body))
                    .foregroundStyle(mine && theme.isSignal ? theme.accentInk : theme.onSurface)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(bubbleShape.fill(mine ? (theme.isSignal ? theme.accentFill : theme.accent.opacity(0.16)) : theme.surfaceHigh))
            .overlay(bubbleShape.stroke(theme.isSignal ? (mine ? theme.shadowColor : theme.line) : Color.clear, lineWidth: 1.5))
            .frame(maxWidth: 520, alignment: mine ? .trailing : .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(mine ? "You" : name): \(line.text)")
            if line.crisis {
                Button(action: onCalm) {
                    Label("Open the calming steps", systemImage: "leaf")
                }
                .buttonStyle(.npPrimary)
                HelpLinesList()
            }
        }
        .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
    }

    private var bubbleShape: UnevenRoundedRectangle {
        let r = theme.isSignal ? theme.radiusMedium : 16
        let tail: CGFloat = theme.isSignal ? r : 6
        return UnevenRoundedRectangle(topLeadingRadius: r, bottomLeadingRadius: mine ? r : tail,
                                      bottomTrailingRadius: mine ? tail : r, topTrailingRadius: r, style: .continuous)
    }
}

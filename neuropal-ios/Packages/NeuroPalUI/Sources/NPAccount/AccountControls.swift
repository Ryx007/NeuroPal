import NPCore
import NPTheme
import SwiftUI

// The pieces the sign-in screen and Settings → Account share: a labelled
// field, the error line, the wordmark, the panel, and words for errors.

/// A visible label over a field whose edge reads at 3:1 on the page
/// (outline on Classic, the control colour on Signal, the error colour while
/// it's the field at fault), any rule as helper text under it — never only
/// in the placeholder — and a labelled show/hide switch for passwords.
struct LabeledField<Focus: Hashable>: View {
    @Environment(\.npTheme) private var theme
    let label: String
    @Binding var text: String
    var prompt: String = ""
    var secure = false
    var helper: String?
    var invalid = false
    var contentType: UITextContentType?
    var keyboard: UIKeyboardType = .default
    var capitalization: TextInputAutocapitalization = .never
    var submitLabel: SubmitLabel = .next
    let focus: FocusState<Focus?>.Binding
    let id: Focus
    var onSubmit: () -> Void = {}
    @State private var revealed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(theme.font(theme.isSignal ? .label : .bodyMedium, size: 12, relativeTo: .caption))
                .tracking(theme.isSignal ? 1.2 : 1.6)
                .foregroundStyle(theme.onSurfaceVariant)
                .padding(.leading, 4)
                .accessibilityHidden(true)

            HStack(spacing: 0) {
                input
                    .font(theme.font(.body, size: 16, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                    .textInputAutocapitalization(capitalization)
                    .autocorrectionDisabled()
                    .keyboardType(keyboard)
                    .textContentType(contentType)
                    .submitLabel(submitLabel)
                    .focused(focus, equals: id)
                    .onSubmit(onSubmit)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                    .accessibilityLabel(label)
                    .accessibilityHint(hint)
                if secure {
                    Button {
                        // Swapping the secure field for a plain one drops the
                        // keyboard; hand focus to the new field.
                        let hadFocus = focus.wrappedValue == id
                        revealed.toggle()
                        if hadFocus { Task { @MainActor in focus.wrappedValue = id } }
                    } label: {
                        Image(systemName: revealed ? "eye.slash" : "eye")
                            .font(theme.font(.bodyMedium, size: 17, relativeTo: .body))
                            .foregroundStyle(theme.onSurfaceVariant)
                            .padding(.horizontal, 10)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, 2)
                    .accessibilityLabel(revealed ? "Hide \(label.lowercased())" : "Show \(label.lowercased())")
                }
            }
            .background {
                // Taps on the box around the text (not on the text field
                // itself) still put the cursor in it.
                shape.fill(theme.surfaceContainer)
                    .contentShape(shape)
                    .onTapGesture { focus.wrappedValue = id }
            }
            .overlay(shape.strokeBorder(invalid ? theme.error : edge, lineWidth: invalid ? 2 : max(1, theme.border)))

            if let helper {
                Text(helper)
                    .font(theme.font(.body, size: 13, relativeTo: .footnote))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .padding(.leading, 4)
                    .accessibilityHidden(true)
            }
        }
    }

    @ViewBuilder private var input: some View {
        let promptText = Text(prompt).foregroundStyle(theme.onSurfaceVariant)
        if secure && !revealed {
            SecureField(label, text: $text, prompt: promptText)
        } else {
            TextField(label, text: $text, prompt: promptText)
        }
    }

    private var hint: String {
        [invalid ? "Needs a look" : nil, helper].compactMap { $0 }.joined(separator: ". ")
    }

    private var edge: Color { theme.isSignal ? theme.control : theme.outline }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: theme.isSignal ? min(theme.radiusMedium, 10) : 14, style: .continuous)
    }
}

/// What went wrong, in a line that stays until the next try. VoiceOver
/// hears it when it appears or changes.
struct ErrorLine: View {
    @Environment(\.npTheme) private var theme
    let text: String?

    var body: some View {
        if let text {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "exclamationmark.circle")
                    .foregroundStyle(theme.error)
                    .accessibilityHidden(true)
                Text(text)
                    .font(theme.font(.bodyMedium, size: 15, relativeTo: .callout))
                    .foregroundStyle(theme.error)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .onAppear { Announce.say(text) }
            .onChange(of: text) { _, new in Announce.say(new) }
        }
    }
}

enum Announce {
    /// Speaks `text` with VoiceOver (a no-op when it's off).
    @MainActor static func say(_ text: String) {
        var s = AttributedString(text)
        s.accessibilitySpeechAnnouncementPriority = .high
        AccessibilityNotification.Announcement(s).post()
    }
}

/// The small pulsing dot from the Expo app's header. Still when motion is off.
struct DataPulse: View {
    @Environment(\.npTheme) private var theme
    var size: CGFloat = 8
    @State private var on = false

    var body: some View {
        Circle()
            .fill(theme.isSignal ? theme.accentFill : theme.accent)
            .frame(width: size, height: size)
            .scaleEffect(theme.animates ? (on ? 1.3 : 1) : 1.15)
            .opacity(theme.animates ? (on ? 1 : 0.45) : 1)
            .onAppear {
                guard theme.animates else { return }
                withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) { on = true }
            }
            .accessibilityHidden(true)
    }
}

/// "● NeuroPal" — the sign-in screen's header.
struct Wordmark: View {
    @Environment(\.npTheme) private var theme

    var body: some View {
        HStack(spacing: 10) {
            DataPulse()
            Text("NeuroPal")
                .font(theme.font(.display, size: 32, relativeTo: .largeTitle))
                .tracking(theme.isSignal ? 0.5 : -0.8)
                .foregroundStyle(theme.accentText)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// A panel in the skin's style: Classic a soft card, Signal a hard-edged
/// panel over an offset shadow block.
struct AccountPanel<Content: View>: View {
    @Environment(\.npTheme) private var theme
    var padding: CGFloat = 16
    @ViewBuilder let content: Content

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: theme.isSignal ? theme.radius : theme.radiusMedium, style: .continuous)
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.surfaceContainer, in: shape)
            .overlay(shape.strokeBorder(theme.line, lineWidth: theme.isSignal ? max(1, theme.border) : 0.5))
            .background {
                if theme.isSignal, theme.shadow > 0 {
                    shape.fill(Color(token: theme.palette.shadowColor)).offset(x: theme.shadow, y: theme.shadow)
                }
            }
    }
}

/// Plain words for what went wrong on the way to the server.
enum AccountWords {
    /// "invalid email or password" → "Invalid email or password".
    static func sentence(_ s: String) -> String {
        guard let first = s.first else { return s }
        return first.uppercased() + s.dropFirst()
    }

    static func message(for error: Error) -> String {
        switch error {
        case APIError.offline:
            return "Can’t reach the server. Check the address under Server, then try again."
        case APIError.rateLimited(let seconds):
            return tooManyTries(seconds)
        case APIError.forbidden(let m):
            return m.isEmpty ? "That isn’t allowed on this server." : sentence(m)
        case APIError.notFound:
            return "No NeuroPal server answered at this address. Check it under Server."
        case APIError.server(let status, let m):
            if !m.isEmpty { return sentence(m) }
            return status >= 500 ? "Something went wrong on the server. Try again in a moment." : "That didn’t work. Try again."
        case APIError.decoding:
            return "The server sent something unexpected. Try again."
        case APIError.unauthorized:
            return "Your session has ended. Sign in again."
        default:
            return "That didn’t work. Try again."
        }
    }

    static func tooManyTries(_ seconds: Int?) -> String {
        guard let seconds, seconds > 0 else { return "Too many tries for now. Wait a moment, then try again." }
        if seconds < 90 { return "Too many tries for now. You can try again in \(seconds) seconds." }
        let minutes = Int((Double(seconds) / 60).rounded(.up))
        return "Too many tries for now. You can try again in \(minutes) minutes."
    }
}

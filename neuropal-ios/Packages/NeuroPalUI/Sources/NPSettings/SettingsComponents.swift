import NPTheme
import NPTokens
import SwiftUI

/// The parts of Settings (iPhone: rows that push; iPad: the sidebar).
enum SettingsPane: String, CaseIterable, Identifiable, Hashable {
    case look, reading, pal, accessibility, account, about

    var id: String { rawValue }

    var title: String {
        switch self {
        case .look: return "Make it yours"
        case .reading: return "Reading"
        case .pal: return "Pal"
        case .accessibility: return "Accessibility"
        case .account: return "Account"
        case .about: return "About"
        }
    }

    var subtitle: String {
        switch self {
        case .look: return "Skin, colours, motion, background"
        case .reading: return "Voice, speed, font, page"
        case .pal: return "Name, talk style, bubble, look"
        case .accessibility: return "Text size, motion, contrast"
        case .account: return "Sign-in and password"
        case .about: return "Version and privacy"
        }
    }

    var symbol: String {
        switch self {
        case .look: return "paintpalette"
        case .reading: return "text.book.closed"
        case .pal: return "face.smiling"
        case .accessibility: return "accessibility"
        case .account: return "person.crop.circle"
        case .about: return "info.circle"
        }
    }

    /// `-NPSettingsPane look` (a launch argument, for screenshots) opens a pane.
    static var launchPane: SettingsPane? {
        UserDefaults.standard.string(forKey: "NPSettingsPane").flatMap(SettingsPane.init(rawValue:))
    }
}

/// A navigation row: symbol, title, one line of what's inside.
struct PaneRow: View {
    @Environment(\.npTheme) private var theme
    let pane: SettingsPane

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: pane.symbol)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(theme.accentText)
                .frame(width: 30)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(pane.title)
                    .font(theme.font(.bodySemi, size: 16, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                Text(pane.subtitle)
                    .font(theme.font(.body, size: 13, relativeTo: .footnote))
                    .foregroundStyle(theme.onSurfaceVariant)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// Small print under a control (the Expo studio's `Why`).
struct WhyText: View {
    @Environment(\.npTheme) private var theme
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(theme.footnote)
            .foregroundStyle(theme.onSurfaceVariant)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A section header in the skin's voice, not the system's caps.
struct FormHeader: View {
    @Environment(\.npTheme) private var theme
    let title: String
    var trailing: String?

    init(_ title: String, trailing: String? = nil) {
        self.title = title
        self.trailing = trailing
    }

    var body: some View {
        NPSectionHeader(title, trailing: trailing)
            .textCase(nil)
            .padding(.horizontal, -4)
    }
}

extension View {
    /// A Form/List row on the skin's panel colour.
    func npFormRow() -> some View { modifier(FormRowStyle()) }

    /// A Form/List on the skin's background (grid + texture in Signal).
    /// `background: false` when a container already draws it.
    func npForm(background: Bool = true) -> some View { modifier(FormStyle(background: background)) }
}

struct FormRowStyle: ViewModifier {
    @Environment(\.npTheme) private var theme
    func body(content: Content) -> some View {
        content
            .listRowBackground(theme.isSignal ? Color(token: theme.palette.panelColor).opacity(min(0.94, theme.palette.panelAlpha + 0.16))
                                              : theme.surfaceContainer)
            .listRowSeparatorTint(theme.isSignal ? theme.line : theme.outlineVariant)
    }
}

struct FormStyle: ViewModifier {
    @Environment(\.npTheme) private var theme
    var background = true

    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background { if background { NPBackground() } }
            .font(theme.bodyFont)
            .foregroundStyle(theme.onSurface)
            .tint(theme.accentText)
    }
}

/// "AA 6.6:1" / "AAA 7.4:1" for a palette's text contrast.
func contrastBadge(_ ratio: Double) -> String {
    "\(ratio >= 7 ? "AAA" : "AA") \(String(format: "%.1f", ratio)):1"
}

/// A slider row: caps label, the value, the slider; adjustable by VoiceOver
/// swipes (the slider's own), and every change applies at once.
struct SliderRow: View {
    @Environment(\.npTheme) private var theme
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let format: (Double) -> String
    var spoken: ((Double) -> String)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                NPLabel(title)
                Spacer()
                Text(format(value))
                    .font(theme.font(.mono, size: 13, relativeTo: .subheadline))
                    .foregroundStyle(theme.accentText)
            }
            .accessibilityHidden(true)
            Slider(value: $value, in: range, step: step)
                .tint(theme.isSignal ? theme.accentFill : theme.primary)
                .accessibilityLabel(title)
                .accessibilityValue((spoken ?? format)(value))
        }
        .padding(.vertical, 4)
        .alignmentGuide(.listRowSeparatorLeading) { d in d[.leading] }
    }
}

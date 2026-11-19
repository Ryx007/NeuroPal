import NPCore
import NPDay
import NPTheme
import SwiftUI

// Small skin-aware pieces shared by Pal's panels (components/pal/bits.jsx).
// Classic stays soft; Signal gets hard borders, mono labels and an offset
// shadow block.

extension NPTheme {
    func palTint(_ state: NervousState?) -> Color {
        switch state {
        case .green: return secondary
        case .yellow: return tertiary
        case .red: return error
        case nil: return outline
        }
    }

}

/// The panel's title.
struct PanelTitle: View {
    @Environment(\.npTheme) private var theme
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(theme.font(theme.isSignal ? .display : .displaySemi, size: theme.isSignal ? 22 : 20, relativeTo: .title2))
            .tracking(theme.isSignal ? -0.2 : -0.3)
            .foregroundStyle(theme.onSurface)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Pal's quieter line under a title.
struct Intro: View {
    @Environment(\.npTheme) private var theme
    let text: String
    var size: CGFloat = 14
    init(_ text: String, size: CGFloat = 14) {
        self.text = text
        self.size = size
    }

    var body: some View {
        Text(text)
            .font(theme.font(.body, size: size, relativeTo: .callout))
            .foregroundStyle(theme.onSurfaceVariant)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A quiet block for one thing (the suggestion, a step list, the timer).
struct PalCard<Content: View>: View {
    @Environment(\.npTheme) private var theme
    var accent = false
    @ViewBuilder var content: Content

    var body: some View {
        if theme.isSignal {
            let sh = min(5, theme.shadow)
            VStack(alignment: .leading, spacing: 0) { content }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(theme.surfaceHigh, in: RoundedRectangle(cornerRadius: theme.radiusMedium, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: theme.radiusMedium, style: .continuous)
                    .strokeBorder(accent ? theme.accent : theme.line, lineWidth: max(1, theme.border)))
                .background(RoundedRectangle(cornerRadius: theme.radiusMedium, style: .continuous)
                    .fill(theme.shadowColor).offset(x: sh, y: sh))
                .padding(.trailing, sh)
                .padding(.bottom, sh)
        } else {
            VStack(alignment: .leading, spacing: 0) { content }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(accent ? theme.accent.opacity(0.1) : theme.surfaceHigh,
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(accent ? theme.accent.opacity(0.35) : Color.clear, lineWidth: 1))
        }
    }
}

/// Text field in the sheet's style; its edge is ≥ 3:1 in every skin.
struct PalFieldStyle: ViewModifier {
    @Environment(\.npTheme) private var theme
    func body(content: Content) -> some View {
        content
            .font(theme.font(.body, size: 15, relativeTo: .body))
            .foregroundStyle(theme.onSurface)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(minHeight: 48)
            .background(theme.isSignal ? theme.surfaceLowest.opacity(0.6) : theme.surfaceHigh,
                        in: RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 14, style: .continuous)
                .strokeBorder(theme.isSignal ? theme.control : theme.outline, lineWidth: theme.isSignal ? 1.5 : 1))
    }
}

extension View {
    func palField() -> some View { modifier(PalFieldStyle()) }
}

/// Square 44+ pt icon button with a spoken label, and an optional short
/// visible label for the less obvious actions (IconAction).
struct IconActionStyle: ButtonStyle {
    @Environment(\.npTheme) private var theme
    @Environment(\.isEnabled) private var enabled
    var done = false
    var tone: Color?

    func makeBody(configuration: Configuration) -> some View {
        let fg = done ? theme.accentText : (tone ?? theme.onSurface)
        configuration.label
            .font(theme.font(.bodySemi, size: 13, relativeTo: .subheadline))
            .foregroundStyle(fg)
            .padding(.horizontal, 10)
            .frame(minWidth: 44, minHeight: 44)
            .background(configuration.isPressed ? theme.accent.opacity(0.12) : Color.clear,
                        in: RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 12, style: .continuous)
                .strokeBorder(theme.isSignal ? theme.control : theme.outlineVariant.opacity(0.5),
                              lineWidth: theme.isSignal ? 1.5 : 1))
            .opacity(!enabled && !done ? 0.45 : 1)
            .contentShape(Rectangle())
    }
}

/// A plain one-line link-style button ("Clear chat", "Undo").
struct TextActionStyle: ButtonStyle {
    @Environment(\.npTheme) private var theme
    var tone: Color?

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(theme.font(.bodySemi, size: 13.5, relativeTo: .subheadline))
            .foregroundStyle(tone ?? theme.accentText)
            .opacity(configuration.isPressed ? 0.6 : 1)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
    }
}

/// The 3-tap check-in, inline (What now? when you haven't checked in).
struct CheckInRow: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    let value: NervousState?
    let onPick: (NervousState) -> Void

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
        layout {
            ForEach(NervousState.allCases, id: \.self) { s in
                let on = value == s
                let fg = on ? (theme.isSignal ? theme.accentInk : theme.accentText) : theme.onSurface
                Button {
                    onPick(s)
                } label: {
                    VStack(spacing: 4) {
                        StateGlyph(s, color: fg, size: 12)
                        Text(s == .yellow ? "A bit off" : s.label)
                            .font(theme.font(.bodySemi, size: 12.5, relativeTo: .caption))
                            .foregroundStyle(fg)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                    .padding(6)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(on ? (theme.isSignal ? theme.accentFill : theme.accent.opacity(0.14)) : Color.clear,
                                in: RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 16, style: .continuous)
                        .strokeBorder(on ? (theme.isSignal ? theme.shadowColor : theme.accent)
                                      : (theme.isSignal ? theme.control : theme.outline.opacity(0.5)),
                                      lineWidth: on ? 2 : 1.5))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(s.spokenLabel)
                .accessibilityAddTraits(on ? [.isSelected] : [])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("How are you right now?")
    }
}

/// Thin, static progress bar (no animation; it just fills as time passes).
struct PalProgressBar: View {
    @Environment(\.npTheme) private var theme
    let value: Double
    let label: String

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: theme.isSignal ? 2 : 4)
                    .fill(theme.isSignal ? theme.surfaceLowest.opacity(0.8) : theme.outlineVariant.opacity(0.35))
                RoundedRectangle(cornerRadius: theme.isSignal ? 2 : 4)
                    .fill(theme.isSignal ? theme.accentFill : theme.accent)
                    .frame(width: geo.size.width * min(1, max(0, value)))
            }
        }
        .frame(height: 8)
        .overlay(RoundedRectangle(cornerRadius: theme.isSignal ? 2 : 4).strokeBorder(theme.isSignal ? theme.line : Color.clear,
                                                                                    lineWidth: 1))
        .accessibilityElement()
        .accessibilityLabel(label)
        .accessibilityValue("\(Int((min(1, max(0, value)) * 100).rounded())) percent")
    }
}

/// The people to call, under Pal's crisis answer (no network needed).
struct HelpLinesList: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(HelpLines.all) { line in
                Button {
                    if let url = line.url { openURL(url) }
                } label: {
                    Label("\(line.name): \(line.number)", systemImage: "phone.fill")
                }
                .buttonStyle(IconActionStyle())
                .accessibilityLabel("Call \(line.name), \(line.number). \(line.note)")
            }
            Text(HelpLines.elsewhere)
                .font(theme.font(.body, size: 13, relativeTo: .footnote))
                .foregroundStyle(theme.onSurfaceVariant)
        }
    }
}

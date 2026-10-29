import NPCore
import NPDay
import NPTheme
import SwiftUI

// Home's skin-aware building blocks, after the Expo app's primitives.jsx and
// SignalTiles.jsx: Classic is soft and rounded; Signal is "brutal glass" —
// hard borders, a hard offset shadow, mono caps labels.

extension NPTheme {
    /// The colour of a check-in state (stateTint in stateScale.js). Never
    /// used alone: always with the state's word and glyph.
    func homeTint(_ state: NervousState?) -> Color {
        switch state {
        case .green: return secondary
        case .yellow: return tertiary
        case .red: return error
        case nil: return outline
        }
    }

}

/// Signal's panel: the theme's brutal glass (`.npPanel()`): a hard border,
/// a hard offset shadow, the smoked panel over the living field. The
/// shadow's room is kept inside the tile so tiles line up with the gutter.
struct SignalPanel<Content: View>: View {
    @Environment(\.npTheme) private var theme
    var padding: CGFloat = 14
    var flat = false
    @ViewBuilder var content: Content

    var body: some View {
        let sh = flat ? 0 : theme.shadow
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .npPanel(flat: flat)
            .padding(.trailing, sh)
            .padding(.bottom, sh)
    }
}

/// Classic's soft card.
struct ClassicCard<Content: View>: View {
    var fill: Color
    var radius: CGFloat = 22
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// A tile's frame in either skin: Signal's panel, or Classic's card.
struct TileFrame<Content: View>: View {
    @Environment(\.npTheme) private var theme
    var classicFill: Color?
    var classicRadius: CGFloat = 22
    var padding: CGFloat = 14
    @ViewBuilder var content: Content

    var body: some View {
        if theme.isSignal {
            SignalPanel(padding: padding) { content }
        } else {
            ClassicCard(fill: classicFill ?? theme.surfaceContainer, radius: classicRadius, padding: padding + 2) { content }
        }
    }
}

/// Mono caps label (Signal) / quiet caps eyebrow (Classic) — the theme's NPLabel.
struct SkinLabel: View {
    let text: String
    var color: Color?

    init(_ text: String, color: Color? = nil) {
        self.text = text
        self.color = color
    }

    var body: some View { NPLabel(text, color: color) }
}

/// Small mono text (times, windows, counts).
struct MonoText: View {
    @Environment(\.npTheme) private var theme
    let text: String
    var size: CGFloat = 12
    var color: Color?

    init(_ text: String, size: CGFloat = 12, color: Color? = nil) {
        self.text = text
        self.size = size
        self.color = color
    }

    var body: some View {
        Text(text)
            .font(theme.font(.mono, size: size, relativeTo: .caption))
            .foregroundStyle(color ?? theme.onSurfaceVariant)
    }
}

/// Signal's small outlined button (SmallBtn) / Classic's tinted pill.
struct HomeSmallButtonStyle: ButtonStyle {
    @Environment(\.npTheme) private var theme
    /// Classic tint (Signal is always outlined).
    var tint: Color?

    func makeBody(configuration: Configuration) -> some View {
        let t = tint ?? theme.accentText
        configuration.label
            .font(theme.font(theme.isSignal ? .bodyBold : .bodySemi, size: 13, relativeTo: .subheadline))
            .foregroundStyle(theme.isSignal ? theme.onSurface : t)
            .padding(.horizontal, 12)
            .frame(minWidth: 44, minHeight: 44)
            .background(
                RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 12, style: .continuous)
                    .fill(theme.isSignal
                          ? (configuration.isPressed ? theme.accent.opacity(0.14) : Color.clear)
                          : t.opacity(configuration.isPressed ? 0.24 : 0.14)))
            .overlay(
                RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 12, style: .continuous)
                    .strokeBorder(theme.isSignal ? theme.control : t.opacity(0.4), lineWidth: theme.isSignal ? 1.5 : 1))
            .contentShape(Rectangle())
    }
}

/// A one-line tile (size S): icon, label, value, chevron.
struct OneLineTile: View {
    @Environment(\.npTheme) private var theme
    let symbol: String
    let label: String
    let value: String
    var spoken: String?
    var action: (() -> Void)?

    var body: some View {
        Button {
            action?()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: symbol)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(theme.accentText)
                    .accessibilityHidden(true)
                if theme.isSignal {
                    SkinLabel(label)
                } else {
                    Text(label)
                        .font(theme.font(.bodyMedium, size: 13, relativeTo: .subheadline))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
                Text(value)
                    .font(theme.font(theme.isSignal ? .bodyBold : .bodySemi, size: 14, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if action != nil {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .accessibilityHidden(true)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
        .modifier(OneLineFrame())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken ?? "\(label): \(value)")
        .accessibilityAddTraits(action == nil ? [] : .isButton)
    }
}

private struct OneLineFrame: ViewModifier {
    @Environment(\.npTheme) private var theme
    func body(content: Content) -> some View {
        if theme.isSignal {
            SignalPanel(padding: 10) { content.padding(.horizontal, 4) }
        } else {
            ClassicCard(fill: theme.surfaceContainer, radius: 18, padding: 0) {
                content.padding(.horizontal, 16).padding(.vertical, 6)
            }
        }
    }
}

/// Signal's hazard stripes: warning language that never relies on red alone.
struct HazardStripes: Shape {
    var spacing: CGFloat = 6
    var width: CGFloat = 2.5

    func path(in rect: CGRect) -> Path {
        var p = Path()
        var x = rect.minX - rect.height
        while x < rect.maxX {
            p.move(to: CGPoint(x: x, y: rect.maxY))
            p.addLine(to: CGPoint(x: x + rect.height, y: rect.minY))
            p.addLine(to: CGPoint(x: x + rect.height + width, y: rect.minY))
            p.addLine(to: CGPoint(x: x + width, y: rect.maxY))
            p.closeSubpath()
            x += spacing
        }
        return p
    }
}

/// "08:30" in Signal, the user's own clock style (8:30 AM / 08:30) in Classic.
func anchorTime(_ anchor: DayAnchor, signal: Bool, now: Date = Date()) -> String {
    if signal { return anchor.clock }
    return DayData.date(of: anchor, on: now).formatted(date: .omitted, time: .shortened)
}

/// "In 25 minutes" / "In 2 hours" / "Happening now" (NextAnchor in HomeScreen.jsx).
func untilLabel(_ minutes: Int) -> String {
    if minutes <= 0 { return "Happening now" }
    if minutes < 60 { return "In \(minutes) \(minutes == 1 ? "minute" : "minutes")" }
    let h = Int((Double(minutes) / 60).rounded())
    return "In \(h) \(h == 1 ? "hour" : "hours")"
}

/// "flex ±30 min" / "on time".
func windowLabel(_ flex: Int) -> String {
    flex == 0 ? "on time" : flex % 60 == 0 && flex >= 60 ? "±\(flex / 60) h" : "±\(flex) min"
}

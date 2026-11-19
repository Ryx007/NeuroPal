import NPTheme
import NPTokens
import SwiftUI

/// The live preview: a small Home in any appearance — the current look, a
/// proposal or an accent being dragged — drawn without touching the app
/// (Expo StudioScreen `PreviewCard` under `ThemeOverride`).
struct LookPreviewCard: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let appearance: Appearance
    let name: String?
    let proposed: Bool

    var body: some View {
        PreviewContent(name: name, proposed: proposed)
            .npThemeOverride(NPTheme(appearance: appearance, reduceMotion: reduceMotion))
    }
}

private struct PreviewContent: View {
    @Environment(\.npTheme) private var theme
    let name: String?
    let proposed: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: theme.isSignal ? theme.radius : 24, style: .continuous)
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                NPTag("PREVIEW")
                if proposed { NPTag("PROPOSED", strong: true) }
                Spacer(minLength: 6)
                NPTag(contrastBadge(theme.palette.ratio))
            }
            Text(greeting)
                .font(theme.font(.display, size: theme.isSignal ? 30 : 28, relativeTo: .largeTitle))
                .tracking(theme.displayTracking)
                .foregroundStyle(theme.onSurface)
                .padding(.top, 16)
                .fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .center, spacing: 10) {
                Text(sample)
                    .font(theme.font(.body, size: 15, relativeTo: .body))
                    .foregroundStyle(theme.onSurface)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: "play.fill")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(theme.isSignal ? theme.accentInk : theme.onPrimary)
                    .frame(width: 40, height: 40)
                    .background(RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 20, style: .continuous)
                        .fill(theme.isSignal ? theme.accentFill : theme.primary))
            }
            .padding(12)
            .npPanel()
            .padding(.top, 14)
            .padding(.trailing, theme.isSignal ? theme.shadow : 0)
            .padding(.bottom, theme.isSignal ? theme.shadow : 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 214, alignment: .topLeading)
        .background {
            ZStack {
                theme.surface
                if theme.isSignal { NPSignalBackdrop(field: true) }
            }
        }
        .clipShape(shape)
        .overlay(shape.strokeBorder(theme.isSignal ? theme.line : theme.outlineVariant.opacity(0.3),
                                    lineWidth: theme.isSignal ? max(1, theme.border) : 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(summary)
        .accessibilityAddTraits(.isImage)
    }

    private var greeting: String {
        if let name = name?.trimmingCharacters(in: .whitespaces), !name.isEmpty { return "Hello, \(name)." }
        return "Hello."
    }

    /// "The correlation term [survives] even when each arm is incoherent."
    private var sample: AttributedString {
        var lead = AttributedString("The correlation term ")
        lead.foregroundColor = theme.onSurface
        var word = AttributedString(" survives ")
        word.font = theme.font(.bodyBold, size: 15, relativeTo: .body)
        word.foregroundColor = theme.isSignal ? theme.accentInk : theme.onPrimary
        word.backgroundColor = theme.isSignal ? theme.accentFill : theme.primary
        var tail = AttributedString(" even when each arm is incoherent.")
        tail.foregroundColor = theme.onSurface
        return lead + word + tail
    }

    private var summary: String {
        let p = theme.palette
        let a = theme.appearance
        var s: String
        if theme.isSignal {
            s = "Preview: Signal skin, \(a.signal.base) base, \(Tokens.accentName(a.signal.acc)) accent, "
                + "\(p.motion.level.lowercased()) motion, \(p.field.lowercased()) background."
        } else {
            let t = a.classic.theme
            s = "Preview: Classic skin, \(t) theme" + (t == "contrast" ? ", fixed high-contrast colours." : ", \(a.classic.accent) accent.")
        }
        if proposed { s += " Not applied yet." }
        return s + " Contrast \(contrastBadge(p.ratio))."
    }
}

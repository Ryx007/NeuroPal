import NPTheme
import SwiftUI

// Skin-aware pieces the Library, reader and Ask share.
//   Classic — soft glass panels, round controls, accent glow.
//   Signal  — flat panels, hard borders, offset shadows, mono caps labels.
// Every colour comes from the palette; nothing here is a literal.

/// Palette colours and shape values NPTheme doesn't expose as properties.
struct Ink {
    let theme: NPTheme

    var surfaceLowest: Color { Color(token: theme.palette.surfaceLowest) }
    var shadow: Color { Color(token: theme.palette.shadowColor) }
    var primaryContainer: Color { Color(token: theme.palette.primaryContainer) }
    /// The floating panel's fill (Classic sits it on a blur, Signal is near opaque).
    var panelFill: Color {
        Color(token: theme.palette.panelColor)
            .opacity(theme.isSignal ? min(0.94, theme.palette.panelAlpha + 0.16) : theme.palette.panelAlpha)
    }
    /// Signal's hard offset shadow; 0 in Classic.
    var hardShadow: CGFloat { theme.isSignal ? theme.shadow : 0 }
    /// Corner radius for boxed controls.
    var controlRadius: CGFloat { theme.isSignal ? min(14, theme.radiusControl) : 22 }
    /// Corner radius for list cards.
    var cardRadius: CGFloat { theme.isSignal ? theme.radiusMedium : 20 }
    /// Corner radius for chat bubbles.
    var bubbleRadius: CGFloat { theme.isSignal ? max(4, theme.radiusMedium - 2) : 18 }
}

extension View {
    /// The skin's floating panel (player bar, notices).
    func readerPanel(radius: CGFloat? = nil) -> some View { modifier(ReaderPanel(radius: radius)) }

    /// The skin's list card (library rows, upload rows).
    func readerCard(selected: Bool = false) -> some View { modifier(ReaderCard(selected: selected)) }
}

struct ReaderPanel: ViewModifier {
    @Environment(\.npTheme) private var theme
    var radius: CGFloat?

    func body(content: Content) -> some View {
        let ink = Ink(theme: theme)
        let shape = RoundedRectangle(cornerRadius: radius ?? (theme.isSignal ? theme.radius : 26), style: .continuous)
        if theme.isSignal {
            content
                .background(ink.panelFill, in: shape)
                .overlay(shape.strokeBorder(theme.line, lineWidth: max(1, theme.border)))
                .background(shape.fill(ink.shadow).offset(x: ink.hardShadow, y: ink.hardShadow))
        } else {
            content
                .background(ink.panelFill, in: shape)
                .background(.ultraThinMaterial, in: shape)
                .overlay(shape.strokeBorder(theme.outlineVariant.opacity(0.45), lineWidth: 0.5))
                .shadow(color: ink.shadow.opacity(theme.palette.dark ? 0.4 : 0.14), radius: 18, y: 6)
        }
    }
}

struct ReaderCard: ViewModifier {
    @Environment(\.npTheme) private var theme
    var selected: Bool

    func body(content: Content) -> some View {
        let ink = Ink(theme: theme)
        let shape = RoundedRectangle(cornerRadius: ink.cardRadius, style: .continuous)
        content
            .background(theme.isSignal ? ink.panelFill : theme.surfaceContainer, in: shape)
            .overlay {
                if selected {
                    shape.strokeBorder(theme.accentText, lineWidth: 2)
                } else if theme.isSignal {
                    shape.strokeBorder(theme.line, lineWidth: max(1, theme.border))
                } else {
                    shape.strokeBorder(theme.outlineVariant.opacity(0.3), lineWidth: 0.5)
                }
            }
            .background(shape.fill(ink.shadow).offset(x: ink.hardShadow * 0.6, y: ink.hardShadow * 0.6))
    }
}

/// Small caps label: Signal's mono label, Classic's accent eyebrow.
struct SkinLabel: View {
    @Environment(\.npTheme) private var theme
    let text: String
    var color: Color?

    init(_ text: String, color: Color? = nil) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text.uppercased())
            .font(theme.font(theme.isSignal ? .label : .bodySemi, size: 11, relativeTo: .caption2))
            .tracking(theme.isSignal ? 1.2 : 1.6)
            .foregroundStyle(color ?? (theme.isSignal ? theme.onSurfaceVariant : theme.accentText))
    }
}

/// A 44 pt icon control. Signal draws a box, Classic a quiet circle on press.
struct ReaderIconButtonStyle: ButtonStyle {
    @Environment(\.npTheme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    var size: CGFloat = 44
    /// nil = the skin decides (Signal boxed, Classic plain).
    var boxed: Bool?

    func makeBody(configuration: Configuration) -> some View {
        let ink = Ink(theme: theme)
        let box = boxed ?? theme.isSignal
        let shape = RoundedRectangle(cornerRadius: box ? ink.controlRadius : size / 2, style: .continuous)
        configuration.label
            .labelStyle(.iconOnly)
            .font(theme.font(.bodySemi, size: 19, relativeTo: .body))
            .foregroundStyle(theme.onSurface)
            .frame(minWidth: size, minHeight: size)
            .background {
                if box {
                    shape.fill(configuration.isPressed ? theme.accent.opacity(0.18) : theme.surfaceContainer.opacity(0.7))
                    shape.strokeBorder(theme.control, lineWidth: 1.5)
                } else if configuration.isPressed {
                    shape.fill(theme.onSurface.opacity(0.1))
                }
            }
            .contentShape(shape)
            .opacity(isEnabled ? 1 : 0.38)
            .hoverEffect(.highlight)
    }
}

/// The big play/pause control.
struct ReaderPlayButtonStyle: ButtonStyle {
    @Environment(\.npTheme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    var size: CGFloat = 60

    func makeBody(configuration: Configuration) -> some View {
        let ink = Ink(theme: theme)
        if theme.isSignal {
            let shape = RoundedRectangle(cornerRadius: min(16, theme.radiusControl), style: .continuous)
            let drop = max(3, ink.hardShadow)
            let shift = configuration.isPressed ? drop : 0
            configuration.label
                .labelStyle(.iconOnly)
                .font(theme.font(.bodyBold, size: 26, relativeTo: .title2))
                .foregroundStyle(theme.accentInk)
                .frame(width: size, height: size)
                .background(theme.accentFill, in: shape)
                .overlay(shape.strokeBorder(ink.shadow, lineWidth: 2))
                .offset(x: shift, y: shift)
                .background(shape.fill(ink.shadow).offset(x: drop, y: drop))
                .contentShape(shape)
                .opacity(isEnabled ? 1 : 0.4)
        } else {
            configuration.label
                .labelStyle(.iconOnly)
                .font(theme.font(.bodyBold, size: 26, relativeTo: .title2))
                .foregroundStyle(theme.accentInk)
                .frame(width: size, height: size)
                .background(theme.accentFill, in: Circle())
                .shadow(color: theme.accent.opacity(0.4), radius: 14, y: 6)
                .scaleEffect(configuration.isPressed && theme.animates ? 0.94 : 1)
                .contentShape(Circle())
                .opacity(isEnabled ? 1 : 0.4)
                .hoverEffect(.lift)
        }
    }
}

/// Chips: filters, starter questions, citations. Visual height 36, hit area 44.
struct ReaderChipStyle: ButtonStyle {
    @Environment(\.npTheme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    var selected = false
    /// Tint for the text and border (citations use the tertiary colour).
    var tint: Color?

    func makeBody(configuration: Configuration) -> some View {
        let ink = Ink(theme: theme)
        let shape = RoundedRectangle(cornerRadius: theme.isSignal ? ink.controlRadius - 4 : 18, style: .continuous)
        let accent = tint ?? theme.accentText
        configuration.label
            .font(theme.font(.bodyMedium, size: 13, relativeTo: .footnote))
            .foregroundStyle(selected || tint != nil ? accent : theme.onSurface)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(minHeight: 36)
            .background(shape.fill(selected ? accent.opacity(0.16) : theme.surfaceHigh.opacity(configuration.isPressed ? 0.7 : 1)))
            .overlay(shape.strokeBorder(selected || tint != nil ? accent.opacity(0.45) : (theme.isSignal ? theme.line : theme.outlineVariant.opacity(0.5)),
                                        lineWidth: theme.isSignal ? 1.5 : 1))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .opacity(isEnabled ? 1 : 0.45)
            .hoverEffect(.highlight)
    }
}

/// A calm full-area state: an icon, a title, a line of explanation, an action.
struct ReaderStateView<Actions: View>: View {
    @Environment(\.npTheme) private var theme
    let symbol: String
    let title: String
    let message: String
    @ViewBuilder var actions: Actions

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: symbol)
                .font(theme.font(.bodySemi, size: 34, relativeTo: .largeTitle))
                .foregroundStyle(theme.accentText)
                .accessibilityHidden(true)
            Text(title)
                .font(theme.title)
                .foregroundStyle(theme.onSurface)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .font(theme.bodyFont)
                .foregroundStyle(theme.onSurfaceVariant)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            actions
                .padding(.top, 6)
        }
        .frame(maxWidth: 460)
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

extension ReaderStateView where Actions == EmptyView {
    init(symbol: String, title: String, message: String) {
        self.init(symbol: symbol, title: title, message: message) { EmptyView() }
    }
}

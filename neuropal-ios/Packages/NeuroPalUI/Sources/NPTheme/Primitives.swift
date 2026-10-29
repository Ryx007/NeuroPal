import NPTokens
import SwiftUI

// Skin-aware primitives, after neuropal-expo-app/src/components/primitives.jsx.
// Classic: soft glass panels, pill controls. Signal: brutal glass — a smoked
// panel with a hard border and an OFFSET shadow block, mono caps labels,
// solid buttons that press INTO their shadow.

// MARK: - Panels

/// The skin's panel behind any content: `.npPanel()`.
public struct NPPanelModifier: ViewModifier {
    @Environment(\.npTheme) private var theme
    var radius: CGFloat?
    var flat: Bool
    var pressed: Bool
    var tint: Color?

    public func body(content: Content) -> some View {
        let r = radius.map { theme.skinRadius($0) } ?? (theme.isSignal ? theme.radius : 24)
        let shape = RoundedRectangle(cornerRadius: r, style: .continuous)
        if theme.isSignal {
            let sh = flat ? 0 : theme.shadow
            let alpha = min(0.94, theme.palette.panelAlpha + 0.16)
            content
                .background {
                    ZStack(alignment: .top) {
                        shape.fill(.ultraThinMaterial)
                        shape.fill((tint ?? Color(token: theme.palette.panelColor)).opacity(alpha))
                        Rectangle().fill(Color.white.opacity(0.09)).frame(height: 1)
                    }
                    .clipShape(shape)
                }
                .overlay {
                    if theme.border > 0 { shape.strokeBorder(theme.line, lineWidth: theme.border) }
                }
                .offset(x: pressed ? sh : 0, y: pressed ? sh : 0)
                .background {
                    // The hard shadow stays put; a pressed panel sinks into it.
                    if sh > 0 { shape.fill(theme.shadowColor).offset(x: sh, y: sh) }
                }
                .animation(theme.animates ? .easeOut(duration: 0.08) : nil, value: pressed)
        } else {
            content
                .background {
                    ZStack(alignment: .top) {
                        shape.fill((tint ?? theme.surfaceContainer).opacity(0.82))
                        // The soft specular top edge — the liquid-glass signature.
                        Rectangle().fill(Color.white.opacity(0.09)).frame(height: 1)
                    }
                    .clipShape(shape)
                }
                .overlay { shape.strokeBorder(theme.outlineVariant.opacity(0.15), lineWidth: 1) }
                .opacity(pressed ? 0.88 : 1)
        }
    }
}

public extension View {
    /// The skin's panel (card) background. `radius` is a Classic-era radius
    /// (scaled into Signal's corner setting); `flat` drops Signal's hard shadow.
    func npPanel(radius: CGFloat? = nil, flat: Bool = false, pressed: Bool = false, tint: Color? = nil) -> some View {
        modifier(NPPanelModifier(radius: radius, flat: flat, pressed: pressed, tint: tint))
    }
}

/// A card: the skin's panel around a column of content.
public struct NPCard<Content: View>: View {
    private let padding: CGFloat
    private let spacing: CGFloat
    private let flat: Bool
    private let content: Content

    public init(padding: CGFloat = 16, spacing: CGFloat = 8, flat: Bool = false, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.spacing = spacing
        self.flat = flat
        self.content = content()
    }

    public var body: some View {
        // One stack, so the modifiers style the card, not each child.
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .npPanel(flat: flat)
    }
}

/// A whole card that is a button: it sinks into its shadow when pressed (Signal).
public struct NPPanelButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label.npPanel(pressed: configuration.isPressed).contentShape(Rectangle())
    }
}

public extension ButtonStyle where Self == NPPanelButtonStyle {
    static var npPanel: NPPanelButtonStyle { NPPanelButtonStyle() }
}

// MARK: - Buttons

/// Primary button. Signal: a solid accent block that presses into its
/// shadow. Classic: a solid accent pill with a soft glow (solid, not the
/// Expo gradient, so the label keeps ≥ 4.5:1 across the whole button).
public struct NPPrimaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        PrimaryBody(configuration: configuration)
    }

    private struct PrimaryBody: View {
        @Environment(\.npTheme) private var theme
        @Environment(\.isEnabled) private var isEnabled
        let configuration: Configuration

        var body: some View {
            let pressed = configuration.isPressed
            if theme.isSignal {
                let sh = theme.shadow
                let shape = RoundedRectangle(cornerRadius: theme.radiusControl, style: .continuous)
                configuration.label
                    .font(theme.font(.bodyBold, size: 15, relativeTo: .headline))
                    .foregroundStyle(theme.accentInk)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .frame(minHeight: 48)
                    .background(shape.fill(theme.accentFill))
                    .overlay(shape.strokeBorder(theme.shadowColor, lineWidth: max(1, theme.border)))
                    .offset(x: pressed ? sh : 0, y: pressed ? sh : 0)
                    .background { if sh > 0 { shape.fill(theme.accentDeep).offset(x: sh, y: sh) } }
                    .contentShape(Rectangle())
                    .opacity(isEnabled ? 1 : 0.45)
                    .animation(theme.animates ? .easeOut(duration: 0.08) : nil, value: pressed)
            } else {
                let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
                configuration.label
                    .font(theme.font(.displaySemi, size: 15, relativeTo: .headline))
                    .foregroundStyle(theme.onPrimary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 12)
                    .frame(minHeight: 48)
                    .background(shape.fill(theme.primary))
                    .shadow(color: theme.accent.opacity(isEnabled ? 0.3 : 0), radius: 12, y: 6)
                    .contentShape(Rectangle())
                    .opacity(isEnabled ? (pressed ? 0.9 : 1) : 0.45)
            }
        }
    }
}

/// Secondary ("ghost") button: outlined. Signal: control-coloured edge,
/// on-surface label. Classic: faint edge, accent label.
public struct NPSecondaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        SecondaryBody(configuration: configuration)
    }

    private struct SecondaryBody: View {
        @Environment(\.npTheme) private var theme
        @Environment(\.isEnabled) private var isEnabled
        let configuration: Configuration

        var body: some View {
            let r = theme.isSignal ? theme.radiusControl : 14
            let shape = RoundedRectangle(cornerRadius: r, style: .continuous)
            configuration.label
                .font(theme.isSignal ? theme.font(.bodyBold, size: 15, relativeTo: .headline)
                                     : theme.font(.displaySemi, size: 15, relativeTo: .headline))
                .foregroundStyle(theme.isSignal ? theme.onSurface : theme.accentText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .frame(minHeight: 48)
                .background(shape.fill(configuration.isPressed ? theme.accentText.opacity(0.08) : Color.clear))
                .overlay(shape.strokeBorder(theme.isSignal ? theme.control : theme.outline.opacity(0.45),
                                            lineWidth: theme.isSignal ? 1.5 : 1))
                .contentShape(Rectangle())
                .opacity(isEnabled ? 1 : 0.45)
        }
    }
}

public extension ButtonStyle where Self == NPPrimaryButtonStyle {
    static var npPrimary: NPPrimaryButtonStyle { NPPrimaryButtonStyle() }
}

public extension ButtonStyle where Self == NPSecondaryButtonStyle {
    static var npSecondary: NPSecondaryButtonStyle { NPSecondaryButtonStyle() }
}

/// Icon + title for a button label. (A `Label` inside a List/Form row takes
/// the row's icon column, which spreads a button's contents apart.)
public struct NPButtonLabel: View {
    private let title: String
    private let systemImage: String

    public init(_ title: String, systemImage: String) {
        self.title = title
        self.systemImage = systemImage
    }

    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage).imageScale(.medium).accessibilityHidden(true)
            Text(title)
        }
    }
}

/// A square icon button (≥ 44 pt) in the skin's control shape.
public struct NPIconButton: View {
    @Environment(\.npTheme) private var theme
    private let symbol: String
    private let label: String
    private let filled: Bool
    private let action: () -> Void

    public init(_ symbol: String, label: String, filled: Bool = false, action: @escaping () -> Void) {
        self.symbol = symbol
        self.label = label
        self.filled = filled
        self.action = action
    }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: theme.isSignal ? theme.radiusControl : 14, style: .continuous)
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .semibold))
                .frame(width: 48, height: 48)
                .foregroundStyle(filled ? (theme.isSignal ? theme.accentInk : theme.onPrimary) : theme.onSurface)
                .background(shape.fill(filled ? (theme.isSignal ? theme.accentFill : theme.primary) : Color.clear))
                .overlay { if !filled { shape.strokeBorder(theme.isSignal ? theme.control : theme.outline.opacity(0.45), lineWidth: 1.5) } }
                .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Labels and headers

/// Mono caps engineering label (Signal) / quiet accent eyebrow (Classic).
public struct NPLabel: View {
    @Environment(\.npTheme) private var theme
    private let text: String
    private let color: Color?

    public init(_ text: String, color: Color? = nil) {
        self.text = text
        self.color = color
    }

    public var body: some View {
        Text(text)
            .font(theme.isSignal ? theme.font(.label, size: 11, relativeTo: .caption)
                                 : theme.font(.bodyMedium, size: 11, relativeTo: .caption))
            .tracking(theme.labelTracking)
            .textCase(.uppercase)
            .foregroundStyle(color ?? (theme.isSignal ? theme.outline : theme.accentText))
    }
}

/// A section header: mono label (Signal) or display semibold (Classic), an
/// optional caps note on the right.
public struct NPSectionHeader: View {
    @Environment(\.npTheme) private var theme
    private let title: String
    private let trailing: String?

    public init(_ title: String, trailing: String? = nil) {
        self.title = title
        self.trailing = trailing
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Group {
                if theme.isSignal {
                    Text(title)
                        .font(theme.font(.label, size: 12, relativeTo: .subheadline))
                        .tracking(theme.labelTracking)
                        .textCase(.uppercase)
                        .foregroundStyle(theme.outline)
                } else {
                    Text(title)
                        .font(theme.font(.displaySemi, size: 16, relativeTo: .headline))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
            }
            .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            if let trailing {
                Text(trailing)
                    .font(theme.isSignal ? theme.font(.label, size: 11, relativeTo: .caption)
                                         : theme.font(.bodyMedium, size: 11, relativeTo: .caption))
                    .tracking(theme.isSignal ? 1.2 : 2)
                    .textCase(.uppercase)
                    .foregroundStyle(theme.accentText)
            }
        }
        .padding(.horizontal, 4)
    }
}

/// A small mono tag ("PREVIEW", "AA 6.6:1"); `strong` fills it with the accent.
public struct NPTag: View {
    @Environment(\.npTheme) private var theme
    private let text: String
    private let strong: Bool

    public init(_ text: String, strong: Bool = false) {
        self.text = text
        self.strong = strong
    }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: theme.isSignal ? min(6, theme.radiusControl) : 8, style: .continuous)
        Text(text)
            .font(theme.font(.mono, size: 10.5, relativeTo: .caption2))
            .tracking(0.8)
            .foregroundStyle(strong ? (theme.isSignal ? theme.accentInk : theme.onPrimary) : theme.onSurface)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(shape.fill(strong ? (theme.isSignal ? theme.accentFill : theme.primary) : theme.surfaceContainer.opacity(0.9)))
            .overlay { if !strong { shape.strokeBorder(theme.isSignal ? theme.line : theme.outlineVariant.opacity(0.4), lineWidth: 1) } }
    }
}

// MARK: - Choices

/// A selectable chip. Selection is never colour-only: a check mark and the
/// VoiceOver "selected" trait come with it.
public struct NPChip: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    private let label: String
    private let selected: Bool
    private let symbol: String?
    private let compact: Bool
    private let accessibilityText: String?
    private let action: () -> Void

    public init(_ label: String, selected: Bool = false, symbol: String? = nil, compact: Bool = false,
                accessibilityLabel: String? = nil, action: @escaping () -> Void) {
        self.label = label
        self.selected = selected
        self.symbol = symbol
        self.compact = compact
        self.accessibilityText = accessibilityLabel
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if selected {
                    Image(systemName: "checkmark").font(.system(size: 12, weight: .bold))
                } else if let symbol {
                    Image(systemName: symbol).font(.system(size: 13, weight: .semibold))
                }
                Text(label)
                    .font(theme.font(.bodySemi, size: 14, relativeTo: .subheadline))
                    .multilineTextAlignment(.center)
            }
            .foregroundStyle(selected ? theme.selectionInk : theme.onSurface)
            .padding(.horizontal, compact ? 10 : 13)
            .padding(.vertical, 8)
            .frame(minWidth: 44, minHeight: 44)
            .background(chipShape.fill(selected ? theme.selectionFill : Color.clear))
            .overlay(chipShape.strokeBorder(edge, lineWidth: 1.5))
            .contentShape(chipShape)
        }
        .buttonStyle(NPChipPressStyle())
        .opacity(isEnabled ? 1 : 0.42)
        .accessibilityLabel(accessibilityText ?? label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var chipShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: min(theme.radiusControl, 22), style: .continuous)
    }

    private var edge: Color {
        if selected { return theme.isSignal ? theme.shadowColor : theme.accentText }
        return theme.isSignal ? theme.control : theme.outline.opacity(0.6)
    }
}

/// Pressed chips dim slightly (no motion needed).
struct NPChipPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// One choice out of a few, as wrapping chips under a caps label — the Expo
/// SegmentRow / Studio fine-tune rows. Each chip reads "Label: Option".
public struct NPChoiceRow<Value: Hashable>: View {
    private let title: String
    private let options: [(value: Value, label: String)]
    private let selection: Value
    private let compact: Bool
    private let onSelect: (Value) -> Void

    public init(_ title: String, options: [(value: Value, label: String)], selection: Value, compact: Bool = false,
                onSelect: @escaping (Value) -> Void) {
        self.title = title
        self.options = options
        self.selection = selection
        self.compact = compact
        self.onSelect = onSelect
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            NPLabel(title).accessibilityHidden(true)
            NPFlowLayout(spacing: 6, lineSpacing: 6) {
                ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                    NPChip(option.label, selected: option.value == selection, compact: compact,
                           accessibilityLabel: "\(title): \(option.label)") {
                        if option.value != selection { onSelect(option.value) }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A colour swatch radio (44 pt), with a check that reads on the colour.
public struct NPSwatch: View {
    @Environment(\.npTheme) private var theme
    private let hex: String
    private let selected: Bool
    private let label: String
    private let action: () -> Void

    public init(hex: String, selected: Bool, label: String, action: @escaping () -> Void) {
        self.hex = hex
        self.selected = selected
        self.label = label
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            ZStack {
                Circle().strokeBorder(selected ? theme.onSurface : theme.outlineVariant, lineWidth: selected ? 3 : 1.5)
                Circle().fill(Color(token: hex)).frame(width: 30, height: 30)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(Color(token: Tokens.palFaceInk(hex)))
                }
            }
            .frame(width: 44, height: 44)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// The skin's switch colours: `.npToggleTint()` on a Toggle.
public extension View {
    func npToggleTint() -> some View { modifier(NPToggleTint()) }
}

struct NPToggleTint: ViewModifier {
    @Environment(\.npTheme) private var theme
    func body(content: Content) -> some View {
        content.tint(theme.isSignal ? theme.accentFill : theme.primary)
    }
}

// MARK: - Motion

/// The small "live" dot next to a header: breathes slowly, still when the
/// theme doesn't animate.
public struct NPDataPulse: View {
    @Environment(\.npTheme) private var theme
    @State private var on = false
    private let size: CGFloat

    public init(size: CGFloat = 7) { self.size = size }

    public var body: some View {
        Circle()
            .fill(theme.isSignal ? theme.accentFill : theme.accent)
            .frame(width: size, height: size)
            .scaleEffect(theme.animates && on ? 1.3 : 1)
            .opacity(theme.animates ? (on ? 1 : 0.4) : 1)
            .accessibilityHidden(true)
            .onAppear { on = true }
            .animation(theme.animates ? .easeInOut(duration: 1.8).repeatForever(autoreverses: true) : nil, value: on)
    }
}

// MARK: - Layout

/// Lays children out in rows, wrapping to the next line when full.
public struct NPFlowLayout: Layout {
    public var spacing: CGFloat
    public var lineSpacing: CGFloat

    public init(spacing: CGFloat = 8, lineSpacing: CGFloat = 8) {
        self.spacing = spacing
        self.lineSpacing = lineSpacing
    }

    public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0
        var widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0, x + size.width > width {
                y += lineHeight + lineSpacing
                x = 0
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + lineHeight)
    }

    public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var lineHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            if x > bounds.minX, x + size.width > bounds.maxX {
                y += lineHeight + lineSpacing
                x = bounds.minX
                lineHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: min(size.width, bounds.width), height: size.height))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

// MARK: - Placeholder

/// A screen that isn't built yet — keeps the shell navigable meanwhile.
public struct NPPlaceholder: View {
    @Environment(\.npTheme) private var theme
    let title: String
    let note: String
    public init(_ title: String, note: String = "Coming in this round.") {
        self.title = title
        self.note = note
    }

    public var body: some View {
        ZStack {
            NPBackground()
            VStack(spacing: 8) {
                Text(title).font(theme.title).foregroundStyle(theme.onSurface)
                Text(note).font(theme.bodyFont).foregroundStyle(theme.onSurfaceVariant)
            }
            .multilineTextAlignment(.center)
            .padding()
        }
    }
}

// MARK: - Preview gallery

private struct PrimitivesGallery: View {
    @Environment(\.npTheme) private var theme
    @State private var choice = "Calm"
    @State private var on = true

    var body: some View {
        ZStack {
            NPBackground(field: true)
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    NPSectionHeader("Primitives", trailing: "Live")
                    NPCard {
                        NPLabel("Card")
                        Text("A panel in the skin's shape.").font(theme.bodyFont).foregroundStyle(theme.onSurface)
                        HStack {
                            Button("Primary") {}.buttonStyle(.npPrimary)
                            Button("Secondary") {}.buttonStyle(.npSecondary)
                        }
                    }
                    NPChoiceRow("Motion", options: ["Still", "Calm", "Lively", "Wild"].map { (value: $0, label: $0) },
                                selection: choice) { choice = $0 }
                    HStack {
                        NPTag("PREVIEW")
                        NPTag("PROPOSED", strong: true)
                        NPDataPulse()
                        NPSwatch(hex: theme.palette.accentFill, selected: true, label: "Accent") {}
                        NPIconButton("arrow.up", label: "Send", filled: true) {}
                    }
                    Toggle("A toggle", isOn: $on).npToggleTint().foregroundStyle(theme.onSurface)
                }
                .padding(20)
            }
        }
    }
}

#Preview("Primitives — Classic") {
    PrimitivesGallery().npTheme(.classic)
}

#Preview("Primitives — Signal") {
    PrimitivesGallery().npTheme(.signal)
}

import SwiftUI

/// The screen background: the palette surface, edge to edge.
public struct NPBackground: View {
    @Environment(\.npTheme) private var theme
    public init() {}
    public var body: some View { theme.surface.ignoresSafeArea() }
}

/// A card: surface container, the skin's corner radius and border.
public struct NPCard<Content: View>: View {
    @Environment(\.npTheme) private var theme
    private let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }

    public var body: some View {
        // One stack, so the modifiers style the card, not each child.
        VStack(alignment: .leading, spacing: 8) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.surfaceContainer, in: RoundedRectangle(cornerRadius: theme.radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
                    .strokeBorder(theme.line, lineWidth: theme.border))
    }
}

/// Primary button: accent fill, accent ink, ≥ 44 pt tall.
public struct NPPrimaryButtonStyle: ButtonStyle {
    @Environment(\.npTheme) private var theme
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(theme.font(.bodySemi, size: 16, relativeTo: .headline))
            .foregroundStyle(theme.accentInk)
            .padding(.horizontal, 20)
            .frame(minHeight: 48)
            .background(theme.accentFill, in: RoundedRectangle(cornerRadius: min(theme.radiusControl, 24), style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .contentShape(Rectangle())
    }
}

/// Secondary button: outlined, on-surface text.
public struct NPSecondaryButtonStyle: ButtonStyle {
    @Environment(\.npTheme) private var theme
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(theme.font(.bodyMedium, size: 16, relativeTo: .headline))
            .foregroundStyle(theme.onSurface)
            .padding(.horizontal, 20)
            .frame(minHeight: 48)
            .background(
                RoundedRectangle(cornerRadius: min(theme.radiusControl, 24), style: .continuous)
                    .strokeBorder(theme.outline, lineWidth: max(1, theme.border)))
            .opacity(configuration.isPressed ? 0.7 : 1)
            .contentShape(Rectangle())
    }
}

public extension ButtonStyle where Self == NPPrimaryButtonStyle {
    static var npPrimary: NPPrimaryButtonStyle { NPPrimaryButtonStyle() }
}

public extension ButtonStyle where Self == NPSecondaryButtonStyle {
    static var npSecondary: NPSecondaryButtonStyle { NPSecondaryButtonStyle() }
}

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

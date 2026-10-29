import NPTokens
import SwiftUI

/// The skin's type roles (TYPE_ROLES in packages/tokens). Every font scales
/// with Dynamic Type through `relativeTo:`.
public enum NPTypeRole: String, CaseIterable, Sendable {
    case display, displaySemi, body, bodyMedium, bodySemi, bodyBold, mono, label
}

public extension NPTheme {
    /// PostScript name for a role in this skin. SKELETON: the Theme agent
    /// maps Signal's type option (Wide / Condensed / Grotesk) and the
    /// reader fonts.
    func fontName(_ role: NPTypeRole) -> String {
        if isSignal {
            switch role {
            case .display: return "ArchivoSemiExpanded-Black"
            case .displaySemi: return "Archivo-Bold"
            case .body: return "AtkinsonHyperlegibleNext-Regular"
            case .bodyMedium: return "AtkinsonHyperlegibleNext-Medium"
            case .bodySemi: return "AtkinsonHyperlegibleNext-SemiBold"
            case .bodyBold: return "AtkinsonHyperlegibleNext-Bold"
            case .mono: return "AtkinsonHyperlegibleMono-Regular"
            case .label: return "AtkinsonHyperlegibleMono-Bold"
            }
        }
        switch role {
        case .display: return "SpaceGrotesk-Bold"
        case .displaySemi: return "SpaceGrotesk-SemiBold"
        case .body: return "Inter-Regular"
        case .bodyMedium: return "Inter-Medium"
        case .bodySemi: return "Inter-SemiBold"
        case .bodyBold: return "Inter-Bold"
        case .mono, .label: return "JetBrainsMono-Regular"
        }
    }

    func font(_ role: NPTypeRole, size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(fontName(role), size: size, relativeTo: style)
    }

    // The common sizes.
    var largeTitle: Font { font(.display, size: 32, relativeTo: .largeTitle) }
    var title: Font { font(.display, size: 24, relativeTo: .title) }
    var headline: Font { font(.displaySemi, size: 18, relativeTo: .headline) }
    var bodyFont: Font { font(.body, size: 16, relativeTo: .body) }
    var callout: Font { font(.bodyMedium, size: 15, relativeTo: .callout) }
    var caption: Font { font(.label, size: 12, relativeTo: .caption) }
}

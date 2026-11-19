import CoreText
import NPTokens
import SwiftUI

/// The skin's type roles (TYPE_ROLES in packages/tokens). Every font scales
/// with Dynamic Type through `relativeTo:`.
public enum NPTypeRole: String, CaseIterable, Sendable {
    case display, displaySemi, body, bodyMedium, bodySemi, bodyBold, mono, label
}

public extension NPTheme {
    /// PostScript name for a role in this skin — the Expo app's `fontsFor`:
    /// Classic = Space Grotesk / Inter / JetBrains Mono; Signal = Archivo
    /// display (Wide = SemiExpanded Black, Condensed = Condensed ExtraBold,
    /// Grotesk = Space Grotesk), Atkinson Hyperlegible Next body, Atkinson
    /// Hyperlegible Mono labels.
    func fontName(_ role: NPTypeRole) -> String {
        if isSignal {
            let type = palette.type
            switch role {
            case .display:
                switch type {
                case "Condensed": return "ArchivoCondensed-ExtraBold"
                case "Grotesk": return "SpaceGrotesk-Bold"
                default: return "ArchivoSemiExpanded-Black"
                }
            case .displaySemi: return type == "Grotesk" ? "SpaceGrotesk-SemiBold" : "Archivo-Bold"
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

    /// Letter spacing of the label role (Signal's mono caps / Classic's eyebrow).
    var labelTracking: CGFloat { isSignal ? 1.6 : 2.4 }

    /// Display letter spacing (Expo: Signal -0.4, Classic -0.8 at title sizes).
    var displayTracking: CGFloat { isSignal ? -0.4 : -0.8 }

    // The common sizes.
    var largeTitle: Font { font(.display, size: isSignal ? 34 : 32, relativeTo: .largeTitle) }
    var title: Font { font(.display, size: 24, relativeTo: .title) }
    var headline: Font { font(.displaySemi, size: 18, relativeTo: .headline) }
    var bodyFont: Font { font(.body, size: 16, relativeTo: .body) }
    var callout: Font { font(.bodyMedium, size: 15, relativeTo: .callout) }
    var caption: Font { font(.label, size: 12, relativeTo: .caption) }
    /// Small print under a control (Expo `Why`).
    var footnote: Font { font(.body, size: 13, relativeTo: .footnote) }
    /// Button labels.
    var buttonFont: Font { isSignal ? font(.bodyBold, size: 15, relativeTo: .headline) : font(.displaySemi, size: 15, relativeTo: .headline) }

    /// The reading font: the user's pick (a PostScript name from
    /// `NPReaderFont.all`), else the skin's body face.
    func readerFontName(_ choice: String?) -> String {
        guard let choice, NPReaderFont.all.contains(where: { $0.id == choice }) else { return fontName(.body) }
        return choice
    }

    func readerFont(_ choice: String?, size: CGFloat) -> Font {
        .custom(readerFontName(choice), size: size, relativeTo: .body)
    }
}

/// The reading fonts Settings offers (bundled TTFs, packages/tokens/fonts).
public struct NPReaderFont: Identifiable, Hashable, Sendable {
    /// PostScript name (stored in `AppPreferences.readerFont`).
    public let id: String
    public let name: String
    /// Why someone might pick it.
    public let note: String

    public static let all: [NPReaderFont] = [
        NPReaderFont(id: "AtkinsonHyperlegible-Regular", name: "Atkinson Hyperlegible",
                     note: "Made for low vision: letters that can't be mistaken for each other."),
        NPReaderFont(id: "Inter-Regular", name: "Inter", note: "Clean and even, good at small sizes."),
        NPReaderFont(id: "Lora-Regular", name: "Lora", note: "A soft serif, like a printed book."),
        NPReaderFont(id: "Fraunces-Regular", name: "Fraunces", note: "A warm, old-style serif."),
        NPReaderFont(id: "JetBrainsMono-Regular", name: "JetBrains Mono", note: "Every letter the same width."),
    ]
}

/// Registers the bundled TTFs for this process. The app already lists them
/// in UIAppFonts; an app extension (the widgets) doesn't, so it can call
/// this to use the same faces. Looks in `fonts/` of the running bundle,
/// then of the containing app. Safe to call more than once.
public enum NPFonts {
    @MainActor private static var registered = false

    @MainActor public static func registerBundledFonts() {
        guard !registered else { return }
        registered = true
        let candidates = [
            Bundle.main.bundleURL.appending(path: "fonts", directoryHint: .isDirectory),
            // An extension lives in App.app/PlugIns/X.appex.
            Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
                .appending(path: "fonts", directoryHint: .isDirectory),
        ]
        for dir in candidates {
            guard let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { continue }
            let fonts = files.filter { $0.pathExtension.lowercased() == "ttf" }
            guard !fonts.isEmpty else { continue }
            for url in fonts {
                // Already registered (UIAppFonts) is fine — the error is ignored.
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
            return
        }
    }
}

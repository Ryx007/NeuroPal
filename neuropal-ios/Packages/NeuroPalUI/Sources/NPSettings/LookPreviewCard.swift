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

/// Pal, drawn still (the animated Pal lives in NPPal): the Expo Pal.jsx
/// geometry — a 168 × 148 body in a padded 260 × 240 box so the extras can
/// stick out.
struct PalFigure: View {
    @Environment(\.npTheme) private var theme
    let pal: Appearance.Pal
    var size: CGFloat = 120

    var body: some View {
        let p = Tokens.normalizePal(pal)
        let bodyHex = Tokens.palBodyHex(p.colour)
        let accentHex = theme.isSignal ? theme.palette.accentFill : theme.palette.accent
        let visorHex = Tokens.palVisor(bodyHex, accentHex)
        let ink = Color(token: Tokens.palFaceInk(bodyHex))
        let bodyColor = Color(token: bodyHex)
        let accent = Color(token: accentHex)
        let visor = Color(token: visorHex)
        let glint = visorHex == accentHex ? Color.white.opacity(0.85) : bodyColor
        let stroke = theme.isSignal ? theme.shadowColor : theme.outlineVariant
        let shadow: CGFloat = theme.isSignal ? max(3, theme.shadow) : 0
        Canvas { gc, canvasSize in
            let k = canvasSize.width / 260
            gc.scaleBy(x: k, y: k)
            gc.translateBy(x: 46, y: 50)
            func line(_ path: Path, _ width: CGFloat, _ color: Color) {
                gc.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
            }
            if p.extra == "Antenna" {
                line(Path { $0.move(to: CGPoint(x: 84, y: 2)); $0.addLine(to: CGPoint(x: 84, y: -28)) }, 4, stroke)
                let knob = Path(ellipseIn: CGRect(x: 75, y: -46, width: 18, height: 18))
                gc.fill(knob, with: .color(accent))
                line(knob, 3, stroke)
            }
            let shape = Self.bodyPath(p.shape)
            if shadow > 0 { gc.fill(shape.offsetBy(dx: shadow, dy: shadow), with: .color(stroke)) }
            gc.fill(shape, with: .color(bodyColor))
            line(shape, 3, stroke)
            if p.extra == "Headphones" {
                line(Path { $0.move(to: CGPoint(x: -6, y: 74)); $0.addCurve(to: CGPoint(x: 174, y: 74), control1: CGPoint(x: -10, y: -26), control2: CGPoint(x: 178, y: -26)) }, 9, stroke)
                for x in [-22.0, 164.0] {
                    let cup = Path(roundedRect: CGRect(x: x, y: 54, width: 26, height: 46), cornerRadius: 11)
                    gc.fill(cup, with: .color(accent))
                    line(cup, 3, stroke)
                }
            }
            if p.extra == "Lab goggles" {
                line(Path { $0.move(to: CGPoint(x: 0, y: 22)); $0.addLine(to: CGPoint(x: 168, y: 22)) }, 7, stroke)
                for cx in [60.0, 108.0] {
                    let lens = Path(ellipseIn: CGRect(x: cx - 17, y: 5, width: 34, height: 34))
                    gc.fill(lens, with: .color(Color(.sRGB, red: 190 / 255, green: 235 / 255, blue: 1, opacity: 0.6)))
                    line(lens, 4, stroke)
                }
            }
            switch p.eyes {
            case "Visor":
                let v = Path(roundedRect: CGRect(x: 24, y: 44, width: 120, height: 32), cornerRadius: 16)
                gc.fill(v, with: .color(visor))
                line(v, 3, stroke)
                gc.fill(Path(roundedRect: CGRect(x: 46, y: 53, width: 16, height: 12), cornerRadius: 5), with: .color(glint))
                gc.fill(Path(roundedRect: CGRect(x: 106, y: 53, width: 16, height: 12), cornerRadius: 5), with: .color(glint))
            case "Dots":
                for cx in [60.0, 108.0] {
                    gc.fill(Path(ellipseIn: CGRect(x: cx - 11, y: 51, width: 22, height: 22)), with: .color(ink))
                    gc.fill(Path(ellipseIn: CGRect(x: cx + 0.5, y: 54.5, width: 7, height: 7)), with: .color(bodyColor))
                }
            case "Sleepy":
                line(Path {
                    $0.move(to: CGPoint(x: 46, y: 60)); $0.addQuadCurve(to: CGPoint(x: 74, y: 60), control: CGPoint(x: 60, y: 72))
                    $0.move(to: CGPoint(x: 94, y: 60)); $0.addQuadCurve(to: CGPoint(x: 122, y: 60), control: CGPoint(x: 108, y: 72))
                }, 5, ink)
            default: // Wide
                for cx in [58.0, 110.0] {
                    let eye = Path(ellipseIn: CGRect(x: cx - 18, y: 42, width: 36, height: 36))
                    gc.fill(eye, with: .color(.white))
                    line(eye, 3, stroke)
                    gc.fill(Path(ellipseIn: CGRect(x: cx - 4, y: 56, width: 16, height: 16)), with: .color(Color(token: "#141416")))
                }
            }
            switch p.mouth {
            case "Oh":
                gc.fill(Path(ellipseIn: CGRect(x: 76, y: 95, width: 16, height: 18)), with: .color(ink))
            case "Smile":
                line(Path { $0.move(to: CGPoint(x: 66, y: 98)); $0.addQuadCurve(to: CGPoint(x: 102, y: 98), control: CGPoint(x: 84, y: 114)) }, 5, ink)
            case "Flat":
                line(Path { $0.move(to: CGPoint(x: 70, y: 104)); $0.addLine(to: CGPoint(x: 98, y: 104)) }, 5, ink)
            default:
                break
            }
            if p.extra == "Scarf" {
                let band = Path(roundedRect: CGRect(x: 10, y: 114, width: 148, height: 22), cornerRadius: 11)
                gc.fill(band, with: .color(accent))
                line(band, 3, stroke)
                let tail = Path(roundedRect: CGRect(x: 116, y: 122, width: 20, height: 46), cornerRadius: 6)
                    .applying(CGAffineTransform(translationX: 126, y: 145).rotated(by: -10 * .pi / 180).translatedBy(x: -126, y: -145))
                gc.fill(tail, with: .color(accent))
                line(tail, 3, stroke)
            }
        }
        .frame(width: size, height: size * 240 / 260)
    }

    static func bodyPath(_ shape: String) -> Path {
        switch shape {
        case "Box":
            return Path(roundedRect: CGRect(x: 0, y: 0, width: 168, height: 148), cornerRadius: 27)
        case "Moon":
            return Path(ellipseIn: CGRect(x: 0, y: 0, width: 168, height: 148))
        case "Bean":
            return Path { p in
                p.move(to: CGPoint(x: 66, y: 3))
                p.addCurve(to: CGPoint(x: 165, y: 78), control1: CGPoint(x: 116, y: -6), control2: CGPoint(x: 167, y: 25))
                p.addCurve(to: CGPoint(x: 76, y: 146), control1: CGPoint(x: 163, y: 127), control2: CGPoint(x: 124, y: 150))
                p.addCurve(to: CGPoint(x: 3, y: 70), control1: CGPoint(x: 29, y: 142), control2: CGPoint(x: 1, y: 113))
                p.addCurve(to: CGPoint(x: 66, y: 3), control1: CGPoint(x: 5, y: 30), control2: CGPoint(x: 28, y: 9))
                p.closeSubpath()
            }
        default: // Pebble
            return Path { p in
                p.move(to: CGPoint(x: 84, y: 0))
                p.addCurve(to: CGPoint(x: 168, y: 78), control1: CGPoint(x: 131, y: 0), control2: CGPoint(x: 168, y: 32))
                p.addCurve(to: CGPoint(x: 84, y: 148), control1: CGPoint(x: 168, y: 121), control2: CGPoint(x: 131, y: 148))
                p.addCurve(to: CGPoint(x: 0, y: 78), control1: CGPoint(x: 37, y: 148), control2: CGPoint(x: 0, y: 121))
                p.addCurve(to: CGPoint(x: 84, y: 0), control1: CGPoint(x: 0, y: 32), control2: CGPoint(x: 37, y: 0))
                p.closeSubpath()
            }
        }
    }
}

import NPCore
import SwiftUI

// Pal, the user's own companion character, drawn in SwiftUI — a port of
// neuropal-expo-app/src/components/pal/Pal.jsx (same geometry: a 168×148
// body box in a padded 260×240 view box so accessories can stick out).
//
// It lives in NPDay because Home (NPHome), Pal's sheet (NPPal) and the
// widget extension all draw it and NPDay is the module they all link. It
// takes the resolved Palette instead of the UI theme for the same reason.

/// The colours Pal is drawn with, from the look (pal.js: palFaceInk, palVisor).
public struct PalColors: Equatable, Sendable {
    public let body: String
    public let ink: String
    public let accent: String
    public let visor: String
    public let stroke: String
    /// Signal's hard offset shadow (0 in Classic).
    public let shadow: CGFloat

    public init(pal: Appearance.Pal, palette: Palette) {
        let signal = palette.skin == "signal"
        body = Tokens.data["palOptions"]?["colour"]?[pal.colour]?.stringValue ?? "#E4E4E8"
        ink = Tokens.palFaceInk(body)
        accent = signal ? palette.accentFill : palette.accent
        visor = Tokens.palVisor(body, accent)
        stroke = signal ? palette.shadowColor : palette.outlineVariant
        shadow = signal ? max(3, palette.shape.shadow) : 0
    }
}

/// One still frame of Pal. `PalAvatar` adds breathing and blinking.
public struct PalFigure: View {
    public let pal: Appearance.Pal
    public let colors: PalColors
    public var mood: PalMood
    public var size: CGFloat
    public var blink: Bool
    public var speaking: Bool
    public var mouthOpen: Bool

    public init(pal: Appearance.Pal, palette: Palette, mood: PalMood = .okay, size: CGFloat = 120, blink: Bool = false,
                speaking: Bool = false, mouthOpen: Bool = false) {
        self.pal = pal
        self.colors = PalColors(pal: pal, palette: palette)
        self.mood = mood
        self.size = size
        self.blink = blink
        self.speaking = speaking
        self.mouthOpen = mouthOpen
    }

    /// Height for a width (the 260:240 view box).
    public static func height(for size: CGFloat) -> CGFloat { size * 240 / 260 }

    public var body: some View {
        let s = size / 260
        let t = CGAffineTransform(translationX: 46, y: 50).concatenating(CGAffineTransform(scaleX: s, y: s))
        let bodyFill = Color(dayHex: colors.body)
        let ink = Color(dayHex: colors.ink)
        let accent = Color(dayHex: colors.accent)
        let visor = Color(dayHex: colors.visor)
        let stroke = Color(dayHex: colors.stroke)
        let glint = colors.visor == colors.accent ? Color(dayHex: "#FFFFFF").opacity(0.85) : bodyFill
        let inset: CGFloat = mood == .over ? 13 : mood == .off ? 8 : 0
        let eyesOpacity = mood == .over ? 0.45 : mood == .off ? 0.85 : 1
        let showOh = pal.mouth == "Oh" || (speaking && pal.mouth == "None") || (speaking && mouthOpen)

        return ZStack(alignment: .topLeading) {
            if pal.extra == "Antenna" {
                Self.path { $0.move(to: CGPoint(x: 84, y: 2)); $0.addLine(to: CGPoint(x: 84, y: -28)) }
                    .applying(t).stroke(stroke, style: Self.line(4, s))
                Self.circle(84, -37, 9).applying(t).fill(accent)
                Self.circle(84, -37, 9).applying(t).stroke(stroke, style: Self.line(3, s))
            }
            if colors.shadow > 0 {
                Self.bodyShape(pal.shape).applying(CGAffineTransform(translationX: colors.shadow, y: colors.shadow))
                    .applying(t).fill(stroke)
            }
            Self.bodyShape(pal.shape).applying(t).fill(bodyFill)
            Self.bodyShape(pal.shape).applying(t).stroke(stroke, style: Self.line(3, s))
            if pal.extra == "Headphones" {
                Self.path {
                    $0.move(to: CGPoint(x: -6, y: 74))
                    $0.addCurve(to: CGPoint(x: 174, y: 74), control1: CGPoint(x: -10, y: -26), control2: CGPoint(x: 178, y: -26))
                }
                .applying(t).stroke(stroke, style: Self.line(9, s))
                ForEach([CGFloat(-22), 164], id: \.self) { x in
                    Self.rounded(x, 54, 26, 46, 11).applying(t).fill(accent)
                    Self.rounded(x, 54, 26, 46, 11).applying(t).stroke(stroke, style: Self.line(3, s))
                }
            }
            if pal.extra == "Lab goggles" {
                Self.path { $0.move(to: CGPoint(x: 0, y: 22)); $0.addLine(to: CGPoint(x: 168, y: 22)) }
                    .applying(t).stroke(stroke, style: StrokeStyle(lineWidth: 7 * s))
                ForEach([CGFloat(60), 108], id: \.self) { x in
                    Self.circle(x, 22, 17).applying(t).fill(Color(dayHex: "#BEEBFF").opacity(0.6))
                    Self.circle(x, 22, 17).applying(t).stroke(stroke, style: Self.line(4, s))
                }
            }
            eyes(t: t, s: s, ink: ink, body: bodyFill, visor: visor, glint: glint, stroke: stroke, inset: inset)
                .opacity(eyesOpacity)
            if showOh {
                Path(ellipseIn: CGRect(x: 84 - 8, y: 104 - (speaking && !mouthOpen ? 4 : 9), width: 16,
                                       height: speaking && !mouthOpen ? 8 : 18))
                    .applying(t).fill(ink)
            } else if pal.mouth == "Smile" {
                Self.path {
                    $0.move(to: CGPoint(x: 66, y: 98))
                    $0.addQuadCurve(to: CGPoint(x: 102, y: 98), control: CGPoint(x: 84, y: 114))
                }
                .applying(t).stroke(ink, style: Self.line(5, s))
            } else if pal.mouth == "Flat" {
                Self.path { $0.move(to: CGPoint(x: 70, y: 104)); $0.addLine(to: CGPoint(x: 98, y: 104)) }
                    .applying(t).stroke(ink, style: Self.line(5, s))
            }
            if pal.extra == "Scarf" {
                Self.rounded(10, 114, 148, 22, 11).applying(t).fill(accent)
                Self.rounded(10, 114, 148, 22, 11).applying(t).stroke(stroke, style: Self.line(3, s))
                let tail = Self.rounded(116, 122, 20, 46, 6).applying(Self.rotation(-10, aroundX: 126, y: 145))
                tail.applying(t).fill(accent)
                tail.applying(t).stroke(stroke, style: Self.line(3, s))
            }
        }
        .frame(width: size, height: Self.height(for: size), alignment: .topLeading)
    }

    @ViewBuilder
    private func eyes(t: CGAffineTransform, s: CGFloat, ink: Color, body: Color, visor: Color, glint: Color, stroke: Color,
                      inset: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            switch pal.eyes {
            case "Dots":
                if blink {
                    Self.path {
                        $0.move(to: CGPoint(x: 50, y: 62)); $0.addLine(to: CGPoint(x: 70, y: 62))
                        $0.move(to: CGPoint(x: 98, y: 62)); $0.addLine(to: CGPoint(x: 118, y: 62))
                    }
                    .applying(t).stroke(ink, style: Self.line(5, s))
                } else {
                    Self.circle(60, 62, 11).applying(t).fill(ink)
                    Self.circle(108, 62, 11).applying(t).fill(ink)
                    Self.circle(64, 58, 3.5).applying(t).fill(body)
                    Self.circle(112, 58, 3.5).applying(t).fill(body)
                }
            case "Sleepy":
                Self.path {
                    $0.move(to: CGPoint(x: 46, y: 60)); $0.addQuadCurve(to: CGPoint(x: 74, y: 60), control: CGPoint(x: 60, y: 72))
                    $0.move(to: CGPoint(x: 94, y: 60)); $0.addQuadCurve(to: CGPoint(x: 122, y: 60), control: CGPoint(x: 108, y: 72))
                }
                .applying(t).stroke(ink, style: Self.line(5, s))
            case "Wide":
                if blink {
                    Self.path {
                        $0.move(to: CGPoint(x: 42, y: 62)); $0.addLine(to: CGPoint(x: 74, y: 62))
                        $0.move(to: CGPoint(x: 94, y: 62)); $0.addLine(to: CGPoint(x: 126, y: 62))
                    }
                    .applying(t).stroke(ink, style: Self.line(5, s))
                } else {
                    ForEach([CGFloat(58), 110], id: \.self) { x in
                        Self.circle(x, 60, 18).applying(t).fill(Color(dayHex: "#FFFFFF"))
                        Self.circle(x, 60, 18).applying(t).stroke(stroke, style: Self.line(3, s))
                        Self.circle(x + 4, 64, 8).applying(t).fill(Color(dayHex: "#141416"))
                    }
                }
            default: // "Visor"
                let visorRect = blink
                    ? Self.rounded(24 + inset, 58, 120 - 2 * inset, 4, 2)
                    : Self.rounded(24 + inset, 44, 120 - 2 * inset, 32, 16)
                visorRect.applying(t).fill(visor)
                visorRect.applying(t).stroke(stroke, style: Self.line(3, s))
                if !blink {
                    Self.rounded(46 + inset / 2, 53, 16, 12, 5).applying(t).fill(glint)
                    Self.rounded(106 - inset / 2, 53, 16, 12, 5).applying(t).fill(glint)
                }
            }
        }
    }

    // MARK: Geometry (view-box coordinates)

    /// A round-capped stroke `w` view-box units wide at scale `s`.
    static func line(_ w: CGFloat, _ s: CGFloat) -> StrokeStyle {
        StrokeStyle(lineWidth: w * s, lineCap: .round, lineJoin: .round)
    }

    static func path(_ build: (inout Path) -> Void) -> Path {
        var p = Path()
        build(&p)
        return p
    }

    static func circle(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r))
    }

    static func rounded(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> Path {
        Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: min(r, min(w, h) / 2), style: .circular)
    }

    static func rotation(_ degrees: CGFloat, aroundX x: CGFloat, y: CGFloat) -> CGAffineTransform {
        CGAffineTransform(translationX: -x, y: -y)
            .concatenating(CGAffineTransform(rotationAngle: degrees * .pi / 180))
            .concatenating(CGAffineTransform(translationX: x, y: y))
    }

    /// The body: Pebble (default), Bean, Box or Moon.
    static func bodyShape(_ shape: String) -> Path {
        switch shape {
        case "Box":
            return rounded(0, 0, 168, 148, 27)
        case "Moon":
            return Path(ellipseIn: CGRect(x: 0, y: 0, width: 168, height: 148))
        case "Bean":
            return path {
                $0.move(to: CGPoint(x: 66, y: 3))
                $0.addCurve(to: CGPoint(x: 165, y: 78), control1: CGPoint(x: 116, y: -6), control2: CGPoint(x: 167, y: 25))
                $0.addCurve(to: CGPoint(x: 76, y: 146), control1: CGPoint(x: 163, y: 127), control2: CGPoint(x: 124, y: 150))
                $0.addCurve(to: CGPoint(x: 3, y: 70), control1: CGPoint(x: 29, y: 142), control2: CGPoint(x: 1, y: 113))
                $0.addCurve(to: CGPoint(x: 66, y: 3), control1: CGPoint(x: 5, y: 30), control2: CGPoint(x: 28, y: 9))
                $0.closeSubpath()
            }
        default:
            return path {
                $0.move(to: CGPoint(x: 84, y: 0))
                $0.addCurve(to: CGPoint(x: 168, y: 78), control1: CGPoint(x: 131, y: 0), control2: CGPoint(x: 168, y: 32))
                $0.addCurve(to: CGPoint(x: 84, y: 148), control1: CGPoint(x: 168, y: 121), control2: CGPoint(x: 131, y: 148))
                $0.addCurve(to: CGPoint(x: 0, y: 78), control1: CGPoint(x: 37, y: 148), control2: CGPoint(x: 0, y: 121))
                $0.addCurve(to: CGPoint(x: 84, y: 0), control1: CGPoint(x: 0, y: 32), control2: CGPoint(x: 37, y: 0))
                $0.closeSubpath()
            }
        }
    }
}

/// Pal with a life: breathes and blinks (not when overwhelmed — quieter, not
/// alarming), moves its mouth while speaking. Still when `motion` is
/// "Still" (which already follows the OS Reduce Motion setting).
public struct PalAvatar: View {
    public let pal: Appearance.Pal
    public let palette: Palette
    public var mood: PalMood
    public var size: CGFloat
    /// The theme's motion level: "Still" | "Calm" | "Lively" | "Wild".
    public var motion: String
    public var speaking: Bool
    /// nil = decorative (hidden from VoiceOver; the control around it speaks).
    public var accessibilityLabel: String?

    @State private var breath = false
    @State private var blink = false
    @State private var mouthOpen = false

    public init(pal: Appearance.Pal, palette: Palette, mood: PalMood = .okay, size: CGFloat = 120, motion: String = "Calm",
                speaking: Bool = false, accessibilityLabel: String? = nil) {
        self.pal = pal
        self.palette = palette
        self.mood = mood
        self.size = size
        self.motion = motion
        self.speaking = speaking
        self.accessibilityLabel = accessibilityLabel
    }

    private var lively: Bool { motion != "Still" && mood != .over }

    public var body: some View {
        PalFigure(pal: pal, palette: palette, mood: mood, size: size, blink: blink, speaking: speaking,
                  mouthOpen: mouthOpen)
            .scaleEffect(breath ? 1.03 : 1)
            .offset(y: breath ? -2 * size / 120 : 0)
            .animation(lively ? .easeInOut(duration: motion == "Calm" ? 3.5 : 2.25).repeatForever(autoreverses: true)
                       : .default, value: breath)
            .onAppear { breath = lively }
            .onChange(of: lively) { _, on in
                if on {
                    breath = true
                } else {
                    var quiet = Transaction()
                    quiet.disablesAnimations = true
                    withTransaction(quiet) { breath = false }
                }
            }
            .task(id: lively) {
                guard lively else { return }
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(5.2))
                    guard !Task.isCancelled else { return }
                    blink = true
                    try? await Task.sleep(for: .milliseconds(140))
                    blink = false
                }
            }
            .task(id: speaking && motion != "Still") {
                mouthOpen = false
                guard speaking && motion != "Still" else { return }
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(160))
                    mouthOpen.toggle()
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabel ?? "")
            .accessibilityHidden(accessibilityLabel == nil)
    }
}

public extension Appearance.Pal {
    /// "Pal: pebble shape, chalk body, visor eyes, smile mouth, headphones" (palDescription).
    var spokenDescription: String {
        let extraWords = extra == "None" ? "no extras" : extra.lowercased()
        let mouthWords = mouth == "None" ? "no mouth" : "\(mouth.lowercased()) mouth"
        return "\(name): \(shape.lowercased()) shape, \(colour.lowercased()) body, \(eyes.lowercased()) eyes, "
            + "\(mouthWords), \(extraWords)"
    }
}

extension Color {
    /// "#RRGGBB" → Color, for the drawings in this module (the UI modules use
    /// NPTheme's Color(token:)).
    init(dayHex hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        let v = UInt64(s, radix: 16) ?? 0x808080
        self.init(.sRGB, red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255,
                  blue: Double(v & 0xFF) / 255, opacity: 1)
    }
}

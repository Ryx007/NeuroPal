import CoreGraphics
import NPTokens
import SwiftUI

/// The screen background: the palette surface, edge to edge. In Signal it
/// also carries the engineering grid and the texture (Grain / Scanlines),
/// and — where `field` is on (Home, the studio preview) — the living
/// background (Chladni sand or interference fringes), like the Expo app's
/// SignalBackdrop. Classic stays a plain surface. Decorative: hidden from
/// VoiceOver, never hit-testable, and completely still when the theme
/// doesn't animate (Motion "Still" or the OS Reduce Motion setting).
public struct NPBackground: View {
    @Environment(\.npTheme) private var theme
    private let field: Bool
    private let redState: Bool

    public init() {
        field = false
        redState = false
    }

    /// - Parameters:
    ///   - field: show the living field (Home and the studio preview only —
    ///     never behind reading text).
    ///   - redState: the user checked in as overwhelmed: the field slows
    ///     and fades (RED_STATE_FIELD).
    public init(field: Bool, redState: Bool = false) {
        self.field = field
        self.redState = redState
    }

    public var body: some View {
        ZStack {
            theme.surface
            if theme.isSignal { NPSignalBackdrop(field: field, redState: redState) }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Signal's grid + optional field + texture, drawn for the current theme.
/// (Use NPBackground; this is public for custom containers such as cards.)
public struct NPSignalBackdrop: View {
    @Environment(\.npTheme) private var theme
    private let field: Bool
    private let redState: Bool

    public init(field: Bool = false, redState: Bool = false) {
        self.field = field
        self.redState = redState
    }

    public var body: some View {
        let p = theme.palette
        let showField = field && (p.field == "Chladni" || p.field == "Interference")
        let red = Tokens.tables
        let speed = theme.motionSpeed * (redState ? red.redStateFieldSpeed : 1)
        let amplitude = (p.dark ? 0.62 : 0.42) * (redState ? red.redStateFieldAmplitude : 1)
        let gridStrong = p.field == "Grid"
        ZStack {
            if showField {
                NPFieldView(mode: p.field == "Interference" ? .interference : .chladni,
                            accent: p.accentFill, base: p.surface, speed: speed, amplitude: amplitude)
            }
            NPGridLayer(color: Color(token: p.grid).opacity(gridStrong ? p.gridAlpha * 2.6 : p.gridAlpha))
            if p.texture == "Scanlines" { NPScanlineLayer() }
            if p.texture == "Grain" { NPGrainLayer(opacity: p.dark ? 0.5 : 0.7) }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

// MARK: - Grid and textures (static)

/// 1 pt lines every 23 pt (the Expo SVG pattern).
struct NPGridLayer: View {
    let color: Color

    var body: some View {
        Canvas { gc, size in
            var path = Path()
            var x: CGFloat = 0.5
            while x < size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                x += 23
            }
            var y: CGFloat = 0.5
            while y < size.height {
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                y += 23
            }
            gc.stroke(path, with: .color(color), lineWidth: 1)
        }
    }
}

/// A 1 pt dark line every 3 pt (rgba(0,0,0,0.35) at 50 %).
struct NPScanlineLayer: View {
    var body: some View {
        Canvas { gc, size in
            var path = Path()
            var y: CGFloat = 0
            while y < size.height {
                path.addRect(CGRect(x: 0, y: y, width: size.width, height: 1))
                y += 3
            }
            gc.fill(path, with: .color(.black.opacity(0.175)))
        }
    }
}

/// Film grain: a 96 × 96 noise tile (grey speckles at low alpha, like the
/// Expo app's grain.png), repeated.
struct NPGrainLayer: View {
    let opacity: Double

    var body: some View {
        if let tile = GrainTile.image {
            Image(decorative: tile, scale: 1)
                .resizable(resizingMode: .tile)
                .interpolation(.none)
                .opacity(opacity)
        }
    }
}

enum GrainTile {
    static let image: CGImage? = {
        let side = 96
        var px = [UInt8](repeating: 0, count: side * side * 4)
        var state: UInt64 = 0x9E37_79B9_7F4A_7C15
        func next() -> Double {
            // splitmix64 — deterministic, so the grain never shimmers.
            state &+= 0x9E37_79B9_7F4A_7C15
            var z = state
            z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
            z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
            return Double((z ^ (z >> 31)) >> 11) / Double(1 << 53)
        }
        for i in 0..<(side * side) {
            let grey = UInt8(36 * Int(next() * 8))
            let r = next()
            let alpha = r < 0.41 ? 0 : UInt8(14 * (1 + min(4, Int((r - 0.41) / 0.59 * 5))))
            // Premultiplied RGBA.
            let g = UInt8((Int(grey) * Int(alpha)) / 255)
            px[i * 4] = g
            px[i * 4 + 1] = g
            px[i * 4 + 2] = g
            px[i * 4 + 3] = alpha
        }
        guard let provider = CGDataProvider(data: Data(px) as CFData) else { return nil }
        return CGImage(width: side, height: side, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: side * 4,
                       space: CGColorSpace(name: CGColorSpace.sRGB)!,
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    }()
}

// MARK: - The living field

/// Signal's living background — a CPU port of the Expo/web fragment shader,
/// drawn into a small bitmap (one sample per ~2 pt) and scaled up crisp.
///   Chladni: sand gathers on a square plate's nodal lines, morphing between
///            (n, m) modes every 9 s of simulated time.
///   Interference: two in-phase sources; the fringes stay put, the grains on
///            the bright fringes swell outward.
/// `speed` 0 draws one still frame (a clean (2, 6) plate) and stops.
/// The sand is static (no twinkle): nothing flickers.
struct NPFieldView: View {
    enum Mode { case chladni, interference }

    let mode: Mode
    let accent: String
    let base: String
    let speed: Double
    let amplitude: Double
    @State private var model = FieldModel()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: speed <= 0)) { context in
            Canvas(opaque: true) { gc, size in
                let t = model.advance(to: context.date, speed: speed)
                guard let image = model.renderer.image(mode: mode, size: size, time: t, accent: accent, base: base,
                                                       amplitude: amplitude)
                else { return }
                gc.draw(Image(decorative: image.cgImage, scale: 1).interpolation(.none),
                        in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
            }
        }
    }
}

/// Simulated time for one field (advances only while it animates).
final class FieldModel {
    /// A clean single mode, (2, 6), for still frames (the web's STILL_TIME).
    static let stillTime = 9.5
    private(set) var time = FieldModel.stillTime
    private var last: Date?
    let renderer = FieldRenderer()

    func advance(to date: Date, speed: Double) -> Double {
        defer { last = speed > 0 ? date : nil }
        guard speed > 0, let last else { return time }
        let dt = min(0.05, max(0, date.timeIntervalSince(last)))
        time += dt * speed
        // Wrap after 100 Chladni cycles so the value stays small.
        if time > 5400 { time -= 5400 }
        return time
    }
}

/// Fills the field bitmap. Everything that doesn't change between frames
/// (grain thresholds, the interference geometry, the plate's cosine tables)
/// is cached per size.
final class FieldRenderer {
    struct Frame {
        let cgImage: CGImage
        let width: CGFloat
        let height: CGFloat
    }

    private var columns = 0
    private var rows = 0
    private var cell: CGFloat = 2
    private var hash: [Float] = []
    // Interference, per cell.
    private var interferenceReady = false
    private var thresholdBase: [Float] = []
    private var glow: [Float] = []
    private var phaseCos: [Float] = []
    private var phaseSin: [Float] = []
    // Chladni cosine tables for the current pair of modes.
    private var modes: (Int, Int, Int, Int) = (0, 0, 0, 0)
    private var colN1: [Float] = [], colQ1: [Float] = [], colN2: [Float] = [], colQ2: [Float] = []
    private var rowN1: [Float] = [], rowQ1: [Float] = [], rowN2: [Float] = [], rowQ2: [Float] = []
    private var pixels: [UInt8] = []

    /// At most ~160 000 samples per frame (one per ~1.5 pt on a phone,
    /// one per point on a small card).
    private static let maxCells: CGFloat = 160_000

    func image(mode: NPFieldView.Mode, size: CGSize, time: Double, accent: String, base: String, amplitude: Double) -> Frame? {
        guard size.width >= 1, size.height >= 1 else { return nil }
        prepare(size)
        let n = columns * rows
        let acc = Tokens.hexToRgb(accent) ?? Tokens.RGB(255, 61, 46)
        let bg = Tokens.hexToRgb(base) ?? Tokens.RGB(20, 20, 22)
        let ar = Float(acc.r), ag = Float(acc.g), ab = Float(acc.b)
        let br = Float(bg.r), bgG = Float(bg.g), bb = Float(bg.b)
        let amp = Float(amplitude)
        if pixels.count != n * 4 { pixels = [UInt8](repeating: 255, count: n * 4) }

        switch mode {
        case .interference:
            prepareInterference(size)
            let omega = Float(time * 1.7)
            let cw = cos(omega), sw = sin(omega)
            let tb = thresholdBase, gl = glow, pc = phaseCos, ps = phaseSin, hs = hash
            pixels.withUnsafeMutableBufferPointer { out in
                for i in 0..<n {
                    let carrier = 0.5 + 0.5 * (pc[i] * cw + ps[i] * sw)
                    let grain: Float = hs[i] < tb[i] * (0.55 + 0.45 * carrier) ? 0.75 : 0
                    let a = min(1, max(0, (gl[i] + grain) * amp))
                    out[i * 4] = UInt8(br + (ar - br) * a)
                    out[i * 4 + 1] = UInt8(bgG + (ag - bgG) * a)
                    out[i * 4 + 2] = UInt8(bb + (ab - bb) * a)
                }
            }
        case .chladni:
            let period = (time / 9).rounded(.down)
            let i0 = Int(period)
            let frac = Float(time / 9 - period)
            let s = smoothstep(0.2, 0.8, frac)
            let n1 = 1 + i0 % 3, q1 = n1 + 2 + 2 * (i0 % 2)
            let n2 = 1 + (i0 + 1) % 3, q2 = n2 + 2 + 2 * ((i0 + 1) % 2)
            prepareChladni(size, n1, q1, n2, q2)
            let cols = columns, rws = rows
            let cn1 = colN1, cq1 = colQ1, cn2 = colN2, cq2 = colQ2
            let rn1 = rowN1, rq1 = rowQ1, rn2 = rowN2, rq2 = rowQ2
            let hs = hash
            pixels.withUnsafeMutableBufferPointer { out in
                for y in 0..<rws {
                    let yn1 = rn1[y], yq1 = rq1[y], yn2 = rn2[y], yq2 = rq2[y]
                    for x in 0..<cols {
                        let i = y * cols + x
                        let f1 = cn1[x] * yq1 - cq1[x] * yn1
                        let f2 = cn2[x] * yq2 - cq2[x] * yn2
                        let f = f1 + (f2 - f1) * s
                        var a: Float = 0
                        if abs(f) < 0.3 { // beyond that the line is < e^-16: plain base
                            let z = f / 0.075
                            let line = exp(-z * z)
                            let grain: Float = hs[i] < line * 0.95 ? 0.8 : 0
                            a = min(1, max(0, (line * 0.2 + grain) * amp))
                        }
                        out[i * 4] = UInt8(br + (ar - br) * a)
                        out[i * 4 + 1] = UInt8(bgG + (ag - bgG) * a)
                        out[i * 4 + 2] = UInt8(bb + (ab - bb) * a)
                    }
                }
            }
        }

        guard let provider = CGDataProvider(data: Data(pixels) as CFData),
              let cg = CGImage(width: columns, height: rows, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: columns * 4,
                               space: CGColorSpace(name: CGColorSpace.sRGB)!,
                               bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                               provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
        else { return nil }
        return Frame(cgImage: cg, width: CGFloat(columns) * cell, height: CGFloat(rows) * cell)
    }

    private func smoothstep(_ e0: Float, _ e1: Float, _ x: Float) -> Float {
        let t = min(1, max(0, (x - e0) / (e1 - e0)))
        return t * t * (3 - 2 * t)
    }

    /// Grid of samples for this size, and the static grain thresholds.
    private func prepare(_ size: CGSize) {
        let c = max(1, (size.width * size.height / Self.maxCells).squareRoot())
        let cols = Int((size.width / c).rounded(.up))
        let rws = Int((size.height / c).rounded(.up))
        guard cols != columns || rws != rows || c != cell else { return }
        columns = cols
        rows = rws
        cell = c
        interferenceReady = false
        modes = (0, 0, 0, 0)
        pixels = []
        hash = (0..<(cols * rws)).map { i in Self.hash(UInt32(i % cols), UInt32(i / cols)) }
    }

    /// Centre of cell (x, y) in the shader's p space: origin mid-screen,
    /// y up, the short side spanning −0.5…0.5.
    private func p(_ x: Int, _ y: Int, _ size: CGSize) -> (Float, Float) {
        let m = Float(min(size.width, size.height))
        let px = (Float((CGFloat(x) + 0.5) * cell) - Float(size.width) / 2) / m
        let py = (Float(size.height) / 2 - Float((CGFloat(y) + 0.5) * cell)) / m
        return (px, py)
    }

    private func prepareInterference(_ size: CGSize) {
        guard !interferenceReady else { return }
        interferenceReady = true
        let n = columns * rows
        thresholdBase = [Float](repeating: 0, count: n)
        glow = [Float](repeating: 0, count: n)
        phaseCos = [Float](repeating: 0, count: n)
        phaseSin = [Float](repeating: 0, count: n)
        let k: Float = 60
        for y in 0..<rows {
            for x in 0..<columns {
                let (qx, qy) = p(x, y, size)
                let r1 = ((qx + 0.22) * (qx + 0.22) + (qy + 0.62) * (qy + 0.62)).squareRoot()
                let r2 = ((qx - 0.22) * (qx - 0.22) + (qy + 0.62) * (qy + 0.62)).squareRoot()
                let env = cos(0.5 * k * (r2 - r1))
                let fringe = env * env
                let att = exp(-0.75 * (qx * qx + (qy + 0.62) * (qy + 0.62)).squareRoot())
                let phase = 0.5 * k * (r1 + r2)
                let i = y * columns + x
                thresholdBase[i] = fringe * fringe * att
                glow[i] = fringe * att * 0.32
                phaseCos[i] = cos(phase)
                phaseSin[i] = sin(phase)
            }
        }
    }

    private func prepareChladni(_ size: CGSize, _ n1: Int, _ q1: Int, _ n2: Int, _ q2: Int) {
        guard modes != (n1, q1, n2, q2) || colN1.count != columns || rowN1.count != rows else { return }
        modes = (n1, q1, n2, q2)
        // u = p · 0.9 + 0.5: the whole plate fits the short side.
        let pi = Float.pi
        func table(_ count: Int, _ coord: (Int) -> Float, _ n: Int) -> [Float] {
            (0..<count).map { cos(Float(n) * pi * (coord($0) * 0.9 + 0.5)) }
        }
        let ux: (Int) -> Float = { self.p($0, 0, size).0 }
        let uy: (Int) -> Float = { self.p(0, $0, size).1 }
        colN1 = table(columns, ux, n1)
        colQ1 = table(columns, ux, q1)
        colN2 = table(columns, ux, n2)
        colQ2 = table(columns, ux, q2)
        rowN1 = table(rows, uy, n1)
        rowQ1 = table(rows, uy, q1)
        rowN2 = table(rows, uy, n2)
        rowQ2 = table(rows, uy, q2)
    }

    /// A stable 0…1 value per cell (integer hash), so the sand stays put.
    private static func hash(_ x: UInt32, _ y: UInt32) -> Float {
        var h = x &* 0x8DA6_B343 ^ y &* 0xD816_3841
        h ^= h >> 13
        h = h &* 0x85EB_CA6B
        h ^= h >> 16
        return Float(h & 0xFFFFFF) / Float(0x1000000)
    }
}

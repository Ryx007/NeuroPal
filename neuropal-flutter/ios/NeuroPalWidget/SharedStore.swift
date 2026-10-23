import Foundation
import SwiftUI

// What the Flutter app shares with its widgets through the App Group.
// The app writes one JSON snapshot (`np.widget`) whenever the look, the
// check-in state or the current document changes; the widgets only read it.
// A check-in tapped on a widget is written to `np.pendingState`, which the
// app picks up (and clears) the next time it comes to the foreground.
enum SharedStore {
    static let appGroup = "group.io.neuropal.flutter"
    static let snapshotKey = "np.widget"
    static let pendingStateKey = "np.pendingState"

    static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }

    struct Snapshot: Codable {
        var skin: String = "signal"
        var palette: [String: String] = NeuroPalTokens.signal
        var radius: Double = NeuroPalTokens.signalRadius
        var border: Double = NeuroPalTokens.signalBorder
        var shadow: Double = NeuroPalTokens.signalShadow
        var state: String? = nil
        var readingId: String? = nil
        var readingTitle: String? = nil
        var readingProgress: Double? = nil
        var palName: String? = nil

        static let fallback = Snapshot()

        init() {}

        // Every key is optional on the wire: an older or partial snapshot
        // from the app falls back field by field instead of failing whole.
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            let d = Snapshot()
            skin = try c.decodeIfPresent(String.self, forKey: .skin) ?? d.skin
            palette = try c.decodeIfPresent([String: String].self, forKey: .palette) ?? d.palette
            radius = try c.decodeIfPresent(Double.self, forKey: .radius) ?? d.radius
            border = try c.decodeIfPresent(Double.self, forKey: .border) ?? d.border
            shadow = try c.decodeIfPresent(Double.self, forKey: .shadow) ?? d.shadow
            state = try c.decodeIfPresent(String.self, forKey: .state)
            readingId = try c.decodeIfPresent(String.self, forKey: .readingId)
            readingTitle = try c.decodeIfPresent(String.self, forKey: .readingTitle)
            readingProgress = try c.decodeIfPresent(Double.self, forKey: .readingProgress)
            palName = try c.decodeIfPresent(String.self, forKey: .palName)
        }
    }

    static func load() -> Snapshot {
        guard let raw = defaults.string(forKey: snapshotKey),
              let data = raw.data(using: .utf8),
              let snap = try? JSONDecoder().decode(Snapshot.self, from: data)
        else { return .fallback }
        return snap
    }

    static func save(_ snap: Snapshot) {
        guard let data = try? JSONEncoder().encode(snap),
              let raw = String(data: data, encoding: .utf8) else { return }
        defaults.set(raw, forKey: snapshotKey)
    }

    // A check-in from the widget: show it at once, and queue it for the app.
    static func setState(_ state: String) {
        var snap = load()
        snap.state = state
        save(snap)
        defaults.set(state, forKey: pendingStateKey)
    }
}

// Colours and shape for a snapshot, with the generated token fallbacks for
// any key the app has not written.
struct WidgetTheme {
    let snap: SharedStore.Snapshot

    init(_ snap: SharedStore.Snapshot) { self.snap = snap }

    private func color(_ key: String) -> Color {
        let base = snap.skin == "classic" ? NeuroPalTokens.classic : NeuroPalTokens.signal
        return Color(hex: snap.palette[key] ?? base[key] ?? "#808080")
    }

    var isSignal: Bool { snap.skin != "classic" }
    var surface: Color { color("surface") }
    var surfaceContainer: Color { color("surfaceContainer") }
    var onSurface: Color { color("onSurface") }
    var onSurfaceVariant: Color { color("onSurfaceVariant") }
    var outline: Color { color("outline") }
    var accentFill: Color { color("accentFill") }
    var accentInk: Color { color("accentInk") }
    var accentText: Color { color("accentText") }
    var line: Color { color("line") }
    var shadow: Color { color("shadowColor") }
    var radius: CGFloat { CGFloat(isSignal ? snap.radius : NeuroPalTokens.classicRadius) }
    var controlRadius: CGFloat { isSignal ? max(3, radius * 0.5) : 12 }
    var border: CGFloat { CGFloat(isSignal ? max(1, snap.border) : 1) }
}

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        let v = UInt64(s, radix: 16) ?? 0
        let r, g, b: Double
        if s.count == 6 {
            r = Double((v >> 16) & 0xFF) / 255
            g = Double((v >> 8) & 0xFF) / 255
            b = Double(v & 0xFF) / 255
        } else {
            r = 0.5; g = 0.5; b = 0.5
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}

import SwiftUI

public extension Color {
    /// "#RRGGBB", "#RGB", "#RRGGBBAA" or "rgba(r,g,b,a)" — the formats the
    /// token palette uses. Anything else draws magenta so it's noticed.
    init(token: String) {
        if let (r, g, b, a) = Color.parse(token) {
            self = Color(.sRGB, red: r, green: g, blue: b, opacity: a)
        } else {
            self = Color(.sRGB, red: 1, green: 0, blue: 1, opacity: 1)
        }
    }

    static func parse(_ s: String) -> (Double, Double, Double, Double)? {
        let t = s.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("#") {
            var hex = String(t.dropFirst())
            if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
            guard hex.count == 6 || hex.count == 8, let v = UInt64(hex, radix: 16) else { return nil }
            if hex.count == 6 {
                return (Double((v >> 16) & 0xFF) / 255, Double((v >> 8) & 0xFF) / 255, Double(v & 0xFF) / 255, 1)
            }
            return (Double((v >> 24) & 0xFF) / 255, Double((v >> 16) & 0xFF) / 255, Double((v >> 8) & 0xFF) / 255,
                    Double(v & 0xFF) / 255)
        }
        if t.lowercased().hasPrefix("rgb") {
            guard let open = t.firstIndex(of: "("), let close = t.lastIndex(of: ")") else { return nil }
            let parts = t[t.index(after: open)..<close].split(separator: ",").map {
                Double($0.trimmingCharacters(in: .whitespaces)) ?? .nan
            }
            guard parts.count >= 3, !parts.contains(where: { $0.isNaN }) else { return nil }
            return (parts[0] / 255, parts[1] / 255, parts[2] / 255, parts.count > 3 ? parts[3] : 1)
        }
        return nil
    }
}

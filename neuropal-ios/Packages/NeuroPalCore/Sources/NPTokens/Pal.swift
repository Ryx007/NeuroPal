import Foundation

// Pal, the companion — port of packages/tokens/src/pal.js.

public extension Tokens {
    /// normalizePal(input): unknown options fall back to PAL_DEFAULT; the
    /// name is trimmed and cut to 14 characters (UTF-16, like the JS).
    static func normalizePal(_ json: JSONValue?) -> Appearance.Pal {
        let src = JS.object(json)
        let t = tables
        var out = t.palDefault
        if let raw = src["name"]?.stringValue {
            let name = JS.prefixUTF16(JS.trim(raw), 14)
            if !name.isEmpty { out.name = name }
        }
        if let v = src["shape"]?.stringValue, t.palShapes.contains(where: { $0.name == v }) { out.shape = v }
        if let v = src["colour"]?.stringValue, t.palColours.contains(where: { $0.name == v }) { out.colour = v }
        if let v = src["eyes"]?.stringValue, t.palEyes.contains(v) { out.eyes = v }
        if let v = src["mouth"]?.stringValue, t.palMouths.contains(v) { out.mouth = v }
        if let v = src["extra"]?.stringValue, t.palExtras.contains(v) { out.extra = v }
        if let v = src["talk"]?.stringValue, t.palTalk.contains(where: { $0.name == v }) { out.talk = v }
        if let v = src["voice"]?.stringValue, t.palVoices.contains(where: { $0.name == v }) { out.voice = v }
        if let v = src["people"]?.boolValue { out.people = v }
        return out
    }

    /// normalizePal for a typed value.
    static func normalizePal(_ pal: Appearance.Pal) -> Appearance.Pal {
        let t = tables
        var out = t.palDefault
        let name = JS.prefixUTF16(JS.trim(pal.name), 14)
        if !name.isEmpty { out.name = name }
        if t.palShapes.contains(where: { $0.name == pal.shape }) { out.shape = pal.shape }
        if t.palColours.contains(where: { $0.name == pal.colour }) { out.colour = pal.colour }
        if t.palEyes.contains(pal.eyes) { out.eyes = pal.eyes }
        if t.palMouths.contains(pal.mouth) { out.mouth = pal.mouth }
        if t.palExtras.contains(pal.extra) { out.extra = pal.extra }
        if t.palTalk.contains(where: { $0.name == pal.talk }) { out.talk = pal.talk }
        if t.palVoices.contains(where: { $0.name == pal.voice }) { out.voice = pal.voice }
        out.people = pal.people
        return out
    }

    /// palLine(pal, task): the talk style's sample line. `task` is a whole
    /// phrase ("the CPI notes", "“Stay hydrated”").
    static func palLine(_ pal: Appearance.Pal, task: String = "the CPI notes") -> String {
        let p = normalizePal(pal)
        let template = tables.palTalk.first { $0.name == p.talk }?.value ?? ""
        return JS.replaceFirst(template, "{task}", with: task)
    }

    /// palSay(pal, key, vars): one of Pal's assistant lines (PAL_LINES) in
    /// the user's talk style; a key the style lacks falls back to Gentle,
    /// unknown keys give ""; {placeholders} without a value stay as written.
    static func palSay(_ pal: Appearance.Pal, _ key: String, _ vars: [String: String] = [:]) -> String {
        let p = normalizePal(pal)
        let lines = tables.palLines
        let style = lines[p.talk] ?? lines["Gentle"] ?? [:]
        let line = style[key] ?? lines["Gentle"]?[key] ?? ""
        // line.replace(/\{(\w+)\}/g, …) — \w is ASCII [A-Za-z0-9_].
        let u = Array(line.utf16)
        var out: [UInt16] = []
        var i = 0
        func isWord(_ c: UInt16) -> Bool {
            (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || c == 0x5F
        }
        while i < u.count {
            if u[i] == 0x7B {
                var j = i + 1
                while j < u.count, isWord(u[j]) { j += 1 }
                if j > i + 1, j < u.count, u[j] == 0x7D {
                    let name = String(decoding: u[(i + 1)..<j], as: UTF16.self)
                    if let value = vars[name] {
                        out.append(contentsOf: value.utf16)
                    } else {
                        out.append(contentsOf: u[i...j])
                    }
                    i = j + 1
                    continue
                }
            }
            out.append(u[i])
            i += 1
        }
        return String(decoding: out, as: UTF16.self)
    }

    /// palFaceInk(body): eye/mouth ink that reads on Pal's body colour.
    static func palFaceInk(_ bodyHex: String) -> String {
        let body = hexToRgb(bodyHex) ?? RGB(228, 228, 232)
        return contrastRatio(.ink, body) >= contrastRatio(.white, body) ? "#141416" : "#FFFFFF"
    }

    /// palVisor(body, accent): the accent, unless the body IS (nearly) the
    /// accent and the visor would vanish — then the face ink.
    static func palVisor(_ bodyHex: String, _ accentHex: String) -> String {
        let body = hexToRgb(bodyHex) ?? RGB(228, 228, 232)
        let acc = hexToRgb(accentHex) ?? RGB(255, 61, 46)
        return contrastRatio(acc, body) < 1.6 ? palFaceInk(bodyHex) : accentHex
    }

    /// palDescription(pal): "Pal: pebble shape, chalk body, visor eyes, smile mouth, headphones".
    static func palDescription(_ pal: Appearance.Pal) -> String {
        let p = normalizePal(pal)
        let extra = p.extra == "None" ? "no extras" : p.extra.lowercased()
        let mouth = p.mouth == "None" ? "no mouth" : "\(p.mouth.lowercased()) mouth"
        return "\(p.name): \(p.shape.lowercased()) shape, \(p.colour.lowercased()) body, \(p.eyes.lowercased()) eyes, \(mouth), \(extra)"
    }

    /// The body hex of a Pal colour name (PAL_OPTIONS.colour), default Chalk.
    static func palBodyHex(_ colour: String) -> String {
        tables.palColourHex(colour) ?? tables.palColourHex("Chalk") ?? "#E4E4E8"
    }

    /// [rate, pitch] of a Pal voice (PAL_OPTIONS.voice), default Soft.
    static func palVoice(_ name: String) -> TokenTables.PalVoice {
        tables.palVoices.first { $0.name == name } ?? tables.palVoices.first ?? TokenTables.PalVoice(name: "Soft", rate: 0.95, pitch: 1.1)
    }
}

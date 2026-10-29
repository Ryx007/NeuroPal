import Foundation

// "Ask Pal" — port of packages/tokens/src/interpret.js. Plain words → a
// PROPOSED change, shown as a preview + change list and applied only when
// the user says so (preview → apply → undo). This keyword interpreter is the
// offline floor; every client gives the same answer for the same words.

public extension Tokens {
    /// A proposed look change: the whole next appearance and what changes.
    struct AppearanceProposal: Hashable, Sendable {
        public var next: Appearance
        public var rows: [ChangeRow]

        public init(next: Appearance, rows: [ChangeRow]) {
            self.next = next
            self.rows = rows
        }
    }

    /// A proposed Home layout change.
    struct HomeProposal: Hashable, Sendable {
        public var next: Appearance.Home
        public var title: String
        public var message: String
        public var rows: [ChangeRow]

        public init(next: Appearance.Home, title: String, message: String, rows: [ChangeRow]) {
            self.next = next
            self.title = title
            self.message = message
            self.rows = rows
        }
    }

    /// Pal's answer when nothing can (or needs to) change.
    struct Refusal: Error, Hashable, Sendable {
        public var message: String
        public init(_ message: String) { self.message = message }
    }

    /// interpretAppearance(text, appearance): "calm it down", "no grain",
    /// "try orange", "#00FF88"… → the proposed appearance, or why not.
    static func interpretAppearance(_ text: String, _ appearance: Appearance) -> Result<AppearanceProposal, Refusal> {
        let raw = Interpreter.clean(text)
        let cur = normalizeAppearance(appearance)
        var n = cur
        // `hit(x)` = x, remembering that SOME rule matched (JS: `matched`).
        let tally = Interpreter.Tally()
        func hit(_ cond: Bool) -> Bool { tally.hit(cond) }

        typealias W = Interpreter
        // Phrases whose meaning includes a negator are read whole, first.
        let still = raw.test(W.still)
        let calmer = raw.test(W.calmer)
        let noField = raw.test(W.noField)
        let noTexture = raw.test(W.noTexture)
        let darker = raw.test(W.darker)
        let stripped = raw.replacingAll(W.stripped, with: [0x20])
        let (neg, positive) = W.splitNegations(stripped)
        func has(_ words: [[UInt16]]) -> Bool { positive.test(words) }
        func negated(_ words: String...) -> Bool { words.contains { neg.contains($0) } }

        if hit(has(W.words("classic", "original", "old look", "minimal look"))) { n.skin = .classic }
        if hit(has(W.words("signal", "funky", "funkier", "brutal", "brutalist"))) { n.skin = .signal }

        if n.skin == .classic {
            var c = n.classic
            if hit(has(W.words("sepia", "paper", "book", "warm", "warmer", "evening", "cozy", "cosy"))) { c.theme = "sepia" }
            if hit(has(W.light)) { c.theme = "light" }
            if hit(darker || has(W.words("dark", "night")) || negated("bright", "light")) { c.theme = "dark" }
            if hit(has(W.contrast)) { c.theme = "contrast" }
            if hit(negated("contrast")) && c.theme == "contrast" { c.theme = "dark" }
            if hit(has(W.words("ruby", "red", "pink", "rose"))) { c.accent = "ruby" }
            if hit(has(W.words("cyan", "blue", "teal", "aqua"))) { c.accent = "cyan" }
            if hit(has(W.words("purple", "violet", "lilac"))) { c.accent = "purple" }
            if hit(has(W.words("green", "mint", "sage"))) { c.accent = "green" }
            n.classic = c
        } else {
            var g = n.signal
            let motion = W.motion
            var mi = max(0, motion.firstIndex(of: g.motion) ?? -1)
            if hit(still || negated("motion", "animation", "animated", "moving", "movement")) {
                mi = 0
            } else if hit(calmer) {
                mi = max(0, mi - 1)
            } else if hit(has(W.words("wilder", "more motion", "more animated", "more animation", "livelier", "more energy",
                                      "energetic", "faster", "alive"))) {
                mi = min(3, mi + 1)
            } else if hit(has(W.words("calm", "gentle", "quiet"))) {
                mi = 1
            } else if hit(has(W.words("lively"))) {
                mi = 2
            } else if hit(has(W.words("wild"))) {
                mi = 3
            } else if hit(negated("wild")) && mi == 3 {
                mi = 2
            }
            g.motion = motion[mi]
            if hit(has(W.words("evening", "night", "bedtime", "late"))) {
                g.base = "Black"
                if (motion.firstIndex(of: g.motion) ?? -1) > 1 { g.motion = "Calm" }
                g.texture = "None"
            }
            if hit(has(W.contrast)) {
                if g.base != "Concrete" { g.base = "Black" }
                g.texture = "None"
                g.brutality = 3
            }
            if hit(negated("contrast")) {
                if g.base == "Black" || g.base == "Concrete" { g.base = "Graphite" }
                g.brutality = max(0, g.brutality - 1)
            }
            if hit(has(W.light)) { g.base = "Concrete" }
            if hit(darker || negated("bright", "light")) { g.base = g.base == "Concrete" ? "Graphite" : "Black" }
            if hit(has(W.words("dark"))) && g.base == "Concrete" { g.base = "Graphite" }
            if hit(has(W.words("warm", "warmer", "cozy", "cosy"))) { g.base = "Warm" }
            if hit(negated("warm", "warmer")) && g.base == "Warm" { g.base = "Graphite" }
            if hit(has(W.words("grey", "gray", "graphite"))) { g.base = "Graphite" }
            for (words, hex) in W.colours where hit(has(words)) { g.acc = hex }
            let hexMatch = W.firstHex(positive)
            if hit(hexMatch != nil), let hexMatch { g.acc = "#" + hexMatch.uppercased() }
            if hit(has(W.words("sharp", "sharper", "square", "boxy"))) { g.corners = "Sharp" }
            if hit(has(W.words("round", "rounder", "rounded", "bubbly"))) { g.corners = "Round" }
            if hit(negated("round", "rounder", "rounded", "sharp", "sharper")) { g.corners = "Soft" }
            if hit(has(W.words("grain", "grainy", "film"))) { g.texture = "Grain" }
            if hit(has(W.words("scanline", "scanlines", "crt", "retro"))) { g.texture = "Scanlines" }
            if hit(noTexture || negated("texture")) { g.texture = "None" }
            if hit(negated("grain", "grainy", "film")) && g.texture == "Grain" { g.texture = "None" }
            if hit(negated("scanline", "scanlines", "crt")) && g.texture == "Scanlines" { g.texture = "None" }
            if hit(has(W.words("bolder", "heavier", "chunkier", "more brutal", "harder"))) { g.brutality = min(3, g.brutality + 1) }
            if hit(has(W.words("flatter", "flat", "subtle", "subtler", "softer")) || negated("brutal", "bold", "heavy")) {
                g.brutality = max(0, g.brutality - 1)
            }
            if hit(has(W.words("chladni", "plate", "sand", "cymatics"))) { g.field = "Chladni" }
            if hit(has(W.words("interference", "wave", "waves", "fringes", "double slit", "ripples"))) { g.field = "Interference" }
            if hit(has(W.words("grid", "graph paper"))) { g.field = "Grid" }
            if hit(noField || negated("background", "field", "pattern")) { g.field = "None" }
            if hit(negated("grid")) && g.field == "Grid" { g.field = "None" }
            if hit(negated("chladni", "sand", "plate")) && g.field == "Chladni" { g.field = "None" }
            if hit(negated("interference", "wave", "waves", "fringes", "ripples")) && g.field == "Interference" { g.field = "None" }
            if hit(has(W.words("condensed", "narrow", "narrower"))) { g.type = "Condensed" }
            if hit(has(W.words("wide", "wider", "extended"))) { g.type = "Wide" }
            if hit(has(W.words("grotesk"))) { g.type = "Grotesk" }
            n.signal = g
        }

        let next = normalizeAppearance(n)
        let rows = diffAppearance(cur, next)
        if rows.isEmpty {
            return .failure(Refusal(tally.matched
                ? "That’s already how it looks."
                : "I can’t map that yet. I can change colour, motion, background, texture, corners, contrast or skin."))
        }
        return .success(AppearanceProposal(next: next, rows: rows))
    }

    /// interpretHome(text, home): "reading first on weekdays" → a day rule;
    /// "hide Pal's note", "bigger focus" → a base-layout change; or why not.
    static func interpretHome(_ text: String, _ home: Appearance.Home) -> Result<HomeProposal, Refusal> {
        var su: [UInt16] = [0x20]
        su.append(contentsOf: text.lowercased().utf16.filter { $0 != 0x2019 && $0 != 0x27 })
        su.append(0x20)
        let s = JSText(units: su)
        let h = normalizeHome(home)
        guard let id = Interpreter.findTile(s), let info = tables.homeTile(id),
              let idx = h.tiles.firstIndex(where: { $0.id == id })
        else {
            return .failure(Refusal("I couldn’t tell which tile you mean. Try reading, focus, anchor, check-in, tasks or Pal."))
        }
        let name = info.name
        let scope: String? = s.contains(Array("weekday".utf16)) ? "Weekdays" : s.contains(Array("weekend".utf16)) ? "Weekends" : nil
        let act: String
        if s.test(JSText.alts(["hide", "remove", "dont show", "do not show", "without"])) {
            act = "hide"
        } else if s.test(JSText.alts(["first", "top", "start", "lead"])) {
            act = "first"
        } else if s.test(JSText.alts(["last", "bottom", "end"])) {
            act = "last"
        } else if s.test(JSText.alts(["show", "add", "bring back", "bring it back", "include", "unhide"])) {
            act = "show"
        } else if s.test(JSText.alts(["bigger", "larger", "more space", "expand", "big"])) {
            act = "bigger"
        } else if s.test(JSText.alts(["smaller", "compact", "less space", "shrink", "small"])) {
            act = "smaller"
        } else {
            return .failure(Refusal("I found \(name), but not what to do with it. Try first, last, hide, show, bigger or smaller."))
        }

        let tile = h.tiles[idx]
        var tiles = h.tiles
        let i = idx
        let ruleIndex = scope.flatMap { sc in h.rules.firstIndex { $0.scope == sc && $0.tile == id } }
        let rule = ruleIndex.map { h.rules[$0] }
        let already = Refusal("\(name) is already like that.")
        func labelOf(_ a: String) -> String { a == "hide" ? "hidden" : a }

        // ---- day rules ----
        if let scope, act == "show" {
            if let rule, rule.act == "hide", let ruleIndex {
                var rules = h.rules
                rules.remove(at: ruleIndex)
                return .success(HomeProposal(
                    next: Appearance.Home(tiles: h.tiles, rules: rules),
                    title: "Show \(name) on \(scope.lowercased()) again?",
                    message: "Removes the day rule that hid it.",
                    rows: [ChangeRow(k: scope, from: "hidden", to: "shown")]))
            }
            if tile.hidden {
                return .failure(Refusal("\(name) is hidden every day. Say “show \(name.lowercased())” to bring it back."))
            }
            return .failure(already)
        }
        if let scope, ["first", "last", "hide"].contains(act) {
            if act == "hide" && tile.hidden { return .failure(Refusal("\(name) is already hidden every day.")) }
            if let rule, rule.act == act { return .failure(already) }
            var rules = h.rules
            if let ruleIndex { rules.remove(at: ruleIndex) }
            rules.append(Appearance.HomeRule(scope: scope, tile: id, act: act))
            var rows: [ChangeRow] = []
            // A position rule for a tile hidden everywhere would do nothing:
            // bring it back too, and say so.
            if act != "hide" && tile.hidden {
                tiles[i].hidden = false
                rows.append(ChangeRow(k: "Visible", from: "no", to: "yes"))
            }
            rows.append(ChangeRow(k: scope, from: rule.map { labelOf($0.act) } ?? ordinal(idx + 1), to: labelOf(act)))
            return .success(HomeProposal(
                next: Appearance.Home(tiles: tiles, rules: rules),
                title: "\(name) \(labelOf(act)) on \(scope.lowercased())?",
                message: "A day rule. Your base layout stays as it is for the other days.",
                rows: rows))
        }

        // ---- base layout ----
        let sizes = ["S", "M", "L"]
        var rows: [ChangeRow] = []
        var rules = h.rules
        if act == "first" || act == "last" {
            var t = tiles.remove(at: i)
            let wasHidden = t.hidden
            if wasHidden { t.hidden = false }
            if act == "first" { tiles.insert(t, at: 0) } else { tiles.append(t) }
            let to = act == "first" ? 1 : tiles.count
            if to != i + 1 { rows.append(ChangeRow(k: "Position", from: ordinal(i + 1), to: ordinal(to))) }
            if wasHidden { rows.append(ChangeRow(k: "Visible", from: "no", to: "yes")) }
        } else if act == "hide" {
            if !tile.hidden {
                tiles[i].hidden = true
                rows.append(ChangeRow(k: "Visible", from: "yes", to: "no"))
            }
        } else if act == "show" {
            if tile.hidden {
                tiles[i].hidden = false
                rows.append(ChangeRow(k: "Visible", from: "no", to: "yes"))
            }
            // "Bring back focus" also lifts any day rule that hides it.
            let hides = h.rules.filter { $0.tile == id && $0.act == "hide" }
            if !hides.isEmpty {
                rules = h.rules.filter { !($0.tile == id && $0.act == "hide") }
                for r in hides { rows.append(ChangeRow(k: r.scope, from: "hidden", to: "shown")) }
            }
        } else {
            let k = sizes.firstIndex(of: tiles[i].size) ?? -1
            tiles[i].size = sizes[max(0, min(2, k + (act == "bigger" ? 1 : -1)))]
            if tiles[i].size != tile.size { rows.append(ChangeRow(k: "Size", from: tile.size, to: tiles[i].size)) }
        }
        if rows.isEmpty { return .failure(already) }
        return .success(HomeProposal(
            next: Appearance.Home(tiles: tiles, rules: rules),
            title: "Change \(name)?",
            message: "Every day. The preview shows the result first.",
            rows: rows))
    }
}

/// The word lists and helpers of interpret.js.
enum Interpreter {
    static let motion = ["Still", "Calm", "Lively", "Wild"]

    /// Whether any rule fired, even one that changed nothing. A reference
    /// type, so the local `hit` helper doesn't mutate a captured variable.
    final class Tally {
        private(set) var matched = false

        func hit(_ cond: Bool) -> Bool {
            if cond { matched = true }
            return cond
        }
    }

    static func words(_ list: String...) -> [[UInt16]] { JSText.alts(list) }

    static let still = JSText.alts(["no motion", "no animation", "no movement", "stop moving", "freeze", "still", "static"])
    static let calmer = JSText.alts(["calm it down", "calm down", "calmer", "gentler", "quieter", "slower", "less motion",
                                     "less animation", "less movement", "less busy", "tone it down"])
    static let noField = JSText.alts(["no background", "no field", "no pattern", "plain background", "plain", "less busy",
                                      "simpler", "simple"])
    static let noTexture = JSText.alts(["no texture", "clean", "smooth"])
    static let darker = JSText.alts(["less bright", "not so bright", "not as bright", "dimmer", "darker"])
    static let stripped = JSText.alts(["no motion", "no animation", "no movement", "stop moving", "calm it down", "calm down",
                                       "less motion", "less animation", "less movement", "less busy", "tone it down",
                                       "no background", "no field", "no pattern", "plain background", "no texture",
                                       "less bright", "not so bright", "not as bright"])
    static let light = JSText.alts(["light", "bright", "brighter", "daylight", "day"])
    static let contrast = JSText.alts(["contrast", "readable", "legible", "low vision"])
    static let colours: [([[UInt16]], String)] = [
        (JSText.alts(["red", "crimson", "scarlet"]), "#FF3D2E"),
        (JSText.alts(["orange", "ember"]), "#FF6A1A"),
        (JSText.alts(["amber", "yellow", "gold"]), "#FFB21A"),
        (JSText.alts(["green", "lime", "mint"]), "#3DDC84"),
        (JSText.alts(["cyan", "blue", "teal", "aqua"]), "#2EC7F0"),
        (JSText.alts(["purple", "violet", "ultraviolet", "uv"]), "#8B5CFF"),
        (JSText.alts(["pink", "magenta"]), "#FF4FA3"),
    ]
    static let negationLeads = JSText.alts(["no", "not", "without", "less", "fewer", "never", "dont want", "do not want"])
    static let negationFillers = JSText.alts(["so", "too", "that", "very", "the", "any", "more"])

    /// ` ${text.toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9#\s-]/g," ").replace(/\s+/g," ")} `
    static func clean(_ text: String) -> JSText {
        var out: [UInt16] = [0x20]
        var inGap = false
        for c in text.lowercased().utf16 where c != 0x2019 && c != 0x27 {
            if JSText.isTokenChar(c) {
                out.append(c)
                inGap = false
            } else if !inGap {
                out.append(0x20)
                inGap = true
            }
        }
        out.append(0x20)
        return JSText(units: out)
    }

    /// Words the user explicitly does NOT want ("no grid", "without grain",
    /// "not so wild", "less red") and the text with those phrases removed:
    /// `s.replace(/\b(?:no|not|…)\s+(?:so\s+|too\s+|…)?([a-z0-9#-]+)/g, " ")`.
    static func splitNegations(_ s: JSText) -> (Set<String>, JSText) {
        var neg = Set<String>()
        var out: [UInt16] = []
        var i = 0
        while i < s.count {
            if let (end, word) = negation(s, at: i) {
                neg.insert(word)
                out.append(0x20)
                i = end
            } else {
                out.append(s.units[i])
                i += 1
            }
        }
        return (neg, JSText(units: out))
    }

    private static func negation(_ s: JSText, at i: Int) -> (Int, String)? {
        guard s.boundary(i) else { return nil }
        func spaces(from j: Int) -> Int? {
            guard j < s.count, JS.isSpace(s.units[j]) else { return nil }
            var k = j
            while k < s.count, JS.isSpace(s.units[k]) { k += 1 }
            return k
        }
        func run(from j: Int) -> (Int, String)? {
            guard j < s.count, JSText.isTokenChar(s.units[j]) else { return nil }
            var k = j
            while k < s.count, JSText.isTokenChar(s.units[k]) { k += 1 }
            return (k, String(decoding: s.units[j..<k], as: UTF16.self))
        }
        for lead in negationLeads where s.has(lead, at: i) {
            guard let j = spaces(from: i + lead.count) else { continue }
            for filler in negationFillers where s.has(filler, at: j) {
                if let k = spaces(from: j + filler.count), let r = run(from: k) { return r }
            }
            if let r = run(from: j) { return r }
        }
        return nil
    }

    /// `text.match(/#([0-9a-f]{6})\b/)?.[1]`
    static func firstHex(_ s: JSText) -> String? {
        let u = s.units
        func isHex(_ c: UInt16) -> Bool { (c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x66) }
        var i = 0
        while i + 7 <= u.count {
            if u[i] == 0x23, (1...6).allSatisfy({ isHex(u[i + $0]) }), s.boundary(i + 7) {
                return String(decoding: u[(i + 1)..<(i + 7)], as: UTF16.self)
            }
            i += 1
        }
        return nil
    }

    /// The tile the text names: whole words only ("read" is not in "ready",
    /// "pal" is not in "palette"); the earliest mention wins.
    static func findTile(_ s: JSText) -> String? {
        var best: String?
        var at = Int.max
        for info in Tokens.tables.homeTiles {
            for w in info.words {
                if let k = firstWholeWord(s, Array(w.utf16)), k < at {
                    at = k
                    best = info.id
                }
            }
        }
        return best
    }

    /// `/(^|[^a-z0-9])word(?=$|[^a-z0-9])/` → where the word starts.
    private static func firstWholeWord(_ s: JSText, _ w: [UInt16]) -> Int? {
        guard !w.isEmpty, w.count <= s.count else { return nil }
        for q in 0...(s.count - w.count) where s.has(w, at: q) {
            let before = q == 0 || !JSText.isLowerAlnum(s.units[q - 1])
            let after = q + w.count == s.count || !JSText.isLowerAlnum(s.units[q + w.count])
            if before && after { return q }
        }
        return nil
    }
}

import Foundation

/// Inline LaTeX made readable: a Unicode rendering for the page and a spoken
/// form for the voice. Deliberately small — Greek, scripts, fractions, roots,
/// accents, brackets and the common relations that fill physics papers —
/// and it falls back to the plain source for anything it doesn't know.
/// Never throws, never loops: every step consumes input.
enum MathText {
    /// One word of a paragraph, possibly holding $…$ islands ("($\rho_1$),").
    struct Token {
        var display: String
        var speech: String
        var isMath: Bool
    }

    static func token(_ raw: String) -> Token {
        guard raw.contains("$") else { return Token(display: raw, speech: raw, isMath: false) }
        let chars = Array(raw)
        var display = ""
        var speech = ""
        var isMath = false
        var i = 0
        while i < chars.count {
            let ch = chars[i]
            if ch == "\\", i + 1 < chars.count, chars[i + 1] == "$" {
                display.append("$")
                speech.append("$")
                i += 2
                continue
            }
            if ch == "$", let found = island(chars, from: i) {
                let (inner, next) = found
                let shown = MathText.display(inner)
                display += shown.isEmpty ? String(chars[i..<next]) : shown
                speech += " " + MathText.speech(inner) + " "
                isMath = true
                i = next
                continue
            }
            display.append(ch)
            speech.append(ch)
            i += 1
        }
        return Token(display: display, speech: tidySpeech(speech), isMath: isMath)
    }

    /// The `$…$` (or `$$…$$`) island opening at `start`: its inner source
    /// and the index just past it. nil when it never closes (a price, "$5").
    static func island(_ c: [Character], from start: Int) -> (String, Int)? {
        guard start < c.count, c[start] == "$" else { return nil }
        let double = start + 1 < c.count && c[start + 1] == "$"
        let open = double ? 2 : 1
        var j = start + open
        let limit = min(c.count, start + 800)
        while j < limit {
            if c[j] == "\\" {
                j += 2
                continue
            }
            if c[j] == "$" {
                if double {
                    if j + 1 < c.count, c[j + 1] == "$" { return (String(c[(start + 2)..<j]), j + 2) }
                    return nil
                }
                return j > start + 1 ? (String(c[(start + 1)..<j]), j + 1) : nil
            }
            j += 1
        }
        return nil
    }

    /// Unicode rendering of LaTeX source (no surrounding $).
    static func display(_ latex: String) -> String {
        var r = MathRenderer(latex, speech: false)
        return r.run()
    }

    /// Spoken form of LaTeX source (no surrounding $).
    static func speech(_ latex: String) -> String {
        var r = MathRenderer(latex, speech: true)
        return r.run()
    }

    // MARK: Helpers

    static func tidySpeech(_ s: String) -> String {
        var out = ""
        var space = false
        for ch in s {
            if ch == " " || ch == "\n" || ch == "\t" || ch == "\u{2009}" {
                space = !out.isEmpty
                continue
            }
            if space, !",.;:)".contains(ch) { out.append(" ") }
            space = false
            out.append(ch)
        }
        return out
    }

    static func tidyDisplay(_ s: String) -> String {
        var out = ""
        var space = false
        for ch in s {
            if ch == " " || ch == "\u{2009}" {
                space = !out.isEmpty
                continue
            }
            if space, !",;:)]⟩".contains(ch), let last = out.last, !"([⟨|".contains(last) { out.append(" ") }
            space = false
            out.append(ch)
        }
        return out
    }

    static func wrap(_ s: String) -> String {
        let t = s.trimmingCharacters(in: .whitespaces)
        if t.count <= 1 || t.allSatisfy({ $0.isNumber || $0 == "." }) { return t }
        if t.hasPrefix("("), t.hasSuffix(")") { return t }
        return "(\(t))"
    }

    static func superscripted(_ s: String) -> String? {
        var out = ""
        for ch in s where ch != " " {
            guard let m = superscripts[ch] else { return nil }
            out.append(m)
        }
        return out.isEmpty ? nil : out
    }

    static func subscripted(_ s: String) -> String? {
        var out = ""
        for ch in s where ch != " " {
            guard let m = subscripts[ch] else { return nil }
            out.append(m)
        }
        return out.isEmpty ? nil : out
    }

    static let superscripts: [Character: Character] = [
        "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
        "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
        "a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "d": "ᵈ", "e": "ᵉ", "f": "ᶠ", "g": "ᵍ", "h": "ʰ", "i": "ⁱ", "j": "ʲ",
        "k": "ᵏ", "l": "ˡ", "m": "ᵐ", "n": "ⁿ", "o": "ᵒ", "p": "ᵖ", "r": "ʳ", "s": "ˢ", "t": "ᵗ", "u": "ᵘ",
        "v": "ᵛ", "w": "ʷ", "x": "ˣ", "y": "ʸ", "z": "ᶻ",
        "A": "ᴬ", "B": "ᴮ", "D": "ᴰ", "E": "ᴱ", "G": "ᴳ", "H": "ᴴ", "I": "ᴵ", "J": "ᴶ", "K": "ᴷ", "L": "ᴸ",
        "M": "ᴹ", "N": "ᴺ", "O": "ᴼ", "P": "ᴾ", "R": "ᴿ", "T": "ᵀ", "U": "ᵁ", "V": "ⱽ", "W": "ᵂ",
        "α": "ᵅ", "β": "ᵝ", "γ": "ᵞ", "δ": "ᵟ", "θ": "ᶿ", "φ": "ᵠ", "χ": "ᵡ",
    ]

    static let subscripts: [Character: Character] = [
        "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
        "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎",
        "a": "ₐ", "e": "ₑ", "h": "ₕ", "i": "ᵢ", "j": "ⱼ", "k": "ₖ", "l": "ₗ", "m": "ₘ", "n": "ₙ", "o": "ₒ",
        "p": "ₚ", "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ", "v": "ᵥ", "x": "ₓ",
        "β": "ᵦ", "γ": "ᵧ", "ρ": "ᵨ", "φ": "ᵩ", "χ": "ᵪ",
    ]

    /// name → (display, speech)
    static let symbols: [String: (String, String)] = [
        // Greek
        "alpha": ("α", "alpha"), "beta": ("β", "beta"), "gamma": ("γ", "gamma"), "delta": ("δ", "delta"),
        "epsilon": ("ϵ", "epsilon"), "varepsilon": ("ε", "epsilon"), "zeta": ("ζ", "zeta"), "eta": ("η", "eta"),
        "theta": ("θ", "theta"), "vartheta": ("ϑ", "theta"), "iota": ("ι", "iota"), "kappa": ("κ", "kappa"),
        "lambda": ("λ", "lambda"), "mu": ("μ", "mu"), "nu": ("ν", "nu"), "xi": ("ξ", "xi"),
        "omicron": ("ο", "omicron"), "pi": ("π", "pi"), "varpi": ("ϖ", "pi"), "rho": ("ρ", "rho"),
        "varrho": ("ϱ", "rho"), "sigma": ("σ", "sigma"), "varsigma": ("ς", "sigma"), "tau": ("τ", "tau"),
        "upsilon": ("υ", "upsilon"), "phi": ("ϕ", "phi"), "varphi": ("φ", "phi"), "chi": ("χ", "chi"),
        "psi": ("ψ", "psi"), "omega": ("ω", "omega"),
        "Gamma": ("Γ", "Gamma"), "Delta": ("Δ", "Delta"), "Theta": ("Θ", "Theta"), "Lambda": ("Λ", "Lambda"),
        "Xi": ("Ξ", "Xi"), "Pi": ("Π", "Pi"), "Sigma": ("Σ", "Sigma"), "Upsilon": ("Υ", "Upsilon"),
        "Phi": ("Φ", "Phi"), "Psi": ("Ψ", "Psi"), "Omega": ("Ω", "Omega"),
        // Letters and constants
        "hbar": ("ℏ", "h bar"), "hslash": ("ℏ", "h bar"), "ell": ("ℓ", "ell"), "aleph": ("ℵ", "aleph"),
        "infty": ("∞", "infinity"), "partial": ("∂", "partial"), "nabla": ("∇", "del"), "Re": ("ℜ", "the real part of"),
        "Im": ("ℑ", "the imaginary part of"), "emptyset": ("∅", "the empty set"), "varnothing": ("∅", "the empty set"),
        // Big operators
        "sum": ("∑", "the sum of"), "prod": ("∏", "the product of"), "int": ("∫", "the integral of"),
        "iint": ("∬", "the double integral of"), "oint": ("∮", "the loop integral of"),
        // Binary operators
        "cdot": ("·", "dot"), "times": ("×", "times"), "div": ("÷", "divided by"), "pm": ("±", "plus or minus"),
        "mp": ("∓", "minus or plus"), "otimes": ("⊗", "tensor"), "oplus": ("⊕", "direct sum"), "circ": ("∘", "composed with"),
        "ast": ("∗", "star"), "star": ("⋆", "star"), "bullet": ("•", "dot"), "cup": ("∪", "union"), "cap": ("∩", "intersect"),
        "setminus": ("∖", "minus"), "wedge": ("∧", "wedge"), "vee": ("∨", "or"), "land": ("∧", "and"), "lor": ("∨", "or"),
        "neg": ("¬", "not"),
        // Relations
        "approx": (" ≈ ", "is approximately"), "simeq": (" ≃ ", "is approximately"), "sim": (" ∼ ", "is about"),
        "cong": (" ≅ ", "is congruent to"), "propto": (" ∝ ", "is proportional to"), "equiv": (" ≡ ", "is defined as"),
        "neq": (" ≠ ", "is not equal to"), "ne": (" ≠ ", "is not equal to"), "leq": (" ≤ ", "is at most"),
        "le": (" ≤ ", "is at most"), "geq": (" ≥ ", "is at least"), "ge": (" ≥ ", "is at least"),
        "ll": (" ≪ ", "is much less than"), "gg": (" ≫ ", "is much greater than"), "in": (" ∈ ", "in"),
        "notin": (" ∉ ", "not in"), "subset": (" ⊂ ", "subset of"), "subseteq": (" ⊆ ", "subset of"),
        "supset": (" ⊃ ", "superset of"), "perp": (" ⊥ ", "perpendicular to"), "parallel": (" ∥ ", "parallel to"),
        "mid": (" | ", "such that"),
        // Arrows
        "to": (" → ", "goes to"), "rightarrow": (" → ", "goes to"), "longrightarrow": (" ⟶ ", "goes to"),
        "leftarrow": (" ← ", "comes from"), "gets": (" ← ", "comes from"), "Rightarrow": (" ⇒ ", "implies"),
        "implies": (" ⇒ ", "implies"), "Leftrightarrow": (" ⇔ ", "if and only if"), "iff": (" ⇔ ", "if and only if"),
        "leftrightarrow": (" ↔ ", "goes both ways with"), "mapsto": (" ↦ ", "maps to"), "uparrow": ("↑", "up"),
        "downarrow": ("↓", "down"),
        // Quantifiers
        "forall": ("∀", "for all"), "exists": ("∃", "there is"),
        // Delimiters
        "langle": ("⟨", ""), "rangle": ("⟩", ""), "vert": ("|", ""), "lvert": ("|", ""), "rvert": ("|", ""),
        "Vert": ("‖", "norm"), "lVert": ("‖", "norm"), "rVert": ("‖", ""), "lbrace": ("{", ""), "rbrace": ("}", ""),
        "lfloor": ("⌊", "floor"), "rfloor": ("⌋", ""), "lceil": ("⌈", "ceiling"), "rceil": ("⌉", ""),
        // Dots and marks
        "ldots": ("…", "and so on"), "dots": ("…", "and so on"), "cdots": ("⋯", "and so on"), "vdots": ("⋮", ""),
        "ddots": ("⋱", ""), "prime": ("′", "prime"), "dagger": ("†", "dagger"), "dag": ("†", "dagger"),
        "ddagger": ("‡", "double dagger"), "angle": ("∠", "angle"), "deg": ("°", "degrees"), "degree": ("°", "degrees"),
        // Functions (upright, a thin space before the argument)
        "sin": ("sin\u{2009}", "sine"), "cos": ("cos\u{2009}", "cosine"), "tan": ("tan\u{2009}", "tangent"),
        "cot": ("cot\u{2009}", "cotangent"), "sec": ("sec\u{2009}", "secant"), "csc": ("csc\u{2009}", "cosecant"),
        "sinh": ("sinh\u{2009}", "hyperbolic sine"), "cosh": ("cosh\u{2009}", "hyperbolic cosine"),
        "tanh": ("tanh\u{2009}", "hyperbolic tangent"), "arcsin": ("arcsin\u{2009}", "arc sine"),
        "arccos": ("arccos\u{2009}", "arc cosine"), "arctan": ("arctan\u{2009}", "arc tangent"),
        "exp": ("exp\u{2009}", "the exponential of"), "log": ("log\u{2009}", "log"), "ln": ("ln\u{2009}", "the natural log of"),
        "lg": ("lg\u{2009}", "log"), "det": ("det\u{2009}", "the determinant of"), "tr": ("tr\u{2009}", "the trace of"),
        "Tr": ("Tr\u{2009}", "the trace of"), "max": ("max\u{2009}", "the maximum of"), "min": ("min\u{2009}", "the minimum of"),
        "sup": ("sup\u{2009}", "the supremum of"), "inf": ("inf\u{2009}", "the infimum of"), "lim": ("lim\u{2009}", "the limit"),
        "arg": ("arg\u{2009}", "the argument of"), "dim": ("dim\u{2009}", "the dimension of"), "ker": ("ker\u{2009}", "the kernel of"),
        "gcd": ("gcd\u{2009}", "the greatest common divisor of"), "Pr": ("Pr\u{2009}", "the probability of"),
    ]
}

/// A tiny recursive reader over LaTeX math source. Every way of nesting —
/// braces, `^`/`_` chains, `\frac\frac…`, `\sqrt[…]` — goes through `atom()`,
/// which stops descending past `maxNesting` (the rest isn't rendered), so a
/// hostile or broken formula can never exhaust the stack.
struct MathRenderer {
    let c: [Character]
    let speech: Bool
    var i = 0
    var depth = 0
    var nesting = 0
    static let maxNesting = 48

    init(_ source: String, speech: Bool) {
        c = Array(source)
        self.speech = speech
    }

    mutating func run() -> String {
        let out = sequence(until: nil)
        return speech ? MathText.tidySpeech(out) : MathText.tidyDisplay(out)
    }

    mutating func sequence(until close: Character?) -> String {
        var out = ""
        while i < c.count {
            let ch = c[i]
            if let close, ch == close {
                i += 1
                return out
            }
            if ch == "-" {
                i += 1
                out += minus(after: out)
                continue
            }
            out += atom()
        }
        return out
    }

    mutating func atom() -> String {
        guard i < c.count else { return "" }
        nesting += 1
        defer { nesting -= 1 }
        guard nesting <= Self.maxNesting else {
            // Too deep: stop here (every loop above ends at the end of the input).
            i = c.count
            return ""
        }
        let ch = c[i]
        switch ch {
        case "\\":
            return command()
        case "{":
            i += 1
            return group()
        case "}":
            i += 1
            return ""
        case "^", "_":
            i += 1
            return script(superscript: ch == "^")
        case " ", "\t", "\n", "\r":
            i += 1
            return ""
        case "~", "&":
            i += 1
            return " "
        case "%":
            while i < c.count, c[i] != "\n" { i += 1 }
            return ""
        default:
            i += 1
            return symbol(ch)
        }
    }

    mutating func group() -> String {
        depth += 1
        defer { depth -= 1 }
        if depth > 24 {
            skipGroup()
            return ""
        }
        return sequence(until: "}")
    }

    mutating func skipGroup() {
        var level = 1
        while i < c.count, level > 0 {
            if c[i] == "{" { level += 1 } else if c[i] == "}" { level -= 1 }
            i += 1
        }
    }

    func minus(after out: String) -> String {
        if speech { return " minus " }
        let last = out.last(where: { $0 != " " && $0 != "\u{2009}" })
        guard let last else { return "−" }
        if last.isLetter || last.isNumber || ")]}⟩|†′".contains(last)
            || MathText.superscripts.values.contains(last) || MathText.subscripts.values.contains(last) {
            return " − "
        }
        return "−"
    }

    func symbol(_ ch: Character) -> String {
        if !speech {
            switch ch {
            case "=", "+", "<", ">": return " \(ch) "
            case ",": return ", "
            case "*": return "∗"
            case "'": return "′"
            default: return String(ch)
            }
        }
        switch ch {
        case "=": return " equals "
        case "+": return " plus "
        case "<": return " is less than "
        case ">": return " is greater than "
        case "/": return " over "
        case "*": return " star "
        case "'": return " prime "
        case "!": return " factorial "
        case "|", "(", ")", "[", "]": return " "
        case ",", ";", ":": return ", "
        default:
            return ch.isLetter ? " \(ch) " : String(ch)
        }
    }

    mutating func command() -> String {
        i += 1
        guard i < c.count else { return "" }
        let first = c[i]
        guard first.isASCII, first.isLetter else {
            i += 1
            switch first {
            case ",", ":", ";", " ", ">": return " "
            case "!": return ""
            case "\\": return speech ? ", " : " "
            case "|": return speech ? " norm " : "‖"
            case "{", "}": return speech ? " " : String(first)
            default: return String(first)
            }
        }
        var name = ""
        while i < c.count, c[i].isASCII, c[i].isLetter {
            name.append(c[i])
            i += 1
        }
        return named(name)
    }

    mutating func named(_ name: String) -> String {
        if let s = MathText.symbols[name] { return speech ? " \(s.1) " : s.0 }
        switch name {
        case "frac", "dfrac", "tfrac", "cfrac":
            let a = argument()
            let b = argument()
            if speech { return " \(a) over \(b) " }
            return MathText.wrap(a) + "/" + MathText.wrap(b)
        case "sqrt":
            let n = optionalArgument()?.trimmingCharacters(in: .whitespaces)
            let a = argument()
            if speech {
                if let n, !n.isEmpty { return " the \(n) root of \(a) " }
                return " the square root of \(a) "
            }
            let index = n.flatMap { MathText.superscripted($0) } ?? ""
            return index + "√" + MathText.wrap(a)
        case "text", "textrm", "textit", "textbf", "textsf", "texttt", "textnormal", "mathrm", "operatorname", "mbox":
            let a = rawArgument()
            return speech ? " \(a) " : a
        case "mathbf", "mathit", "mathsf", "mathtt", "boldsymbol", "bm", "mathcal", "mathscr", "mathfrak", "mathbb", "pmb":
            return argument()
        case "hat", "widehat": return accent(argument(), mark: "\u{0302}", spoken: "hat")
        case "bar", "overline": return accent(argument(), mark: "\u{0304}", spoken: "bar")
        case "tilde", "widetilde": return accent(argument(), mark: "\u{0303}", spoken: "tilde")
        case "vec", "overrightarrow": return accent(argument(), mark: "\u{20D7}", spoken: "vector")
        case "dot": return accent(argument(), mark: "\u{0307}", spoken: "dot")
        case "ddot": return accent(argument(), mark: "\u{0308}", spoken: "double dot")
        case "left", "right", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr", "biggl", "biggr",
             "Biggl", "Biggr", "middle":
            if i < c.count, c[i] == "." { i += 1 }
            return ""
        case "quad", "qquad", "enspace", "thinspace":
            return " "
        case "begin", "end":
            _ = rawArgument()
            return " "
        case "label", "tag":
            _ = rawArgument()
            return ""
        case "nonumber", "notag", "displaystyle", "textstyle", "limits", "nolimits":
            return ""
        case "ket":
            let a = argument()
            return speech ? " ket \(a) " : "|\(a.trimmingCharacters(in: .whitespaces))⟩"
        case "bra":
            let a = argument()
            return speech ? " bra \(a) " : "⟨\(a.trimmingCharacters(in: .whitespaces))|"
        case "braket":
            let a = argument()
            return speech ? " bracket \(a) " : "⟨\(a.trimmingCharacters(in: .whitespaces))⟩"
        default:
            return speech ? " \(name) " : name
        }
    }

    func accent(_ base: String, mark: String, spoken: String) -> String {
        let b = base.trimmingCharacters(in: .whitespaces)
        if speech { return " \(b) \(spoken) " }
        return b.isEmpty ? "" : b + mark
    }

    mutating func argument() -> String {
        while i < c.count, c[i] == " " { i += 1 }
        guard i < c.count else { return "" }
        if c[i] == "{" {
            i += 1
            return group()
        }
        return atom()
    }

    /// `{…}` read verbatim (text keeps its spaces).
    mutating func rawArgument() -> String {
        while i < c.count, c[i] == " " { i += 1 }
        guard i < c.count else { return "" }
        guard c[i] == "{" else {
            let ch = c[i]
            i += 1
            return String(ch)
        }
        i += 1
        var level = 1
        var out = ""
        while i < c.count {
            let ch = c[i]
            i += 1
            if ch == "{" {
                level += 1
            } else if ch == "}" {
                level -= 1
                if level == 0 { break }
            }
            out.append(ch)
        }
        return out
    }

    mutating func optionalArgument() -> String? {
        guard i < c.count, c[i] == "[" else { return nil }
        i += 1
        nesting += 1
        defer { nesting -= 1 }
        guard nesting <= Self.maxNesting else {
            i = c.count
            return nil
        }
        return sequence(until: "]")
    }

    mutating func script(superscript: Bool) -> String {
        let start = i
        let arg = argument()
        let value = arg.trimmingCharacters(in: .whitespaces)
        if speech {
            guard superscript else { return " sub \(value) " }
            let source = String(c[start..<i]).filter { !"{} ".contains($0) }
            if source.hasPrefix("("), source.hasSuffix(")") { return " \(value) " } // G^{(2)}: an order label
            switch value {
            case "2": return " squared "
            case "3": return " cubed "
            case "dagger", "†": return " dagger "
            case "star", "*", "∗": return " star "
            case "prime", "′": return " prime "
            case "T": return " transpose "
            case "minus 1": return " inverse "
            default: return " to the \(value) "
            }
        }
        if superscript {
            if ["†", "∗", "′", "*", "′′", "‡"].contains(value) { return value }
            if let s = MathText.superscripted(value) { return s }
        } else if let s = MathText.subscripted(value) {
            return s
        }
        let mark = superscript ? "^" : "_"
        return value.count == 1 ? mark + value : "\(mark)(\(value))"
    }
}

// Shared math-detection helpers (D9). A "block equation" paragraph is one
// that is entirely a display-math expression — $$…$$ or \[…\]. Those render
// through KaTeX (MathView) and are skipped by TTS/karaoke.

export function blockMathOf(paragraph) {
  if (!paragraph || paragraph.length < 4) return null;
  const m = paragraph.match(
    /^\s*(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$]+)\$)\s*$/
  );
  return m ? (m[1] || m[2] || m[3]).trim() : null;
}

// PDF text extraction turns typeset equations into unicode salad —
// "〈∆X 2 a 〉= 1 2 e −2r" — that reads as garbage prose and sounds worse
// aloud. There is no LaTeX to recover from a PDF's text layer, but the
// paragraph can at least be RECOGNISED as an equation: rendered as a
// centered serif equation card and skipped by TTS/karaoke, with the
// Original-pages view carrying the true typesetting.
const MATH_CHARS = /[〈〉⟨⟩∆∂ˆ†±×÷≈≠≡≤≥∑∏∫√ℏωθφχψΨΦΩαβγδεσρλμνπ∞′″|]/g;
const STRONG_MATH = /[〈〉⟨⟩∆∂ˆ†∑∏∫√ℏ]/;

export function isUnicodeMathParagraph(paragraph) {
  if (!paragraph || paragraph.length < 8 || paragraph.length > 500) {
    return false;
  }
  if (!STRONG_MATH.test(paragraph)) return false;
  const mathCount = (paragraph.match(MATH_CHARS) || []).length;
  const eqCount = (paragraph.match(/[=+−^_/-]/g) || []).length;
  const words = paragraph.split(/\s+/);
  // Real prose sentences have long alphabetic words; equations fragment
  // into 1-3 char tokens.
  const shortTokens = words.filter((w) => w.replace(/[^A-Za-z]/g, "").length <= 2).length;
  return (
    mathCount + eqCount >= 6 &&
    shortTokens / Math.max(1, words.length) > 0.55
  );
}

// ---------------------------------------------------------------------------
// P1 — inline math inside prose paragraphs.
//
// The arxiv-latex / nougat extraction tiers emit prose with $…$ islands.
// tokenizeMathParagraph is the SINGLE tokenizer used by BOTH the reader's
// word/karaoke index builder and ParagraphText's renderer — if the two ever
// tokenized differently, every highlight after the first equation would be
// off by one. A math island is exactly ONE token (one karaoke unit).
// ---------------------------------------------------------------------------

const INLINE_MATH_RE = /\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g;

export function tokenizeMathParagraph(paragraph) {
  // fast path: no math → plain word split (the overwhelmingly common case)
  if (!paragraph.includes("$")) {
    return paragraph.split(/\s+/).filter(Boolean).map((w) => ({ display: w, latex: null }));
  }
  const tokens = [];
  const pushWords = (str) => {
    for (const w of str.split(/\s+/)) {
      if (w) tokens.push({ display: w, latex: null });
    }
  };
  let last = 0;
  let m;
  INLINE_MATH_RE.lastIndex = 0;
  while ((m = INLINE_MATH_RE.exec(paragraph)) !== null) {
    pushWords(paragraph.slice(last, m.index));
    const latex = m[0].replace(/^\$\$?|\$\$?$/g, "").trim();
    tokens.push({ display: latexToUnicode(latex), latex: latex || "…" });
    last = m.index + m[0].length;
  }
  pushWords(paragraph.slice(last));
  return tokens;
}

// Compact unicode prettifier for INLINE math display (display blocks get
// real KaTeX via MathView; inline spans must stay RN <Text> so karaoke and
// selection keep working). Lossy by design — readable, not typeset.
const U_GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π",
  rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ",
  chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ",
  Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};
const U_SYM = {
  hbar: "ℏ", infty: "∞", partial: "∂", nabla: "∇", pm: "±", mp: "∓",
  times: "×", cdot: "·", approx: "≈", simeq: "≃", sim: "∼", propto: "∝",
  equiv: "≡", neq: "≠", leq: "≤", geq: "≥", ll: "≪", gg: "≫", int: "∫",
  oint: "∮", sum: "∑", prod: "∏", otimes: "⊗", oplus: "⊕", dagger: "†",
  dag: "†", ast: "∗", star: "⋆", perp: "⊥", rightarrow: "→", to: "→",
  Rightarrow: "⇒", leftrightarrow: "↔", langle: "⟨", rangle: "⟩",
  ell: "ℓ", prime: "′", degree: "°", circ: "∘", bullet: "•", ldots: "…",
  cdots: "⋯", dots: "…", exp: "exp", ln: "ln", log: "log", sin: "sin",
  cos: "cos", tan: "tan", sinh: "sinh", cosh: "cosh", tanh: "tanh",
  quad: " ", qquad: " ",
};
const U_SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", n: "ⁿ", i: "ⁱ" };
const U_SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", a: "ₐ", e: "ₑ", i: "ᵢ", j: "ⱼ", k: "ₖ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", x: "ₓ" };

const mapChars = (str, table) =>
  [...str].every((c) => table[c]) ? [...str].map((c) => table[c]).join("") : null;

export function latexToUnicode(latex) {
  let s = String(latex || "").trim();

  // fractions → a/b (recursive-enough via repeated pass on innermost groups)
  for (let i = 0; i < 4 && /\\[dt]?frac/.test(s); i++) {
    s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2");
  }
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)").replace(/\\sqrt/g, "√");

  // physics-package Dirac macros (\ket, \bra, \braket)
  s = s
    .replace(/\\braket\{([^{}|]*)\|([^{}]*)\}/g, "⟨$1|$2⟩")
    .replace(/\\ket\{([^{}]*)\}/g, "|$1⟩")
    .replace(/\\bra\{([^{}]*)\}/g, "⟨$1|");

  // accents / wrappers that keep their argument
  s = s
    .replace(/\\(?:hat|widehat)\{([^{}])\}/g, "$1\u0302")
    .replace(/\\(?:hat|widehat)\s+([A-Za-z])/g, "$1\u0302")
    .replace(/\\tilde\s+([A-Za-z])/g, "$1\u0303")
    .replace(/\\bar\s+([A-Za-z])/g, "$1\u0304")
    .replace(/\\vec\s+([A-Za-z])/g, "$1")
    .replace(/\\(?:tilde|widetilde)\{([^{}])\}/g, "$1\u0303")
    .replace(/\\bar\{([^{}])\}/g, "$1\u0304")
    .replace(/\\vec\{([^{}])\}/g, "$1")
    .replace(/\\dot\{([^{}])\}/g, "$1\u0307")
    .replace(/\\(?:mathrm|mathbf|mathcal|mathbb|mathit|text|boldsymbol|operatorname)\{([^{}]*)\}/g, "$1")
    .replace(/\\left(?![a-zA-Z])|\\right(?![a-zA-Z])/g, "")
    .replace(/\\[,;!:]/g, " ");

  // super/subscripts (unicode where the whole group maps, else keep marker)
  s = s
    .replace(/\^\{?\\dagger\}?|\^\{?\\dag\}?/g, "†")
    .replace(/\^\{([^{}]*)\}/g, (_, g) => mapChars(g, U_SUP) || "^(" + g + ")")
    .replace(/\^(\S)/g, (_, c) => U_SUP[c] || "^" + c)
    .replace(/_\{([^{}]*)\}/g, (_, g) => mapChars(g, U_SUB) || "_(" + g + ")")
    .replace(/_(\S)/g, (_, c) => U_SUB[c] || "_" + c);

  // symbols + greek by name
  s = s.replace(/\\([a-zA-Z]+)/g, (_, name) => U_GREEK[name] ?? U_SYM[name] ?? name);

  return s.replace(/[{}]/g, "").replace(/\s+/g, " ").trim() || "▢";
}

// Split an overlong paragraph into ≤maxWords pieces WITHOUT ever cutting
// inside a $…$ / $$…$$ island (P1 review finding: a naive word-slice can
// sever a pair, and the orphaned $ then mis-pairs with the NEXT equation,
// swallowing prose into a pseudo-math token).
export function splitParagraphMathSafe(paragraph, maxWords) {
  // alternating [prose, island, prose, …] — islands are atomic units
  const parts = [];
  let last = 0;
  let m;
  INLINE_MATH_RE.lastIndex = 0;
  while ((m = INLINE_MATH_RE.exec(paragraph)) !== null) {
    if (m.index > last) parts.push({ text: paragraph.slice(last, m.index), math: false });
    parts.push({ text: m[0], math: true });
    last = m.index + m[0].length;
  }
  if (last < paragraph.length) parts.push({ text: paragraph.slice(last), math: false });

  const pieces = [];
  let current = [];
  let count = 0;
  const flush = () => {
    if (count > 0) pieces.push(current.join(" "));
    current = [];
    count = 0;
  };
  for (const part of parts) {
    const units = part.math ? [part.text] : part.text.split(/\s+/).filter(Boolean);
    for (const u of units) {
      current.push(u);
      count += 1;
      if (count >= maxWords) flush();
    }
  }
  flush();
  return pieces.length > 0 ? pieces : [paragraph];
}

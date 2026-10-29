// Math-aware tokenizing, ported from the Expo app (neuropal-expo-app/src/utils/math.js).
//
// The reader's word index (karaoke, resume point, ReadingSession.lastWordIndex)
// must count words EXACTLY like the phone does, or a book opened on the web
// resumes at a different word than the phone left it. So these functions keep
// the Expo app's rules on purpose — including their quirks:
//   - a paragraph that is one display equation ($$…$$, \[…\], or one $…$)
//     is ONE token;
//   - a PDF "unicode salad" equation paragraph is ONE token;
//   - an inline $…$ island inside prose is ONE token.
// Equations are shown prettified and never read aloud as raw LaTeX.

export interface MathToken {
  display: string;
  /** The LaTeX source when the token is an inline math island. */
  latex: string | null;
}

export function blockMathOf(paragraph: string): string | null {
  if (!paragraph || paragraph.length < 4) return null;
  const m = paragraph.match(/^\s*(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$]+)\$)\s*$/);
  return m ? (m[1] || m[2] || m[3]).trim() : null;
}

const MATH_CHARS = /[〈〉⟨⟩∆∂ˆ†±×÷≈≠≡≤≥∑∏∫√ℏωθφχψΨΦΩαβγδεσρλμνπ∞′″|]/g;
const STRONG_MATH = /[〈〉⟨⟩∆∂ˆ†∑∏∫√ℏ]/;

/** PDF text layers turn typeset equations into unicode fragments; recognise them. */
export function isUnicodeMathParagraph(paragraph: string): boolean {
  if (!paragraph || paragraph.length < 8 || paragraph.length > 500) return false;
  if (!STRONG_MATH.test(paragraph)) return false;
  const mathCount = (paragraph.match(MATH_CHARS) || []).length;
  const eqCount = (paragraph.match(/[=+−^_/-]/g) || []).length;
  const words = paragraph.split(/\s+/);
  const shortTokens = words.filter((w) => w.replace(/[^A-Za-z]/g, "").length <= 2).length;
  return mathCount + eqCount >= 6 && shortTokens / Math.max(1, words.length) > 0.55;
}

const inlineMathRe = () => /\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g;

/** THE tokenizer — used for counting words and for rendering them. */
export function tokenizeMathParagraph(paragraph: string): MathToken[] {
  if (!paragraph.includes("$")) {
    return paragraph
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ({ display: w, latex: null }));
  }
  const tokens: MathToken[] = [];
  const pushWords = (str: string) => {
    for (const w of str.split(/\s+/)) if (w) tokens.push({ display: w, latex: null });
  };
  const re = inlineMathRe();
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraph)) !== null) {
    pushWords(paragraph.slice(last, m.index));
    const latex = m[0].replace(/^\$\$?|\$\$?$/g, "").trim();
    tokens.push({ display: latexToUnicode(latex), latex: latex || "…" });
    last = m.index + m[0].length;
  }
  pushWords(paragraph.slice(last));
  return tokens;
}

const U_GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π",
  rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ",
  Omega: "Ω",
};
const U_SYM: Record<string, string> = {
  hbar: "ℏ", infty: "∞", partial: "∂", nabla: "∇", pm: "±", mp: "∓", times: "×", cdot: "·", approx: "≈",
  simeq: "≃", sim: "∼", propto: "∝", equiv: "≡", neq: "≠", leq: "≤", geq: "≥", ll: "≪", gg: "≫",
  int: "∫", oint: "∮", sum: "∑", prod: "∏", otimes: "⊗", oplus: "⊕", dagger: "†", dag: "†", ast: "∗",
  star: "⋆", perp: "⊥", rightarrow: "→", to: "→", Rightarrow: "⇒", leftrightarrow: "↔", langle: "⟨",
  rangle: "⟩", ell: "ℓ", prime: "′", degree: "°", circ: "∘", bullet: "•", ldots: "…", cdots: "⋯",
  dots: "…", exp: "exp", ln: "ln", log: "log", sin: "sin", cos: "cos", tan: "tan", sinh: "sinh",
  cosh: "cosh", tanh: "tanh", quad: " ", qquad: " ",
};
const U_SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", n: "ⁿ", i: "ⁱ",
};
const U_SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", a: "ₐ", e: "ₑ", i: "ᵢ", j: "ⱼ", k: "ₖ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ",
  s: "ₛ", t: "ₜ", u: "ᵤ", x: "ₓ",
};

const mapChars = (str: string, table: Record<string, string>) =>
  [...str].every((c) => table[c]) ? [...str].map((c) => table[c]).join("") : null;

/** Lossy unicode rendering of LaTeX for display: readable, not typeset. */
export function latexToUnicode(latex: string): string {
  let s = String(latex || "").trim();
  for (let i = 0; i < 4 && /\\[dt]?frac/.test(s); i++) {
    s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2");
  }
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)").replace(/\\sqrt/g, "√");
  s = s
    .replace(/\\braket\{([^{}|]*)\|([^{}]*)\}/g, "⟨$1|$2⟩")
    .replace(/\\ket\{([^{}]*)\}/g, "|$1⟩")
    .replace(/\\bra\{([^{}]*)\}/g, "⟨$1|");
  s = s
    .replace(/\\(?:hat|widehat)\{([^{}])\}/g, "$1̂")
    .replace(/\\(?:hat|widehat)\s+([A-Za-z])/g, "$1̂")
    .replace(/\\tilde\s+([A-Za-z])/g, "$1̃")
    .replace(/\\bar\s+([A-Za-z])/g, "$1̄")
    .replace(/\\vec\s+([A-Za-z])/g, "$1")
    .replace(/\\(?:tilde|widetilde)\{([^{}])\}/g, "$1̃")
    .replace(/\\bar\{([^{}])\}/g, "$1̄")
    .replace(/\\vec\{([^{}])\}/g, "$1")
    .replace(/\\dot\{([^{}])\}/g, "$1̇")
    .replace(/\\(?:mathrm|mathbf|mathcal|mathbb|mathit|text|boldsymbol|operatorname)\{([^{}]*)\}/g, "$1")
    .replace(/\\left(?![a-zA-Z])|\\right(?![a-zA-Z])/g, "")
    .replace(/\\[,;!:]/g, " ");
  s = s
    .replace(/\^\{?\\dagger\}?|\^\{?\\dag\}?/g, "†")
    .replace(/\^\{([^{}]*)\}/g, (_, g: string) => mapChars(g, U_SUP) || "^(" + g + ")")
    .replace(/\^(\S)/g, (_, c: string) => U_SUP[c] || "^" + c)
    .replace(/_\{([^{}]*)\}/g, (_, g: string) => mapChars(g, U_SUB) || "_(" + g + ")")
    .replace(/_(\S)/g, (_, c: string) => U_SUB[c] || "_" + c);
  s = s.replace(/\\([a-zA-Z]+)/g, (_, name: string) => U_GREEK[name] ?? U_SYM[name] ?? name);
  return s.replace(/[{}]/g, "").replace(/\s+/g, " ").trim() || "▢";
}

/** Split an overlong paragraph into ≤ maxWords pieces, never inside a $…$ island. */
export function splitParagraphMathSafe(paragraph: string, maxWords: number): string[] {
  const parts: { text: string; math: boolean }[] = [];
  const re = inlineMathRe();
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraph)) !== null) {
    if (m.index > last) parts.push({ text: paragraph.slice(last, m.index), math: false });
    parts.push({ text: m[0], math: true });
    last = m.index + m[0].length;
  }
  if (last < paragraph.length) parts.push({ text: paragraph.slice(last), math: false });

  const pieces: string[] = [];
  let current: string[] = [];
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

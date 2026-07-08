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

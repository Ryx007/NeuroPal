// Shared math-detection helpers (D9). A "block equation" paragraph is one
// that is entirely a display-math expression — $$…$$ or \[…\]. Those render
// through KaTeX (MathView) and are skipped by TTS/karaoke.

export function blockMathOf(paragraph) {
  if (!paragraph || paragraph.length < 4) return null;
  const m = paragraph.match(
    /^\s*(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])\s*$/
  );
  return m ? (m[1] || m[2]).trim() : null;
}

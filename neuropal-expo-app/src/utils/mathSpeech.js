// P1 — rule-based LaTeX → spoken English for the "Speak equations: read
// aloud" mode. Not a full grammar; it covers the physics notation the owner
// actually reads (QM/quantum optics): kets/bras, fractions, roots, Greek,
// operators, sub/superscripts. Anything unrecognised degrades to its bare
// name rather than being spelled as raw LaTeX.

const GREEK = {
  alpha: "alpha", beta: "beta", gamma: "gamma", delta: "delta",
  epsilon: "epsilon", varepsilon: "epsilon", zeta: "zeta", eta: "eta",
  theta: "theta", vartheta: "theta", iota: "iota", kappa: "kappa",
  lambda: "lambda", mu: "mu", nu: "nu", xi: "xi", pi: "pi", varpi: "pi",
  rho: "rho", sigma: "sigma", varsigma: "sigma", tau: "tau",
  upsilon: "upsilon", phi: "phi", varphi: "phi", chi: "chi", psi: "psi",
  omega: "omega", Gamma: "capital gamma", Delta: "capital delta",
  Theta: "capital theta", Lambda: "capital lambda", Xi: "capital xi",
  Pi: "capital pi", Sigma: "capital sigma", Upsilon: "capital upsilon",
  Phi: "capital phi", Psi: "capital psi", Omega: "capital omega",
};

const SYMBOLS = {
  hbar: "h bar", infty: "infinity", partial: "partial", nabla: "del",
  pm: "plus or minus", mp: "minus or plus", times: "times", cdot: "dot",
  approx: "approximately", simeq: "approximately", sim: "similar to",
  propto: "proportional to", equiv: "is equivalent to", neq: "not equal",
  leq: "less than or equal", geq: "greater than or equal", ll: "much less than",
  gg: "much greater than", rightarrow: "goes to", to: "goes to",
  Rightarrow: "implies", leftrightarrow: "if and only if",
  int: "the integral of", oint: "the closed integral of", sum: "the sum of",
  prod: "the product of", lim: "the limit of", otimes: "tensor",
  oplus: "direct sum", dagger: "dagger", dag: "dagger", ast: "star",
  star: "star", perp: "perpendicular", parallel: "parallel",
  hat: "hat", tilde: "tilde", bar: "bar", vec: "vector", dot: "dot",
  ddot: "double dot", prime: "prime", ell: "ell", Re: "real part of",
  Im: "imaginary part of", exp: "the exponential of", ln: "natural log of",
  log: "log of", sin: "sine of", cos: "cosine of", tan: "tangent of",
  sinh: "hyperbolic sine of", cosh: "hyperbolic cosine of",
  tanh: "hyperbolic tangent of", arcsin: "arc sine of", arccos: "arc cosine of",
  det: "the determinant of", tr: "the trace of", Tr: "the trace of",
  mathrm: "", mathbf: "", mathcal: "", mathbb: "", mathit: "", boldsymbol: "",
  left: "", right: "", quad: " ", qquad: " ", "!": "", ",": " ", ";": " ",
  nonumber: "", displaystyle: "",
};

// Read a {balanced} group starting at the opening brace; returns [content, endIndex].
function readGroup(s, openIdx) {
  if (s[openIdx] !== "{") return ["", openIdx];
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return [s.slice(openIdx + 1, i), i + 1];
    }
  }
  return [s.slice(openIdx + 1), s.length];
}

// \frac{a}{b} → "a over b" (recursive — fractions nest constantly).
// CRITICAL: `i` must advance on EVERY branch. \frac12 (brace-less shorthand)
// once sent indexOf→-1 through readGroup and walked `i` backwards — a
// synchronous infinite loop that wedged the whole JS thread.
function speakFractions(s, depth = 0) {
  if (depth > 6) return s;
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("\\frac", i) || s.startsWith("\\dfrac", i) || s.startsWith("\\tfrac", i)) {
      const cmdLen = s.startsWith("\\frac", i) ? 5 : 6;
      const numBrace = s.indexOf("{", i + cmdLen);
      // braces must follow immediately (allowing whitespace); \frac12 and
      // other shorthand degrade to the word "over"
      if (numBrace === -1 || /\S/.test(s.slice(i + cmdLen, numBrace))) {
        out += " over ";
        i += cmdLen;
        continue;
      }
      const [num, afterNum] = readGroup(s, numBrace);
      const denBrace = s.indexOf("{", afterNum);
      if (denBrace === -1 || denBrace < afterNum || /\S/.test(s.slice(afterNum, denBrace))) {
        out += ` ${speakFractions(num, depth + 1)} over `;
        i = Math.max(afterNum, i + cmdLen);
        continue;
      }
      const [den, afterDen] = readGroup(s, denBrace);
      out += ` ${speakFractions(num, depth + 1)} over ${speakFractions(den, depth + 1)} `;
      i = Math.max(afterDen, i + 1);
    } else if (s.startsWith("\\sqrt", i)) {
      const braceIdx = s.indexOf("{", i + 5);
      if (braceIdx === -1 || /\S/.test(s.slice(i + 5, braceIdx))) {
        out += " square root of ";
        i += 5;
      } else {
        const [inner, after] = readGroup(s, braceIdx);
        out += ` the square root of ${speakFractions(inner, depth + 1)} `;
        i = Math.max(after, i + 1);
      }
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
}

export function latexToSpeech(latex) {
  let s = String(latex || "").trim();
  if (!s) return "equation";

  // structural first
  s = s
    .replace(/\\begin\{[a-z*]+\}|\\end\{[a-z*]+\}/g, " ")
    .replace(/\\label\{[^}]*\}/g, "")
    .replace(/&/g, " ")
    .replace(/\\\\/g, " . "); // alignment rows → sentence-ish pauses

  s = speakFractions(s);

  // Dirac notation (before generic \langle/\rangle handling)
  s = s
    .replace(/\\braket\{([^{}|]*)\|([^{}]*)\}/g, " the overlap of $1 and $2 ")
    .replace(/\\ket\{([^{}]*)\}/g, " ket $1 ")
    .replace(/\\bra\{([^{}]*)\}/g, " bra $1 ")
    .replace(/\\langle\s*([^|]{1,40}?)\s*\|\s*([^\\⟩]{1,40}?)\s*\\rangle/g, " the overlap of $1 and $2 ")
    .replace(/\|\s*([^\s|⟩]{1,30}?)\s*\\rangle/g, " ket $1 ")
    .replace(/\\langle\s*([^\s|⟨]{1,30}?)\s*\|/g, " bra $1 ")
    .replace(/\\rangle/g, " ket ")
    .replace(/\\langle/g, " bra ");

  // superscripts/subscripts
  s = s
    .replace(/\^\{?\\dagger\}?|\^\{?\\dag\}?/g, " dagger ")
    // exact-token shorthands only: ^{2} or ^2-not-followed-by-more —
    // e^{2r} must NOT become "e squared r"
    .replace(/\^\{2\}|\^2(?![\w.])/g, " squared ")
    .replace(/\^\{3\}|\^3(?![\w.])/g, " cubed ")
    .replace(/\^\{\*\}|\^\*/g, " star ")
    .replace(/\^\{-1\}|\^-1(?![\w.])/g, " inverse ")
    .replace(/\^\{([^{}]*)\}/g, " to the $1 ")
    .replace(/\^(\S)/g, " to the $1 ")
    .replace(/_\{([^{}]*)\}/g, " sub $1 ")
    .replace(/_(\S)/g, " sub $1 ");

  // greek + symbols by name
  s = s.replace(/\\([a-zA-Z]+)/g, (_, name) => {
    if (GREEK[name] !== undefined) return ` ${GREEK[name]} `;
    if (SYMBOLS[name] !== undefined) return ` ${SYMBOLS[name]} `;
    return ` ${name} `; // unknown command → bare name beats raw latex
  });

  // operators & punctuation
  s = s
    .replace(/=/g, " equals ")
    .replace(/\+/g, " plus ")
    .replace(/−|-/g, " minus ")
    .replace(/\//g, " over ")
    .replace(/</g, " less than ")
    .replace(/>/g, " greater than ")
    .replace(/[{}()\[\]]/g, " ")
    .replace(/[~|]/g, " ")
    .replace(/,/g, " , ");

  s = s.replace(/\s+/g, " ").trim();
  // safety: an empty or symbol-soup result still gets a sane utterance
  if (!s || !/[a-zA-Z]/.test(s)) return "equation";
  // very long equations spoken fully are unlistenable — summarise the tail
  if (s.length > 350) s = `${s.slice(0, 350)} , and so on`;
  return s;
}

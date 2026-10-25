// Math in reading text — a port of neuropal-expo-app/src/utils/math.js.
//
// The backend's extraction tiers emit prose with `$…$` islands and
// `$$…$$` display blocks. Rules shared with the Expo reader:
//   * a math island is ONE token (one karaoke unit), spoken as "equation";
//   * a paragraph that is entirely an equation is one token too;
//   * PDF "unicode math salad" paragraphs are recognised as equations.
// Using the same rules keeps word indexes (the shared resume point) in step
// with the Expo app.

final RegExp _blockMath = RegExp(
  r'^\s*(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$]+)\$)\s*$',
);

/// The LaTeX of a paragraph that is entirely display math, else null.
String? blockMathOf(String paragraph) {
  if (paragraph.length < 4) return null;
  final m = _blockMath.firstMatch(paragraph);
  if (m == null) return null;
  return (m.group(1) ?? m.group(2) ?? m.group(3))!.trim();
}

final RegExp _mathChars = RegExp(
  '[〈〉⟨⟩∆∂ˆ†±×÷≈≠≡≤≥∑∏∫√ℏωθφχψΨΦΩαβγδεσρλμνπ∞′″|]',
);
final RegExp _strongMath = RegExp('[〈〉⟨⟩∆∂ˆ†∑∏∫√ℏ]');
final RegExp _eqChars = RegExp('[=+−^_/-]');
final RegExp _nonLetters = RegExp('[^A-Za-z]');

/// PDF text layers turn typeset equations into symbol salad
/// ("〈∆X 2 a 〉= 1 2 e −2r"). Such paragraphs are shown as an equation card
/// and spoken as "equation" instead of being read out as garbage.
bool isUnicodeMathParagraph(String paragraph) {
  if (paragraph.length < 8 || paragraph.length > 500) return false;
  if (!_strongMath.hasMatch(paragraph)) return false;
  final mathCount = _mathChars.allMatches(paragraph).length;
  final eqCount = _eqChars.allMatches(paragraph).length;
  final words = paragraph.split(RegExp(r'\s+'));
  // Real prose has long alphabetic words; equations fragment into 1–3
  // character tokens.
  final shortTokens = words
      .where((w) => w.replaceAll(_nonLetters, '').length <= 2)
      .length;
  return mathCount + eqCount >= 6 && shortTokens / words.length > 0.55;
}

/// One token of a prose paragraph. [latex] is set for math islands.
class MathToken {
  const MathToken(this.display, [this.latex, this.glued = false]);

  final String display;
  final String? latex;

  /// Written right against the previous token with no space in the source
  /// ("$x$," → the comma). Display-only: it is still its own word.
  final bool glued;

  bool get isMath => latex != null;
}

final RegExp _inlineMath = RegExp(r'\$\$[\s\S]*?\$\$|\$[^$\n]+\$');
final RegExp _whitespace = RegExp(r'\s+');
final RegExp _mathDelimiters = RegExp(r'^\$\$?|\$\$?$');

List<String> _words(String s) =>
    s.split(_whitespace).where((w) => w.isNotEmpty).toList();

/// Splits a prose paragraph into words, keeping each `$…$` island whole.
/// This must stay the single tokenizer for both the word index and the
/// renderer, or every highlight after the first equation would drift.
List<MathToken> tokenizeMathParagraph(String paragraph) {
  if (!paragraph.contains(r'$')) {
    return [for (final w in _words(paragraph)) MathToken(w)];
  }
  final tokens = <MathToken>[];

  // Prose between islands. Its first word is glued to a preceding island
  // when nothing separates them ("$x$, so" → "x" + glued ",").
  void addProse(String segment) {
    final words = _words(segment);
    for (var i = 0; i < words.length; i++) {
      final glued =
          i == 0 &&
          tokens.isNotEmpty &&
          tokens.last.isMath &&
          !segment.startsWith(_whitespaceStart);
      tokens.add(MathToken(words[i], null, glued));
    }
  }

  var last = 0;
  for (final m in _inlineMath.allMatches(paragraph)) {
    addProse(paragraph.substring(last, m.start));
    final latex = m.group(0)!.replaceAll(_mathDelimiters, '').trim();
    final glued =
        tokens.isNotEmpty &&
        m.start > 0 &&
        !_whitespaceStart.hasMatch(paragraph[m.start - 1]);
    tokens.add(
      MathToken(latexToUnicode(latex), latex.isEmpty ? '…' : latex, glued),
    );
    last = m.end;
  }
  addProse(paragraph.substring(last));
  return tokens;
}

final RegExp _whitespaceStart = RegExp(r'^\s');

/// Splits an overlong paragraph into pieces of at most [maxWords] units
/// WITHOUT cutting inside a `$…$` island (a severed pair would mis-pair with
/// the next equation and swallow prose).
List<String> splitParagraphMathSafe(String paragraph, int maxWords) {
  final units = <String>[];
  var last = 0;
  for (final m in _inlineMath.allMatches(paragraph)) {
    units.addAll(_words(paragraph.substring(last, m.start)));
    units.add(m.group(0)!);
    last = m.end;
  }
  units.addAll(_words(paragraph.substring(last)));

  final pieces = <String>[];
  for (var i = 0; i < units.length; i += maxWords) {
    final end = i + maxWords < units.length ? i + maxWords : units.length;
    pieces.add(units.sublist(i, end).join(' '));
  }
  return pieces.isEmpty ? [paragraph] : pieces;
}

// ---- LaTeX → readable unicode ----------------------------------------------
// Compact prettifier for math DISPLAY (lossy by design: readable, not
// typeset). Proper typesetting is an M2 item.

const Map<String, String> _greek = {
  'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
  'varepsilon': 'ε', 'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'vartheta': 'ϑ',
  'iota': 'ι', 'kappa': 'κ', 'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ',
  'pi': 'π', 'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ',
  'phi': 'φ', 'varphi': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
  'Gamma': 'Γ', 'Delta': 'Δ', 'Theta': 'Θ', 'Lambda': 'Λ', 'Xi': 'Ξ',
  'Pi': 'Π', 'Sigma': 'Σ', 'Phi': 'Φ', 'Psi': 'Ψ', 'Omega': 'Ω',
};

const Map<String, String> _symbols = {
  'hbar': 'ℏ', 'infty': '∞', 'partial': '∂', 'nabla': '∇', 'pm': '±',
  'mp': '∓', 'times': '×', 'cdot': '·', 'approx': '≈', 'simeq': '≃',
  'sim': '∼', 'propto': '∝', 'equiv': '≡', 'neq': '≠', 'leq': '≤',
  'geq': '≥', 'll': '≪', 'gg': '≫', 'int': '∫', 'oint': '∮', 'sum': '∑',
  'prod': '∏', 'otimes': '⊗', 'oplus': '⊕', 'dagger': '†', 'dag': '†',
  'ast': '∗', 'star': '⋆', 'perp': '⊥', 'rightarrow': '→', 'to': '→',
  'Rightarrow': '⇒', 'leftrightarrow': '↔', 'langle': '⟨', 'rangle': '⟩',
  'ell': 'ℓ', 'prime': '′', 'degree': '°', 'circ': '∘', 'bullet': '•',
  'ldots': '…', 'cdots': '⋯', 'dots': '…', 'exp': 'exp', 'ln': 'ln',
  'log': 'log', 'sin': 'sin', 'cos': 'cos', 'tan': 'tan', 'sinh': 'sinh',
  'cosh': 'cosh', 'tanh': 'tanh', 'quad': ' ', 'qquad': ' ',
};

const Map<String, String> _sup = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', 'n': 'ⁿ', 'i': 'ⁱ',
};

const Map<String, String> _sub = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', 'a': 'ₐ', 'e': 'ₑ',
  'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ',
  'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'x': 'ₓ',
};

/// Maps every character through [table], or null if any is missing (or the
/// string is empty — JS treats "" as "no mapping" too).
String? _mapChars(String s, Map<String, String> table) {
  if (s.isEmpty) return null;
  final out = StringBuffer();
  for (final c in s.split('')) {
    final mapped = table[c];
    if (mapped == null) return null;
    out.write(mapped);
  }
  return out.toString();
}

/// Wraps a fraction part in parentheses when it has more than one term, so
/// `\frac{R}{1 + R\tau}` reads "R/(1 + Rτ)" rather than "R/1 + Rτ".
/// (Display-only improvement over the Expo prettifier; token counts are
/// unaffected.)
String _fracPart(String s) {
  final t = s.trim();
  return RegExp(r'[\s+\-−=]').hasMatch(t) ? '($t)' : t;
}

String latexToUnicode(String? latex) {
  var s = (latex ?? '').trim();

  final frac = RegExp(r'\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}');
  for (var i = 0; i < 4 && RegExp(r'\\[dt]?frac').hasMatch(s); i++) {
    s = s.replaceAllMapped(
      frac,
      (m) => '${_fracPart(m[1]!)}/${_fracPart(m[2]!)}',
    );
  }
  s = s
      .replaceAllMapped(RegExp(r'\\sqrt\{([^{}]*)\}'), (m) => '√(${m[1]})')
      .replaceAll(r'\sqrt', '√');

  // physics-package Dirac macros
  s = s
      .replaceAllMapped(
        RegExp(r'\\braket\{([^{}|]*)\|([^{}]*)\}'),
        (m) => '⟨${m[1]}|${m[2]}⟩',
      )
      .replaceAllMapped(RegExp(r'\\ket\{([^{}]*)\}'), (m) => '|${m[1]}⟩')
      .replaceAllMapped(RegExp(r'\\bra\{([^{}]*)\}'), (m) => '⟨${m[1]}|');

  // accents and wrappers that keep their argument
  s = s
      .replaceAllMapped(
        RegExp(r'\\(?:hat|widehat)\{([^{}])\}'),
        (m) => '${m[1]}\u0302',
      )
      .replaceAllMapped(
        RegExp(r'\\(?:hat|widehat)\s+([A-Za-z])'),
        (m) => '${m[1]}\u0302',
      )
      .replaceAllMapped(RegExp(r'\\tilde\s+([A-Za-z])'), (m) => '${m[1]}\u0303')
      .replaceAllMapped(RegExp(r'\\bar\s+([A-Za-z])'), (m) => '${m[1]}\u0304')
      .replaceAllMapped(RegExp(r'\\vec\s+([A-Za-z])'), (m) => m[1]!)
      .replaceAllMapped(
        RegExp(r'\\(?:tilde|widetilde)\{([^{}])\}'),
        (m) => '${m[1]}\u0303',
      )
      .replaceAllMapped(RegExp(r'\\bar\{([^{}])\}'), (m) => '${m[1]}\u0304')
      .replaceAllMapped(RegExp(r'\\vec\{([^{}])\}'), (m) => m[1]!)
      .replaceAllMapped(RegExp(r'\\dot\{([^{}])\}'), (m) => '${m[1]}\u0307')
      .replaceAllMapped(
        RegExp(
          r'\\(?:mathrm|mathbf|mathcal|mathbb|mathit|text|boldsymbol|operatorname)\{([^{}]*)\}',
        ),
        (m) => m[1]!,
      )
      .replaceAll(RegExp(r'\\left(?![a-zA-Z])|\\right(?![a-zA-Z])'), '')
      .replaceAll(RegExp(r'\\[,;!:]'), ' ');

  // super/subscripts: unicode where the whole group maps, else a marker
  s = s
      .replaceAll(RegExp(r'\^\{?\\dagger\}?|\^\{?\\dag\}?'), '†')
      .replaceAllMapped(
        RegExp(r'\^\{([^{}]*)\}'),
        (m) => _mapChars(m[1]!, _sup) ?? '^(${m[1]})',
      )
      .replaceAllMapped(RegExp(r'\^(\S)'), (m) => _sup[m[1]] ?? '^${m[1]}')
      .replaceAllMapped(
        RegExp(r'_\{([^{}]*)\}'),
        (m) => _mapChars(m[1]!, _sub) ?? '_(${m[1]})',
      )
      .replaceAllMapped(RegExp(r'_(\S)'), (m) => _sub[m[1]] ?? '_${m[1]}');

  // Greek letters and symbols by name
  s = s.replaceAllMapped(
    RegExp(r'\\([a-zA-Z]+)'),
    (m) => _greek[m[1]] ?? _symbols[m[1]] ?? m[1]!,
  );

  final out = s.replaceAll(RegExp('[{}]'), '').replaceAll(_whitespace, ' ').trim();
  return out.isEmpty ? '▢' : out;
}

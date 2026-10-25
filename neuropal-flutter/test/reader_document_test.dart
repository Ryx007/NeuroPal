// The reader's tokenizer: what is shown, what is spoken, and the word
// index that karaoke, tap-to-seek and the saved resume point share.

import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/data/models.dart';
import 'package:neuropal/reader/math_text.dart';
import 'package:neuropal/reader/reader_document.dart';

void main() {
  group('paragraphs and words', () {
    test('splits on blank lines and collapses whitespace', () {
      final doc = ReaderDocument.fromText(
        'First  line\nstill first.\n\n\n Second para \n\n',
      );
      expect(doc.paragraphs.length, 2);
      expect(doc.paragraphs[0].plainText, 'First line still first.');
      expect(doc.paragraphs[1].plainText, 'Second para');
      expect(doc.wordCount, 6);
      expect(doc.paragraphs[1].startWord, 4);
    });

    test('speech gets a pause after paragraphs without punctuation', () {
      final doc = ReaderDocument.fromText('Introduction\n\nThe text ends.');
      expect(doc.speechWords.first, 'Introduction.');
      expect(doc.speechWords.last, 'ends.'); // already punctuated
      // Display is unchanged.
      expect(doc.paragraphs.first.tokens.first.display, 'Introduction');
    });

    test('long paragraphs split at 180 words without losing words', () {
      final words = List.generate(400, (i) => 'w$i').join(' ');
      final doc = ReaderDocument.fromText(words);
      expect(doc.paragraphs.length, 3); // 180 + 180 + 40
      expect(doc.wordCount, 400);
      expect(doc.paragraphs.map((p) => p.origin).toSet(), {0});
    });

    test('paragraphIndexForWord finds the right paragraph', () {
      final doc = ReaderDocument.fromText('a b c\n\nd e\n\nf');
      expect(doc.paragraphIndexForWord(0), 0);
      expect(doc.paragraphIndexForWord(2), 0);
      expect(doc.paragraphIndexForWord(3), 1);
      expect(doc.paragraphIndexForWord(5), 2);
      expect(doc.paragraphIndexForWord(99), 2);
    });
  });

  group('equations', () {
    test(r'inline $…$ is ONE token, shown prettified, spoken "equation"', () {
      final doc = ReaderDocument.fromText(
        r'Energy adds up, $\omega_s + \omega_i = \omega_p$, always.',
      );
      final tokens = doc.paragraphs.single.tokens;
      // Energy | adds | up, | <math> | , | always.  (same rules as Expo)
      expect(tokens.length, 6);
      final math = tokens[3];
      expect(math.isMath, isTrue);
      expect(math.display, 'ωₛ + ωᵢ = ωₚ');
      expect(doc.speechWords[3], 'equation');
      expect(doc.speechWords[2], 'up,');
      expect(doc.speechWords[4], ',');
    });

    test(r'a $$…$$ paragraph is one equation card', () {
      final doc = ReaderDocument.fromText(
        r'Before.' '\n\n' r'$$R_{\mathrm{meas}} = \frac{R}{1 + R\,\tau_d}$$' '\n\nAfter.',
      );
      expect(doc.paragraphs.length, 3);
      final eq = doc.paragraphs[1];
      expect(eq.kind, ParagraphKind.equation);
      expect(eq.tokens.single.display, 'Rₘₑₐₛ = R/(1 + R τ_d)');
      expect(doc.speechWords, ['Before.', 'equation.', 'After.']);
    });

    test('a long paragraph never splits inside an equation', () {
      final prose = List.generate(178, (i) => 'w$i').join(' ');
      final text = '$prose \$a + b + c\$ tail words here';
      final doc = ReaderDocument.fromText(text);
      final mathTokens = doc.paragraphs
          .expand((p) => p.tokens)
          .where((t) => t.isMath)
          .toList();
      expect(mathTokens.length, 1);
      expect(mathTokens.single.display, 'a + b + c');
      // 178 words + 1 equation + 3 words, split into two display pieces.
      expect(doc.wordCount, 182);
      expect(doc.paragraphs.length, 2);
    });

    test('punctuation written against math stays attached on screen', () {
      final doc = ReaderDocument.fromText(
        r'never exceed $1/\tau_d$, however (see $x$).',
      );
      final p = doc.paragraphs.single;
      expect(p.plainText, 'never exceed 1/τ_d, however (see x).');
      // Still separate words for karaoke/seek/progress (same as Expo).
      expect(p.tokens.map((t) => t.display), [
        'never', 'exceed', '1/τ_d', ',', 'however', '(see', 'x', ').',
      ]);
      expect(p.tokens.where((t) => t.glued).map((t) => t.display), [',', ').']);
    });

    test('PDF unicode math salad is recognised as an equation', () {
      expect(isUnicodeMathParagraph('〈∆X² 〉= ½ e^−2r ± √(∂ψ/∂t) ≈ ℏω'), isTrue);
      expect(
        isUnicodeMathParagraph('A perfectly ordinary sentence about light.'),
        isFalse,
      );
    });

    test('latexToUnicode handles the common physics notation', () {
      expect(latexToUnicode(r'\ket{\psi}'), '|ψ⟩');
      expect(latexToUnicode(r'\hbar\omega'), 'ℏω');
      expect(latexToUnicode(r'x^2 + y_{12}'), 'x² + y₁₂');
      expect(latexToUnicode(''), '▢');
    });
  });

  test('big books tokenize on a background isolate', () async {
    final text = List.generate(2000, (i) => 'Paragraph $i has a few words.')
        .join('\n\n');
    final doc = await readerDocumentInBackground(text, const [
      TocEntry(title: 'Start', startParagraph: 0),
      TocEntry(title: 'Middle', startParagraph: 1000),
    ]);
    expect(doc.paragraphs.length, 2000);
    expect(doc.wordCount, 12000);
    expect(doc.chapters.map((c) => c.wordIndex), [0, 6000]);
  });

  group('chapters from the backend TOC', () {
    test('maps TOC paragraphs to word indexes', () {
      final doc = ReaderDocument.fromText(
        'One\n\nalpha beta\n\nTwo\n\ngamma',
        toc: const [
          TocEntry(title: 'One', startParagraph: 0),
          TocEntry(title: 'Two', startParagraph: 2),
        ],
      );
      expect(doc.chapters.map((c) => c.wordIndex), [0, 3]);
      expect(doc.chapterAt(4)!.number, 2);
      expect(doc.chapterAt(1)!.mark.title, 'One');
    });

    test('fewer than two usable anchors means no chapters', () {
      final doc = ReaderDocument.fromText(
        'a\n\nb',
        toc: const [TocEntry(title: 'Only', startParagraph: 0)],
      );
      expect(doc.chapters, isEmpty);
    });
  });
}

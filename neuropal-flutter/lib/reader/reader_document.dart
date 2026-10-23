// Turns a document's plain text into what the reader needs:
//   * paragraphs of tokens (what you SEE),
//   * one global word list for the speech engine (what you HEAR),
//   * chapter marks for the scrubber.
//
// WORD INDEX = position in that global list. It is what karaoke highlights,
// what tap-to-seek jumps to and what is saved as `lastWordIndex` on the
// backend, so the paragraph/word rules mirror the Expo reader (BRAIN §5):
// paragraphs split on blank lines, long ones split at 180 words (math-safe),
// equations are single tokens spoken as "equation".

import 'dart:isolate';
import 'dart:math' as math;

import '../data/models.dart';
import 'math_text.dart';

/// Long paragraphs are split for display at this many words (same as Expo).
const int kMaxParagraphWords = 180;

class ReaderToken {
  const ReaderToken({
    required this.display,
    required this.speech,
    this.isMath = false,
    this.glued = false,
  });

  /// What is shown (inline math prettified to unicode).
  final String display;

  /// What the speech engine says ("equation" for math).
  final String speech;
  final bool isMath;

  /// Shown without a space before it (punctuation right after math).
  final bool glued;
}

enum ParagraphKind { prose, equation }

class ReaderParagraph {
  const ReaderParagraph({
    required this.index,
    required this.kind,
    required this.tokens,
    required this.startWord,
    required this.origin,
  });

  /// Position in [ReaderDocument.paragraphs].
  final int index;
  final ParagraphKind kind;
  final List<ReaderToken> tokens;

  /// Global word index of the first token.
  final int startWord;

  /// Index of the backend paragraph this came from (TOC anchors use it).
  final int origin;

  /// One past the last token's global word index.
  int get endWord => startWord + tokens.length;

  bool containsWord(int wordIndex) =>
      wordIndex >= startWord && wordIndex < endWord;

  /// Plain text for screen readers (and how the paragraph is displayed).
  String get plainText {
    final out = StringBuffer();
    for (var i = 0; i < tokens.length; i++) {
      if (i > 0 && !tokens[i].glued) out.write(' ');
      out.write(tokens[i].display);
    }
    return out.toString();
  }
}

/// A chapter start on the scrubber.
class ChapterMark {
  const ChapterMark({required this.title, required this.wordIndex});

  final String title;
  final int wordIndex;
}

class ReaderDocument {
  const ReaderDocument({
    required this.paragraphs,
    required this.speechWords,
    required this.chapters,
  });

  /// Builds the reader model from `/text`. Pure and synchronous, so large
  /// books can be tokenized in a background isolate.
  factory ReaderDocument.fromText(
    String text, {
    List<TocEntry> toc = const [],
  }) {
    // 1. Backend paragraphs (the domain TOC anchors index).
    final rough = text
        .split(RegExp(r'\n{2,}'))
        .map((p) => p.replaceAll(RegExp(r'\s+'), ' ').trim())
        .where((p) => p.isNotEmpty)
        .toList();

    final paragraphs = <ReaderParagraph>[];
    final speech = <String>[];

    for (var origin = 0; origin < rough.length; origin++) {
      final p = rough[origin];
      // 2. Long paragraphs → display pieces (equations stay whole).
      final pieces =
          p.split(' ').length <= kMaxParagraphWords || blockMathOf(p) != null
          ? [p]
          : splitParagraphMathSafe(p, kMaxParagraphWords);

      for (final piece in pieces) {
        // 3. Tokens: an equation paragraph is ONE token.
        final latex = blockMathOf(piece);
        final isEquation = latex != null || isUnicodeMathParagraph(piece);
        final tokens = isEquation
            ? [
                ReaderToken(
                  display: latex != null ? latexToUnicode(latex) : piece,
                  speech: 'equation',
                  isMath: true,
                ),
              ]
            : [
                for (final t in tokenizeMathParagraph(piece))
                  ReaderToken(
                    display: t.display,
                    speech: t.isMath ? 'equation' : t.display,
                    isMath: t.isMath,
                    glued: t.glued,
                  ),
              ];
        if (tokens.isEmpty) continue;

        paragraphs.add(
          ReaderParagraph(
            index: paragraphs.length,
            kind: isEquation ? ParagraphKind.equation : ParagraphKind.prose,
            tokens: tokens,
            startWord: speech.length,
            origin: origin,
          ),
        );
        for (var i = 0; i < tokens.length; i++) {
          final last = i == tokens.length - 1;
          speech.add(last ? withSpokenPause(tokens[i].speech) : tokens[i].speech);
        }
      }
    }

    return ReaderDocument(
      paragraphs: paragraphs,
      speechWords: speech,
      chapters: _chapters(toc, paragraphs, rough.length),
    );
  }

  final List<ReaderParagraph> paragraphs;

  /// Same length as the word count; what the engine speaks for each word.
  final List<String> speechWords;
  final List<ChapterMark> chapters;

  int get wordCount => speechWords.length;
  bool get isEmpty => speechWords.isEmpty;

  /// The paragraph holding [wordIndex] (binary search; clamps to range).
  int paragraphIndexForWord(int wordIndex) {
    if (paragraphs.isEmpty) return 0;
    var lo = 0;
    var hi = paragraphs.length - 1;
    while (lo < hi) {
      final mid = (lo + hi + 1) >> 1;
      if (paragraphs[mid].startWord <= wordIndex) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /// The chapter [wordIndex] falls in, with its 1-based number, or null.
  ({ChapterMark mark, int number})? chapterAt(int wordIndex) {
    ({ChapterMark mark, int number})? hit;
    for (var i = 0; i < chapters.length; i++) {
      if (chapters[i].wordIndex <= wordIndex) {
        hit = (mark: chapters[i], number: i + 1);
      }
    }
    return hit;
  }

  static List<ChapterMark> _chapters(
    List<TocEntry> toc,
    List<ReaderParagraph> paragraphs,
    int roughCount,
  ) {
    if (toc.length < 2 || paragraphs.isEmpty) return const [];
    final marks = <ChapterMark>[];
    for (final entry in toc) {
      final start = entry.startParagraph;
      if (start == null || start < 0) continue; // page-only anchors: M2
      final target = math.min(start, roughCount - 1);
      final para = paragraphs.firstWhere(
        (p) => p.origin >= target,
        orElse: () => paragraphs.last,
      );
      if (marks.isNotEmpty && para.startWord <= marks.last.wordIndex) continue;
      marks.add(
        ChapterMark(
          title: entry.title.isEmpty ? 'Chapter ${marks.length + 1}' : entry.title,
          wordIndex: para.startWord,
        ),
      );
    }
    // Like the Expo reader: fewer than two anchors is not real structure.
    return marks.length >= 2 ? marks : const [];
  }
}

/// Tokenizes a big book on a background isolate so the UI never stalls.
///
/// A top-level function on purpose: the closure sent to the isolate then
/// captures only [text] and [toc]. Created inside a controller method, it
/// could also capture the controller (timers, HTTP client…), which cannot be
/// sent to another isolate.
Future<ReaderDocument> readerDocumentInBackground(
  String text,
  List<TocEntry> toc,
) => Isolate.run(() => ReaderDocument.fromText(text, toc: toc));

final RegExp _endsWithLetterOrDigit = RegExp(r'[\p{L}\p{N}]$', unicode: true);

/// Adds a full stop to the last spoken word of a paragraph that has no
/// closing punctuation (headings, captions), so the engine pauses between
/// paragraphs instead of running "Introduction The measured…" together.
/// Only the SPOKEN text changes; word indexes stay the same.
String withSpokenPause(String word) =>
    _endsWithLetterOrDigit.hasMatch(word) ? '$word.' : word;

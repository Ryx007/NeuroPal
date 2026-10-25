// The reading text with the spoken word highlighted ("karaoke").
//
// Performance: each paragraph listens to the word cursor through
// `context.select`, which rebuilds it only when the highlighted word INSIDE
// it changes — so on every word, one paragraph rebuilds, not the book.
//
// Nothing in the text moves: the highlight only changes colours (no bold,
// no size change), so lines never re-wrap under the reader's eyes.

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:provider/provider.dart';

import '../theme/np_style.dart';
import 'reader_controller.dart';
import 'reader_document.dart';

/// Lets the reader screen find on-screen paragraphs (for auto-follow).
class ParagraphRegistry {
  final Map<int, KaraokeTarget> _targets = {};

  void attach(int index, KaraokeTarget target) => _targets[index] = target;

  void detach(int index, KaraokeTarget target) {
    if (identical(_targets[index], target)) _targets.remove(index);
  }

  KaraokeTarget? operator [](int index) => _targets[index];
}

/// What auto-follow needs from an on-screen paragraph.
abstract interface class KaraokeTarget {
  BuildContext get context;

  /// Global (screen) rectangle of the token at [localIndex], if laid out.
  Rect? tokenRect(int localIndex);
}

/// A prose paragraph: words as spans, the current one highlighted.
class KaraokeParagraph extends StatefulWidget {
  const KaraokeParagraph({
    super.key,
    required this.paragraph,
    required this.textStyle,
    required this.mathStyle,
    required this.registry,
    required this.onSeek,
  });

  final ReaderParagraph paragraph;
  final TextStyle textStyle;
  final TextStyle mathStyle;
  final ParagraphRegistry registry;

  /// Called with the GLOBAL word index the user tapped.
  final ValueChanged<int> onSeek;

  @override
  State<KaraokeParagraph> createState() => _KaraokeParagraphState();
}

class _KaraokeParagraphState extends State<KaraokeParagraph>
    implements KaraokeTarget {
  final GlobalKey _textKey = GlobalKey();

  /// Character offset where each token starts in the paragraph's text.
  List<int> _starts = const [];

  @override
  void initState() {
    super.initState();
    widget.registry.attach(widget.paragraph.index, this);
  }

  @override
  void didUpdateWidget(KaraokeParagraph old) {
    super.didUpdateWidget(old);
    if (old.paragraph.index != widget.paragraph.index ||
        old.registry != widget.registry) {
      old.registry.detach(old.paragraph.index, this);
      widget.registry.attach(widget.paragraph.index, this);
    }
  }

  @override
  void dispose() {
    widget.registry.detach(widget.paragraph.index, this);
    super.dispose();
  }

  RenderParagraph? get _render {
    final box = _textKey.currentContext?.findRenderObject();
    return box is RenderParagraph && box.attached && box.hasSize ? box : null;
  }

  @override
  Rect? tokenRect(int localIndex) {
    final box = _render;
    final tokens = widget.paragraph.tokens;
    if (box == null || localIndex < 0 || localIndex >= _starts.length) {
      return null;
    }
    final start = _starts[localIndex];
    final boxes = box.getBoxesForSelection(
      TextSelection(
        baseOffset: start,
        extentOffset: start + tokens[localIndex].display.length,
      ),
    );
    if (boxes.isEmpty) return null;
    var rect = boxes.first.toRect();
    for (final b in boxes.skip(1)) {
      rect = rect.expandToInclude(b.toRect());
    }
    return box.localToGlobal(rect.topLeft) & rect.size;
  }

  void _handleTap(TapUpDetails details) {
    final box = _render;
    if (box == null || _starts.isEmpty) return;
    final offset = box.getPositionForOffset(details.localPosition).offset;
    // The last token that starts at or before the tapped character.
    var token = 0;
    for (var i = 0; i < _starts.length; i++) {
      if (_starts[i] <= offset) token = i;
    }
    widget.onSeek(widget.paragraph.startWord + token);
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final p = widget.paragraph;
    // -1 when the voice is elsewhere, else the token index inside p.
    final current = context.select<WordCursor, int>(
      (c) => p.containsWord(c.index) ? c.index - p.startWord : -1,
    );

    final highlight = TextStyle(
      color: s.accentInk,
      backgroundColor: s.accentFill,
    );
    final spoken = TextStyle(color: s.textMuted);

    final spans = <InlineSpan>[];
    final starts = <int>[];
    var offset = 0;
    for (var i = 0; i < p.tokens.length; i++) {
      final token = p.tokens[i];
      starts.add(offset);
      TextStyle? style = token.isMath ? widget.mathStyle : null;
      if (i == current) {
        style = (style ?? const TextStyle()).merge(highlight);
      } else if (current >= 0 && i < current) {
        style = (style ?? const TextStyle()).merge(spoken);
      }
      spans.add(TextSpan(text: token.display, style: style));
      offset += token.display.length;
      // A space before the next word — unless it is glued to this one.
      if (i < p.tokens.length - 1 && !p.tokens[i + 1].glued) {
        spans.add(const TextSpan(text: ' '));
        offset += 1;
      }
    }
    _starts = starts;

    return Semantics(
      container: true,
      label: p.plainText,
      onTapHint: 'read aloud from here',
      onTap: () => widget.onSeek(p.startWord),
      excludeSemantics: true,
      child: GestureDetector(
        onTapUp: _handleTap,
        child: RichText(
          key: _textKey,
          textScaler: MediaQuery.textScalerOf(context),
          text: TextSpan(style: widget.textStyle, children: spans),
        ),
      ),
    );
  }
}

/// A paragraph that is one equation: a centred card, one karaoke unit,
/// spoken as "equation".
class EquationCard extends StatefulWidget {
  const EquationCard({
    super.key,
    required this.paragraph,
    required this.mathStyle,
    required this.registry,
    required this.onSeek,
  });

  final ReaderParagraph paragraph;
  final TextStyle mathStyle;
  final ParagraphRegistry registry;
  final ValueChanged<int> onSeek;

  @override
  State<EquationCard> createState() => _EquationCardState();
}

class _EquationCardState extends State<EquationCard> implements KaraokeTarget {
  @override
  void initState() {
    super.initState();
    widget.registry.attach(widget.paragraph.index, this);
  }

  @override
  void didUpdateWidget(EquationCard old) {
    super.didUpdateWidget(old);
    if (old.paragraph.index != widget.paragraph.index ||
        old.registry != widget.registry) {
      old.registry.detach(old.paragraph.index, this);
      widget.registry.attach(widget.paragraph.index, this);
    }
  }

  @override
  void dispose() {
    widget.registry.detach(widget.paragraph.index, this);
    super.dispose();
  }

  @override
  Rect? tokenRect(int localIndex) {
    final box = context.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize) return null;
    return box.localToGlobal(Offset.zero) & box.size;
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final p = widget.paragraph;
    final active = context.select<WordCursor, bool>(
      (c) => p.containsWord(c.index),
    );
    final display = p.tokens.first.display;
    return Semantics(
      container: true,
      label: 'Equation: $display',
      onTapHint: 'read aloud from here',
      onTap: () => widget.onSeek(p.startWord),
      excludeSemantics: true,
      child: GestureDetector(
        onTap: () => widget.onSeek(p.startWord),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: active ? s.accentFill : s.panelSolid,
            borderRadius: BorderRadius.circular(s.radiusMedium),
            border: Border.all(
              color: active ? s.accentFill : s.line,
              width: s.isSignal ? (s.borderWidth < 1 ? 1 : s.borderWidth) : 1,
            ),
          ),
          child: Text(
            display,
            textAlign: TextAlign.center,
            style: widget.mathStyle.copyWith(
              color: active ? s.accentInk : s.tertiary,
              fontSize: (widget.mathStyle.fontSize ?? 18) * 1.1,
            ),
          ),
        ),
      ),
    );
  }
}

// "Resume reading": the document read most recently, straight back to the
// reader. It comes from the library source (the server, or the demo
// library when that is on) and says so plainly while loading, when nothing
// was read yet, or when the library can't be reached. A port of the web
// app's ReadingTile.tsx.

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../data/models.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_pressable.dart';
import 'home_bits.dart';

enum ReadingStatus { loading, ready, error }

class ReadingTile extends StatelessWidget {
  const ReadingTile({
    super.key,
    required this.size,
    required this.status,
    required this.document,
    required this.onOpen,
    required this.onLibrary,
  });

  final String size;
  final ReadingStatus status;

  /// The document to resume (null: nothing read yet, or not loaded).
  final DocumentSummary? document;
  final ValueChanged<DocumentSummary> onOpen;
  final VoidCallback onLibrary;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final doc = document;
    if (doc == null) {
      final text = switch (status) {
        ReadingStatus.loading => 'Looking for where you left off…',
        ReadingStatus.error => 'Can’t load your library right now.',
        ReadingStatus.ready => 'Nothing open yet. Pick something from your library.',
      };
      return HomeTileFrame(
        children: [
          const TileHead('Resume reading'),
          const SizedBox(height: 8),
          Semantics(
            liveRegion: true,
            child: Text(text, style: s.fonts.body(15, s.textMuted)),
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: NpButton(
              label: 'Open the library',
              icon: Icons.library_books_outlined,
              kind: NpButtonKind.ghost,
              onPressed: onLibrary,
            ),
          ),
        ],
      );
    }

    final pct = doc.readingProgress.clamp(0.0, 1.0);
    final percent = (pct * 100).round();
    final pages = doc.pageCount;
    final where = pages != null && pages > 0
        ? 'p. ${math.max(1, (pct * pages).round())} / $pages'
        : '$percent%';

    if (size == 'S') {
      return OneLineTile(
        icon: Icons.menu_book_outlined,
        label: 'Resume',
        value: doc.title,
        semanticLabel: 'Resume reading ${doc.title}, $percent percent read',
        onTap: () => onOpen(doc),
      );
    }

    const segs = 12;
    final filled = (pct * segs).round();
    final badge = Container(
      width: 44,
      height: 52,
      decoration: BoxDecoration(
        color: s.isSignal ? s.accentFill : s.accentText.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(
          s.isSignal ? math.min(8, s.radiusControl) : 12,
        ),
        border: s.isSignal ? Border.all(color: s.shadow, width: 1.5) : null,
      ),
      child: Icon(
        Icons.menu_book_outlined,
        size: 22,
        color: s.isSignal ? s.accentInk : s.accentText,
      ),
    );
    final meter = s.isSignal
        ? Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var k = 0; k < segs; k++)
                Container(
                  width: 9,
                  height: 9,
                  margin: const EdgeInsets.only(right: 2),
                  decoration: BoxDecoration(
                    color: k < filled ? s.accentFill : Colors.transparent,
                    border: k < filled
                        ? null
                        : Border.all(color: s.textFaint, width: 1.2),
                  ),
                ),
            ],
          )
        : ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: SizedBox(
              width: 96,
              height: 6,
              child: LinearProgressIndicator(value: pct, minHeight: 6),
            ),
          );

    // Three lines of title are plenty at normal size; at large text the
    // whole title shows (an ellipsis with no line limit would cut it to one).
    final bigText = MediaQuery.textScalerOf(context).scale(10) > 13;

    return HomeTileFrame(
      children: [
        const TileHead('Resume reading'),
        const SizedBox(height: 8),
        NpPressable(
          onTap: () => onOpen(doc),
          semanticLabel: 'Resume reading ${doc.title}, $percent percent read',
          focusRadius: s.radiusMedium,
          builder: (context, pressed, focused) => Row(
            children: [
              badge,
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      doc.title,
                      maxLines: bigText ? null : 3,
                      overflow: bigText ? TextOverflow.visible : TextOverflow.ellipsis,
                      style: s.fonts.body(16, s.text, weight: FontWeight.w700),
                    ),
                    if (size == 'L' && (doc.subtitle ?? '').isNotEmpty)
                      Text(doc.subtitle!, style: s.fonts.body(13.5, s.textMuted)),
                    const SizedBox(height: 7),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        meter,
                        Text(where, style: s.fonts.mono(12.5, s.textMuted)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Icon(Icons.chevron_right_rounded, size: 24, color: s.text),
            ],
          ),
        ),
      ],
    );
  }
}

// "Next anchor": the next timed point in the day, counting down calmly
// (minutes, not seconds), with its window. Signal shows the S-Today
// countdown and a ±2 h ruler; Classic keeps the original card. Done marks
// it for today; Edit and All anchors open the anchors sheet. A port of the
// web app's AnchorTile.tsx.

import 'package:flutter/material.dart';

import '../day/day_models.dart';
import '../day/day_rules.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import 'home_bits.dart';

class AnchorTile extends StatelessWidget {
  const AnchorTile({
    super.key,
    required this.size,
    required this.anchor,
    required this.count,
    required this.now,
    required this.onAdd,
    required this.onEdit,
    required this.onAll,
    required this.onDone,
  });

  final String size;

  /// The next anchor, or null (none set, or all done today).
  final DayAnchor? anchor;

  /// How many anchors are set.
  final int count;
  final DateTime now;
  final VoidCallback onAdd;
  final ValueChanged<DayAnchor> onEdit;
  final VoidCallback onAll;
  final ValueChanged<DayAnchor> onDone;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final a = anchor;
    if (a == null) {
      return HomeTileFrame(
        children: [
          const TileHead('Next anchor'),
          const SizedBox(height: 10),
          Text(
            count > 0 ? 'Nothing else today' : 'Nothing set yet',
            style: s.fonts.body(17, s.text, weight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            count > 0
                ? 'Every anchor for today is done.'
                : 'Meds, a break, a study block…',
            style: s.fonts.body(15, s.textMuted),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              NpButton(label: 'Add anchor', icon: Icons.add_rounded, onPressed: onAdd),
              if (count > 0)
                NpButton(
                  label: 'All anchors',
                  kind: NpButtonKind.ghost,
                  onPressed: onAll,
                ),
            ],
          ),
        ],
      );
    }

    final clock = anchorClock(a, signal: s.isSignal);
    final mins = minutesUntil(a, now);
    final cd = countdown(mins);
    final window = windowLabel(a.flex);

    if (size == 'S') {
      return OneLineTile(
        icon: categoryIcon(a.kind),
        label: 'Next',
        value: '${a.title} · $clock',
        semanticLabel: 'Next anchor: ${a.title} at $clock, ${cd.words}. Edit',
        onTap: () => onEdit(a),
      );
    }

    final Widget when;
    if (s.isSignal) {
      when = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(cd.big, style: s.fonts.display(size == 'L' ? 52 : 44, s.text)),
                if (cd.unit.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  Text(cd.unit, style: s.fonts.label(s.textMuted, size: 12)),
                ],
              ],
            ),
          ),
          const SizedBox(height: 4),
          Text(
            a.title,
            semanticsLabel: '${a.title}, ${cd.words}, at $clock, window $window',
            style: s.fonts.body(17, s.text, weight: FontWeight.w700),
          ),
          const SizedBox(height: 3),
          ExcludeSemantics(
            child: Text(
              '$clock · window $window',
              style: s.fonts.mono(13, s.textMuted),
            ),
          ),
          const SizedBox(height: 10),
          _Ruler(mins: mins, flex: a.flex),
        ],
      );
    } else {
      final words = cd.words[0].toUpperCase() + cd.words.substring(1);
      when = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${a.title} at $clock', style: s.fonts.display(20, s.text)),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(Icons.schedule_rounded, size: 16, color: s.textMuted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '$words · window $window',
                  style: s.fonts.body(14, s.textMuted),
                ),
              ),
            ],
          ),
        ],
      );
    }

    return HomeTileFrame(
      children: [
        TileHead(
          'Next anchor',
          trailing: [
            ExcludeSemantics(
              child: Icon(categoryIcon(a.kind), size: 20, color: s.accentText),
            ),
          ],
        ),
        const SizedBox(height: 8),
        when,
        if (a.subtitle.isNotEmpty && size == 'L') ...[
          const SizedBox(height: 8),
          Text(a.subtitle, style: s.fonts.body(15, s.textMuted)),
        ],
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            NpButton(
              label: 'Done',
              icon: Icons.check_rounded,
              kind: NpButtonKind.ghost,
              semanticLabel: 'Done with ${a.title}',
              onPressed: () => onDone(a),
            ),
            NpButton(
              label: 'Edit',
              icon: Icons.edit_outlined,
              kind: NpButtonKind.ghost,
              semanticLabel: 'Edit ${a.title}',
              onPressed: () => onEdit(a),
            ),
            NpButton(
              label: 'All anchors · $count',
              kind: NpButtonKind.ghost,
              semanticLabel: 'All anchors, $count set',
              onPressed: onAll,
            ),
          ],
        ),
      ],
    );
  }
}

/// ±2 h around the anchor: the window drawn in the accent, the "now" mark
/// at the exact minute. Decorative: the words above say it all.
class _Ruler extends StatelessWidget {
  const _Ruler({required this.mins, required this.flex});

  final int mins;
  final int flex;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return ExcludeSemantics(
      child: SizedBox(
        height: 18,
        width: double.infinity,
        child: CustomPaint(painter: _RulerPainter(style: s, mins: mins, flex: flex)),
      ),
    );
  }
}

class _RulerPainter extends CustomPainter {
  _RulerPainter({required this.style, required this.mins, required this.flex});

  final NpStyle style;
  final int mins;
  final int flex;

  @override
  void paint(Canvas canvas, Size size) {
    const n = 25;
    const span = 120;
    final step = (size.width - 3) / (n - 1);
    for (var i = 0; i < n; i++) {
      final offset = (i - (n - 1) / 2) * ((2 * span) / (n - 1));
      final inWindow = offset.abs() <= flex;
      final w = inWindow ? 3.0 : 1.5;
      final h = inWindow ? 11.0 : 7.0;
      canvas.drawRect(
        Rect.fromLTWH(i * step + (3 - w) / 2, size.height - h, w, h),
        Paint()..color = inWindow ? style.accentFill : style.textFaint,
      );
    }
    final frac = (span - mins) / (2 * span);
    if (frac >= 0 && frac <= 1) {
      canvas.drawRect(
        Rect.fromLTWH(frac * (size.width - 2.5), 0, 2.5, size.height),
        Paint()..color = style.text,
      );
    }
  }

  @override
  bool shouldRepaint(_RulerPainter old) =>
      old.mins != mins || old.flex != flex || old.style != style;
}

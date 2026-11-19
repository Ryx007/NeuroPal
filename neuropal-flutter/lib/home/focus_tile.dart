// "Focus": the focus block on this phone is Pal's "Sit with me" (body
// doubling). The tile shows a running sit calmly (minutes, not seconds) and
// opens it; with none running it offers one. A port of the web app's
// FocusTile.tsx; Signal adds its still oscilloscope trace (decorative).

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../pal/pal_logic.dart';
import '../pal/pal_models.dart';
import '../theme/np_style.dart';
import '../widgets/np_pressable.dart';
import '../widgets/np_text.dart';
import 'home_bits.dart';

class FocusTile extends StatelessWidget {
  const FocusTile({
    super.key,
    required this.size,
    required this.sit,
    required this.now,
    required this.palName,
    required this.onOpen,
  });

  final String size;
  final PalSit? sit;

  /// Epoch milliseconds, by the app's clock.
  final int now;
  final String palName;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final running = sit != null && !sit!.ended;
    final ended = sit?.ended ?? false;
    final title = running ? 'Sitting with you' : (ended ? 'Done' : 'Ready');
    final sub = running
        ? leftLabel(sit!.endsAt, now)
        : (ended ? 'Want to note what you did?' : 'Sit with $palName: 10, 25 or 45 min');
    final detail = running && sit!.label.isNotEmpty ? '$sub · ${sit!.label}' : sub;

    if (size == 'S') {
      return OneLineTile(
        icon: Icons.self_improvement_rounded,
        label: 'Focus',
        value: '$title · $sub',
        semanticLabel: 'Focus: $title, $sub. Open Sit with me',
        onTap: onOpen,
      );
    }

    return HomeTileFrame(
      children: [
        TileHead('Focus', trailing: [Led(on: running)]),
        if (s.isSignal) ...[
          const SizedBox(height: 10),
          const ExcludeSemantics(
            child: SizedBox(height: 56, width: double.infinity, child: _Scope()),
          ),
        ],
        const SizedBox(height: 10),
        NpPressable(
          onTap: onOpen,
          semanticLabel: 'Focus: $title, $detail. Open Sit with me',
          focusRadius: s.radiusMedium,
          builder: (context, pressed, focused) => Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: s.fonts.body(17, s.text, weight: FontWeight.w700)),
                    const SizedBox(height: 3),
                    Text(detail, style: s.fonts.mono(13, s.textMuted)),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  shape: s.isSignal ? BoxShape.rectangle : BoxShape.circle,
                  color: s.isSignal ? s.accentFill : s.accentText.withValues(alpha: 0.14),
                  border: s.isSignal ? Border.all(color: s.shadow, width: 1.5) : null,
                ),
                child: Icon(
                  Icons.self_improvement_rounded,
                  size: 22,
                  color: s.isSignal ? s.accentInk : s.accentText,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The S-Today scope: a still Lissajous trace over a faint grid.
class _Scope extends StatelessWidget {
  const _Scope();

  @override
  Widget build(BuildContext context) => CustomPaint(painter: _ScopePainter(NpStyle.of(context)));
}

class _ScopePainter extends CustomPainter {
  _ScopePainter(this.style);

  final NpStyle style;

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..color = style.textFaint.withValues(alpha: 0.45)
      ..strokeWidth = 1;
    for (final f in const [0.25, 0.5, 0.75]) {
      canvas
        ..drawLine(Offset(0, size.height * f), Offset(size.width, size.height * f), grid)
        ..drawLine(Offset(size.width * f, 0), Offset(size.width * f, size.height), grid);
    }
    final trace = Path();
    for (var k = 0; k <= 120; k++) {
      final t = k / 120 * math.pi * 2;
      final x = size.width * (0.5 + 0.44 * math.sin(3 * t + 0.6));
      final y = size.height * (0.5 + 0.39 * math.sin(2 * t));
      k == 0 ? trace.moveTo(x, y) : trace.lineTo(x, y);
    }
    canvas.drawPath(
      trace,
      Paint()
        ..color = style.accentFill
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(_ScopePainter old) => old.style != style;
}

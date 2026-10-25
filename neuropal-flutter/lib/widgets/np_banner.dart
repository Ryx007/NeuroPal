// Warnings that must be seen: backend offline, load failures, ingest
// failures, speech errors.
//
// Red is Signal's brand colour, not an alarm, so warnings never rely on a
// colour alone: Signal shows hazard stripes + words, Classic an icon +
// words (design rule "no colour-only meaning").

import 'package:flutter/material.dart';

import '../theme/np_style.dart';
import 'np_panel.dart';

class NpBanner extends StatelessWidget {
  const NpBanner({
    super.key,
    required this.title,
    this.message,
    this.actions = const [],
    this.icon = Icons.warning_amber_rounded,
  });

  final String title;
  final String? message;
  final List<Widget> actions;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final text = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(title, style: s.fonts.body(15.5, s.text, weight: FontWeight.w700)),
        if (message != null) ...[
          const SizedBox(height: 4),
          Text(message!, style: s.fonts.body(14, s.textMuted)),
        ],
        if (actions.isNotEmpty) ...[
          const SizedBox(height: 12),
          Wrap(spacing: 10, runSpacing: 10, children: actions),
        ],
      ],
    );

    return Semantics(
      liveRegion: true,
      container: true,
      child: NpPanel(
        padding: EdgeInsets.zero,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (s.isSignal)
                SizedBox(
                  width: 22,
                  child: ClipRRect(
                    borderRadius: BorderRadius.horizontal(
                      left: Radius.circular(s.radius),
                    ),
                    child: CustomPaint(
                      painter: HazardStripesPainter(
                        stripe: s.warn,
                        gap: s.surface,
                      ),
                    ),
                  ),
                )
              else
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 14, 0, 14),
                  child: Icon(icon, color: s.warn, size: 24),
                ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: text,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Diagonal hazard stripes (-45°), as in the design system's alarm style.
class HazardStripesPainter extends CustomPainter {
  const HazardStripesPainter({required this.stripe, required this.gap});

  final Color stripe;
  final Color gap;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = gap);
    final paint = Paint()..color = stripe;
    const band = 7.0;
    for (var start = -size.height; start < size.width + size.height; start += band * 2) {
      final path = Path()
        ..moveTo(start, size.height)
        ..lineTo(start + band, size.height)
        ..lineTo(start + band + size.height, 0)
        ..lineTo(start + size.height, 0)
        ..close();
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(HazardStripesPainter old) =>
      old.stripe != stripe || old.gap != gap;
}

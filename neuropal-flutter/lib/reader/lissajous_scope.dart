// Signal's little oscilloscope: a Lissajous figure for the chosen tone
// (Soft 1:1, Natural 3:2, Deep 5:4) with a bright trace running along it
// while the voice plays. Pure decoration in the frame — hidden from screen
// readers, and frozen when motion is Still or reduce-motion is on.

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/color_math.dart';
import '../theme/css_color.dart';
import '../theme/np_style.dart';

class LissajousScope extends StatefulWidget {
  const LissajousScope({
    super.key,
    required this.tone,
    required this.playing,
    this.width = 64,
    this.height = 44,
  });

  final String tone;
  final bool playing;
  final double width;
  final double height;

  @override
  State<LissajousScope> createState() => _LissajousScopeState();
}

class _LissajousScopeState extends State<LissajousScope>
    with SingleTickerProviderStateMixin {
  late final AnimationController _trace = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  );

  void _sync() {
    final s = NpStyle.of(context);
    final speed = s.motionSpeed;
    if (!widget.playing || speed <= 0) {
      _trace.stop();
      return;
    }
    _trace.duration = Duration(milliseconds: (2200 / speed).round());
    if (!_trace.isAnimating) _trace.repeat();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(LissajousScope old) {
    super.didUpdateWidget(old);
    _sync();
  }

  @override
  void dispose() {
    _trace.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    // The "screen" is always dark (the shadow token), so the trace uses
    // the accent auto-fitted to read on it.
    final screen = s.shadow;
    final trace = parseCssColor(
      rgbToHex(
        fitContrast(
          hexToRgb(s.palette.accentFill)!,
          hexToRgb(s.palette.shadowColor)!,
          3,
        ),
      ),
    );
    return ExcludeSemantics(
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: screen,
          borderRadius: BorderRadius.circular(s.radiusMedium * 0.6),
          border: Border.all(color: s.line, width: 1.5),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(s.radiusMedium * 0.6),
          child: AnimatedBuilder(
            animation: _trace,
            builder: (context, _) => CustomPaint(
              painter: _ScopePainter(
                tone: widget.tone,
                color: trace,
                phase: _trace.value,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ScopePainter extends CustomPainter {
  _ScopePainter({required this.tone, required this.color, required this.phase});

  final String tone;
  final Color color;

  /// 0–1: where the bright trace segment starts along the curve.
  final double phase;

  static List<double> _ratio(String tone) => switch (tone) {
    'Soft' => [1, 1, math.pi / 2.4],
    'Deep' => [5, 4, math.pi / 3],
    _ => [3, 2, math.pi / 4],
  };

  @override
  void paint(Canvas canvas, Size size) {
    final cfg = _ratio(tone);
    final grid = Paint()
      ..color = color.withValues(alpha: 0.16)
      ..strokeWidth = 1;
    canvas.drawLine(
      Offset(size.width / 2, 0),
      Offset(size.width / 2, size.height),
      grid,
    );
    canvas.drawLine(
      Offset(0, size.height / 2),
      Offset(size.width, size.height / 2),
      grid,
    );

    final path = Path();
    const steps = 160;
    for (var i = 0; i <= steps; i++) {
      final a = i / steps * 2 * math.pi;
      final x = size.width / 2 + (size.width / 2 - 6) * math.sin(cfg[0] * a + cfg[2]);
      final y = size.height / 2 + (size.height / 2 - 5) * math.sin(cfg[1] * a);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color.withValues(alpha: 0.3)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );

    // The bright 22% segment, like the mockup's stroke-dasharray.
    final metric = path.computeMetrics().first;
    final start = metric.length * phase;
    final end = start + metric.length * 0.22;
    final bright = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(metric.extractPath(start, math.min(end, metric.length)), bright);
    if (end > metric.length) {
      canvas.drawPath(metric.extractPath(0, end - metric.length), bright);
    }
  }

  @override
  bool shouldRepaint(_ScopePainter old) =>
      old.tone != tone || old.color != color || old.phase != phase;
}

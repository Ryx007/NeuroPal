// The screen background ("the frame"): surface colour, Signal's faint
// engineering grid and texture, Classic's soft accent glow.
//
// Everything here is static and sits BEHIND content; reading text is never
// textured or animated. The animated Chladni / interference fields are M2
// (fragment shaders).

import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../theme/np_style.dart';

class NpBackground extends StatelessWidget {
  const NpBackground({super.key});

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return ExcludeSemantics(
      child: Stack(
        fit: StackFit.expand,
        children: [
          ColoredBox(color: s.surface),
          if (!s.isSignal)
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(1.1, -1.05),
                  radius: 1.15,
                  colors: [s.accentGlow, s.accentGlow.withValues(alpha: 0)],
                ),
              ),
            ),
          if (s.isSignal && s.grid.a > 0)
            RepaintBoundary(
              child: CustomPaint(painter: GridPainter(color: s.grid)),
            ),
          if (s.texture == 'Grain')
            RepaintBoundary(
              child: CustomPaint(
                painter: GrainPainter(
                  light: s.text.withValues(alpha: s.dark ? 0.07 : 0.05),
                  dark: s.shadow.withValues(alpha: s.dark ? 0.10 : 0.07),
                ),
              ),
            ),
          if (s.texture == 'Scanlines')
            RepaintBoundary(
              child: CustomPaint(
                painter: ScanlinePainter(color: s.shadow.withValues(alpha: 0.17)),
              ),
            ),
        ],
      ),
    );
  }
}

/// 1 px lines every [spacing] px, like engineering paper.
class GridPainter extends CustomPainter {
  const GridPainter({required this.color, this.spacing = 23});

  final Color color;
  final double spacing;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    for (var x = 0.5; x < size.width; x += spacing) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (var y = 0.5; y < size.height; y += spacing) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(GridPainter old) =>
      old.color != color || old.spacing != spacing;
}

/// Static film grain: seeded random specks (same pattern every frame).
class GrainPainter extends CustomPainter {
  const GrainPainter({required this.light, required this.dark});

  final Color light;
  final Color dark;

  @override
  void paint(Canvas canvas, Size size) {
    final random = math.Random(7);
    final count = (size.width * size.height / 14).round();
    Float32List points(int n) {
      final list = Float32List(n * 2);
      for (var i = 0; i < n; i++) {
        list[i * 2] = random.nextDouble() * size.width;
        list[i * 2 + 1] = random.nextDouble() * size.height;
      }
      return list;
    }

    final paint = Paint()..strokeWidth = 1.2;
    canvas.drawRawPoints(
      ui.PointMode.points,
      points(count ~/ 2),
      paint..color = light,
    );
    canvas.drawRawPoints(
      ui.PointMode.points,
      points(count ~/ 2),
      paint..color = dark,
    );
  }

  @override
  bool shouldRepaint(GrainPainter old) =>
      old.light != light || old.dark != dark;
}

/// Horizontal CRT scanlines every 3 px.
class ScanlinePainter extends CustomPainter {
  const ScanlinePainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    for (var y = 0.5; y < size.height; y += 3) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(ScanlinePainter old) => old.color != color;
}

// Pal's face: the user's own companion, drawn from the appearance's Pal
// (shape, colour, eyes, mouth, extra). A port of the Expo app's
// components/pal/Pal.jsx and the web app's PalAvatar.tsx with the same
// geometry: a 168 × 148 body in a padded 260 × 240 box, so the antenna and
// the headphones can stick out.
//
// It breathes and blinks only when motion is allowed (not "Still", no OS
// reduce-motion) and never while overwhelmed: quieter, not alarming.
// Without a [semanticLabel] it is decorative (the text next to it speaks).

import 'dart:async';

import 'package:flutter/material.dart';

import '../theme/css_color.dart';
import '../theme/np_style.dart';
import '../theme/pal.dart';
import '../theme/tokens.g.dart';

/// Pal mirrors the check-in: okay, a bit off (a narrower visor), over
/// (narrow and dim, and still).
enum PalMood { okay, off, over }

class PalAvatar extends StatefulWidget {
  const PalAvatar({
    super.key,
    required this.pal,
    this.size = 120,
    this.mood = PalMood.okay,
    this.semanticLabel,
  });

  final PalSettings pal;

  /// Width in logical pixels (the height follows the 260 × 240 box).
  final double size;
  final PalMood mood;

  /// A spoken label ("Your Pal, …"). Null = decorative.
  final String? semanticLabel;

  /// "Your Pal, Pal: pebble shape, chalk body, …"
  static String describe(PalSettings pal) => 'Your Pal, ${palDescription(pal)}';

  @override
  State<PalAvatar> createState() => _PalAvatarState();
}

class _PalAvatarState extends State<PalAvatar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _breath = AnimationController(vsync: this);
  Timer? _blinkTimer;
  Timer? _blinkEnd;
  bool _blink = false;

  bool _lively(NpStyle s) => !s.still && widget.mood != PalMood.over;

  void _sync() {
    final s = NpStyle.of(context);
    if (_lively(s)) {
      final period = Duration(
        milliseconds: s.palette.motion.level == 'Calm' ? 3500 : 2250,
      );
      if (!_breath.isAnimating || _breath.duration != period) {
        _breath
          ..duration = period
          ..repeat(reverse: true);
      }
      _blinkTimer ??= Timer.periodic(const Duration(milliseconds: 5200), (_) {
        if (!mounted) return;
        setState(() => _blink = true);
        _blinkEnd?.cancel();
        _blinkEnd = Timer(const Duration(milliseconds: 140), () {
          if (mounted) setState(() => _blink = false);
        });
      });
    } else {
      _breath
        ..stop()
        ..value = 0;
      _blinkTimer?.cancel();
      _blinkTimer = null;
      _blinkEnd?.cancel();
      _blink = false;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync(); // the look (motion) may have changed
  }

  @override
  void didUpdateWidget(PalAvatar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.mood != widget.mood) _sync();
  }

  @override
  void dispose() {
    _breath.dispose();
    _blinkTimer?.cancel();
    _blinkEnd?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final size = widget.size;
    final height = size * 240 / 260;
    final painter = _PalPainter(
      pal: widget.pal,
      mood: widget.mood,
      blink: _blink,
      signal: s.isSignal,
      accentHex: s.isSignal ? s.palette.accentFill : s.palette.accent,
      stroke: s.isSignal ? s.shadow : parseCssColor(s.palette.outlineVariant),
      shadow: s.isSignal ? (s.shadowOffset < 3 ? 3 : s.shadowOffset) : 0,
    );
    Widget face = AnimatedBuilder(
      animation: _breath,
      builder: (context, child) {
        final b = Curves.easeInOut.transform(_breath.value);
        return Transform.translate(
          offset: Offset(0, -2 * b),
          child: Transform.scale(scale: 1 + 0.03 * b, child: child),
        );
      },
      child: CustomPaint(size: Size(size, height), painter: painter),
    );
    face = SizedBox(width: size, height: height, child: face);
    final label = widget.semanticLabel;
    return label == null
        ? ExcludeSemantics(child: face)
        : Semantics(image: true, label: label, child: ExcludeSemantics(child: face));
  }
}

// The reference SVG's own few fixed colours (eye whites, pupils, goggle
// glass, the visor's glint); everything else comes from the Pal tokens and
// the palette.
final Color _white = parseCssColor('#FFFFFF');
final Color _pupil = parseCssColor('#141416');
final Color _glass = parseCssColor('rgba(190,235,255,0.6)');
final Color _glint = parseCssColor('rgba(255,255,255,0.85)');

class _PalPainter extends CustomPainter {
  _PalPainter({
    required this.pal,
    required this.mood,
    required this.blink,
    required this.signal,
    required this.accentHex,
    required this.stroke,
    required this.shadow,
  });

  final PalSettings pal;
  final PalMood mood;
  final bool blink;
  final bool signal;
  final String accentHex;
  final Color stroke;
  final double shadow;

  Path _body(double dx, double dy) {
    switch (pal.shape) {
      case 'Box':
        return Path()
          ..addRRect(
            RRect.fromRectAndRadius(
              Rect.fromLTWH(dx, dy, 168, 148),
              const Radius.circular(27),
            ),
          );
      case 'Moon':
        return Path()
          ..addOval(
            Rect.fromCenter(center: Offset(84 + dx, 74 + dy), width: 168, height: 148),
          );
      case 'Bean':
        return (Path()
              ..moveTo(66, 3)
              ..cubicTo(116, -6, 167, 25, 165, 78)
              ..cubicTo(163, 127, 124, 150, 76, 146)
              ..cubicTo(29, 142, 1, 113, 3, 70)
              ..cubicTo(5, 30, 28, 9, 66, 3)
              ..close())
            .shift(Offset(dx, dy));
      default: // Pebble
        return (Path()
              ..moveTo(84, 0)
              ..cubicTo(131, 0, 168, 32, 168, 78)
              ..cubicTo(168, 121, 131, 148, 84, 148)
              ..cubicTo(37, 148, 0, 121, 0, 78)
              ..cubicTo(0, 32, 37, 0, 84, 0)
              ..close())
            .shift(Offset(dx, dy));
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    final bodyHex = kPalColours[pal.colour] ?? kPalColours['Chalk']!;
    final body = parseCssColor(bodyHex);
    final ink = parseCssColor(palFaceInk(bodyHex));
    final accent = parseCssColor(accentHex);
    final visorHex = palVisor(bodyHex, accentHex);
    final visor = parseCssColor(visorHex);
    final glint = visorHex == accentHex ? _glint : body;

    final k = size.width / 260;
    canvas
      ..save()
      ..scale(k)
      ..translate(46, 50);

    Paint fill(Color c) => Paint()..color = c;
    Paint line(Color c, double w) => Paint()
      ..color = c
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..strokeCap = StrokeCap.round;
    void rrect(Rect r, double radius, Color f, {double outline = 3}) {
      final shape = RRect.fromRectAndRadius(r, Radius.circular(radius));
      canvas
        ..drawRRect(shape, fill(f))
        ..drawRRect(shape, line(stroke, outline));
    }

    if (pal.extra == 'Antenna') {
      canvas
        ..drawLine(const Offset(84, 2), const Offset(84, -28), line(stroke, 4))
        ..drawCircle(const Offset(84, -37), 9, fill(accent))
        ..drawCircle(const Offset(84, -37), 9, line(stroke, 3));
    }
    if (shadow > 0) canvas.drawPath(_body(shadow, shadow), fill(stroke));
    final shape = _body(0, 0);
    canvas
      ..drawPath(shape, fill(body))
      ..drawPath(shape, line(stroke, 3));

    if (pal.extra == 'Headphones') {
      canvas.drawPath(
        Path()
          ..moveTo(-6, 74)
          ..cubicTo(-10, -26, 178, -26, 174, 74),
        line(stroke, 9),
      );
      rrect(const Rect.fromLTWH(-22, 54, 26, 46), 11, accent);
      rrect(const Rect.fromLTWH(164, 54, 26, 46), 11, accent);
    }
    if (pal.extra == 'Lab goggles') {
      canvas
        ..drawLine(const Offset(0, 22), const Offset(168, 22), line(stroke, 7)..strokeCap = StrokeCap.butt)
        ..drawCircle(const Offset(60, 22), 17, fill(_glass))
        ..drawCircle(const Offset(60, 22), 17, line(stroke, 4))
        ..drawCircle(const Offset(108, 22), 17, fill(_glass))
        ..drawCircle(const Offset(108, 22), 17, line(stroke, 4));
    }

    // Eyes: a narrower, dimmer visor when off or overwhelmed.
    final inset = switch (mood) {
      PalMood.over => 13.0,
      PalMood.off => 8.0,
      PalMood.okay => 0.0,
    };
    final opacity = switch (mood) {
      PalMood.over => 0.45,
      PalMood.off => 0.85,
      PalMood.okay => 1.0,
    };
    canvas.saveLayer(
      const Rect.fromLTWH(-46, -50, 260, 240),
      Paint()..color = Color.fromRGBO(0, 0, 0, opacity),
    );
    switch (pal.eyes) {
      case 'Visor':
        rrect(
          Rect.fromLTWH(24 + inset, blink ? 58 : 44, 120 - 2 * inset, blink ? 4 : 32),
          blink ? 2 : 16,
          visor,
        );
        if (!blink) {
          canvas
            ..drawRRect(
              RRect.fromRectAndRadius(
                Rect.fromLTWH(46 + inset / 2, 53, 16, 12),
                const Radius.circular(5),
              ),
              fill(glint),
            )
            ..drawRRect(
              RRect.fromRectAndRadius(
                Rect.fromLTWH(106 - inset / 2, 53, 16, 12),
                const Radius.circular(5),
              ),
              fill(glint),
            );
        }
      case 'Dots':
        if (blink) {
          canvas
            ..drawLine(const Offset(50, 62), const Offset(70, 62), line(ink, 5))
            ..drawLine(const Offset(98, 62), const Offset(118, 62), line(ink, 5));
        } else {
          canvas
            ..drawCircle(const Offset(60, 62), 11, fill(ink))
            ..drawCircle(const Offset(108, 62), 11, fill(ink))
            ..drawCircle(const Offset(64, 58), 3.5, fill(body))
            ..drawCircle(const Offset(112, 58), 3.5, fill(body));
        }
      case 'Sleepy':
        canvas.drawPath(
          Path()
            ..moveTo(46, 60)
            ..relativeQuadraticBezierTo(14, 12, 28, 0)
            ..moveTo(94, 60)
            ..relativeQuadraticBezierTo(14, 12, 28, 0),
          line(ink, 5),
        );
      case 'Wide':
        if (blink) {
          canvas
            ..drawLine(const Offset(42, 62), const Offset(74, 62), line(ink, 5))
            ..drawLine(const Offset(94, 62), const Offset(126, 62), line(ink, 5));
        } else {
          canvas
            ..drawCircle(const Offset(58, 60), 18, fill(_white))
            ..drawCircle(const Offset(58, 60), 18, line(stroke, 3))
            ..drawCircle(const Offset(110, 60), 18, fill(_white))
            ..drawCircle(const Offset(110, 60), 18, line(stroke, 3))
            ..drawCircle(const Offset(62, 64), 8, fill(_pupil))
            ..drawCircle(const Offset(114, 64), 8, fill(_pupil));
        }
    }
    canvas.restore(); // the eyes' layer

    switch (pal.mouth) {
      case 'Oh':
        canvas.drawOval(
          Rect.fromCenter(center: const Offset(84, 104), width: 16, height: 18),
          fill(ink),
        );
      case 'Smile':
        canvas.drawPath(
          Path()
            ..moveTo(66, 98)
            ..relativeQuadraticBezierTo(18, 16, 36, 0),
          line(ink, 5),
        );
      case 'Flat':
        canvas.drawLine(const Offset(70, 104), const Offset(98, 104), line(ink, 5));
    }

    if (pal.extra == 'Scarf') {
      rrect(const Rect.fromLTWH(10, 114, 148, 22), 11, accent);
      canvas
        ..save()
        ..translate(126, 145)
        ..rotate(-10 * 3.141592653589793 / 180)
        ..translate(-126, -145);
      rrect(const Rect.fromLTWH(116, 122, 20, 46), 6, accent);
      canvas.restore();
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_PalPainter old) =>
      old.pal.toJson().toString() != pal.toJson().toString() ||
      old.mood != mood ||
      old.blink != blink ||
      old.signal != signal ||
      old.accentHex != accentHex ||
      old.stroke != stroke ||
      old.shadow != shadow;
}

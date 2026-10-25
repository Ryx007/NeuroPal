// A slider drawn in the skin's language:
//   scrubber — the reading-position bar (chapter marks, progress fill),
//   fader    — Signal's reading-speed control (big rectangular cap).
//
// Accessible: announced as a slider with its value; TalkBack/VoiceOver
// swipe up/down (and keyboard arrows) step it; drag or tap to set it.

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/np_style.dart';

enum NpSliderKind { scrubber, fader }

class NpSlider extends StatefulWidget {
  const NpSlider({
    super.key,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    required this.semanticLabel,
    required this.semanticValue,
    this.onChangeEnd,
    this.step,
    this.ticks = const [],
    this.kind = NpSliderKind.scrubber,
  });

  final double value;
  final double min;
  final double max;

  /// Called continuously while dragging.
  final ValueChanged<double> onChanged;

  /// Called once when the user lets go (or taps / steps).
  final ValueChanged<double>? onChangeEnd;

  /// Snap/step size; defaults to 1/20 of the range for accessibility steps.
  final double? step;

  /// Marks along the track, as fractions 0–1 (chapter starts).
  final List<double> ticks;
  final String semanticLabel;
  final String Function(double value) semanticValue;
  final NpSliderKind kind;

  @override
  State<NpSlider> createState() => _NpSliderState();
}

class _NpSliderState extends State<NpSlider> {
  bool _active = false;
  bool _focused = false;

  double get _step => widget.step ?? (widget.max - widget.min) / 20;

  double _clamp(double v) => v.clamp(widget.min, widget.max).toDouble();

  double _snap(double v) {
    final step = widget.step;
    if (step == null || step <= 0) return _clamp(v);
    return _clamp(widget.min + ((v - widget.min) / step).round() * step);
  }

  double _fraction() {
    final span = widget.max - widget.min;
    if (span <= 0) return 0;
    return ((widget.value - widget.min) / span).clamp(0.0, 1.0).toDouble();
  }

  double _pad(NpStyle s) => !s.isSignal
      ? 13
      : (widget.kind == NpSliderKind.fader ? 12 : 8);

  double _valueAt(double dx, double width, NpStyle s) {
    final pad = _pad(s);
    final usable = math.max(1.0, width - 2 * pad);
    final f = ((dx - pad) / usable).clamp(0.0, 1.0);
    return _snap(widget.min + f * (widget.max - widget.min));
  }

  void _nudge(int direction) {
    final v = _snap(widget.value + direction * _step);
    widget.onChanged(v);
    widget.onChangeEnd?.call(v);
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final height = widget.kind == NpSliderKind.fader ? 48.0 : 44.0;

    return Semantics(
      slider: true,
      label: widget.semanticLabel,
      value: widget.semanticValue(widget.value),
      increasedValue: widget.semanticValue(_clamp(widget.value + _step)),
      decreasedValue: widget.semanticValue(_clamp(widget.value - _step)),
      onIncrease: () => _nudge(1),
      onDecrease: () => _nudge(-1),
      child: Focus(
        onFocusChange: (f) => setState(() => _focused = f),
        onKeyEvent: (node, event) {
          if (event is! KeyDownEvent && event is! KeyRepeatEvent) {
            return KeyEventResult.ignored;
          }
          final key = event.logicalKey;
          if (key == LogicalKeyboardKey.arrowRight ||
              key == LogicalKeyboardKey.arrowUp) {
            _nudge(1);
            return KeyEventResult.handled;
          }
          if (key == LogicalKeyboardKey.arrowLeft ||
              key == LogicalKeyboardKey.arrowDown) {
            _nudge(-1);
            return KeyEventResult.handled;
          }
          return KeyEventResult.ignored;
        },
        child: LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth;
            return GestureDetector(
              behavior: HitTestBehavior.opaque,
              excludeFromSemantics: true,
              onHorizontalDragStart: (d) {
                setState(() => _active = true);
                widget.onChanged(_valueAt(d.localPosition.dx, width, s));
              },
              onHorizontalDragUpdate: (d) =>
                  widget.onChanged(_valueAt(d.localPosition.dx, width, s)),
              onHorizontalDragEnd: (_) {
                setState(() => _active = false);
                widget.onChangeEnd?.call(widget.value);
              },
              onHorizontalDragCancel: () => setState(() => _active = false),
              onTapUp: (d) {
                final v = _valueAt(d.localPosition.dx, width, s);
                widget.onChanged(v);
                widget.onChangeEnd?.call(v);
              },
              child: CustomPaint(
                size: Size(width, height),
                painter: _SliderPainter(
                  style: s,
                  kind: widget.kind,
                  fraction: _fraction(),
                  ticks: widget.ticks,
                  active: _active || _focused,
                  pad: _pad(s),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _SliderPainter extends CustomPainter {
  _SliderPainter({
    required this.style,
    required this.kind,
    required this.fraction,
    required this.ticks,
    required this.active,
    required this.pad,
  });

  final NpStyle style;
  final NpSliderKind kind;
  final double fraction;
  final List<double> ticks;
  final bool active;
  final double pad;

  @override
  void paint(Canvas canvas, Size size) {
    final s = style;
    final cy = size.height / 2;
    final left = pad;
    final right = size.width - pad;
    final w = math.max(1.0, right - left);
    final x = left + fraction * w;
    final fill = Paint();

    if (!s.isSignal) {
      // Classic: rounded track, accent gradient, round thumb with a halo.
      const h = 5.0;
      final track = RRect.fromRectAndRadius(
        Rect.fromLTRB(left, cy - h / 2, right, cy + h / 2),
        const Radius.circular(h / 2),
      );
      canvas.drawRRect(track, fill..color = s.surfaceHigh);
      if (x > left) {
        final progress = Rect.fromLTRB(left, cy - h / 2, x, cy + h / 2);
        canvas.drawRRect(
          RRect.fromRectAndRadius(progress, const Radius.circular(h / 2)),
          Paint()
            ..shader = LinearGradient(
              colors: [s.primaryContainer, s.accentFill],
            ).createShader(progress),
        );
      }
      for (final t in ticks) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(left + t * w - 1, cy - 5.5, 2, 11),
            const Radius.circular(1),
          ),
          fill..color = s.textMuted.withValues(alpha: 0.5),
        );
      }
      canvas.drawCircle(
        Offset(x, cy),
        active ? 13 : 11,
        fill..color = s.accentFill.withValues(alpha: 0.3),
      );
      canvas.drawCircle(Offset(x, cy), 8, fill..color = s.text);
      return;
    }

    final stroke = Paint()..style = PaintingStyle.stroke;

    if (kind == NpSliderKind.scrubber) {
      // Signal scrubber: a ruler, a glowing fill, chapter posts, a slab.
      final ruler = Paint()
        ..color = s.textFaint.withValues(alpha: 0.7)
        ..strokeWidth = 1;
      for (var tx = left; tx <= right; tx += 8) {
        canvas.drawLine(Offset(tx, cy - 5), Offset(tx, cy + 5), ruler);
      }
      if (x > left) {
        canvas.drawRect(
          Rect.fromLTRB(left, cy - 5, x, cy + 5),
          fill..color = s.accentGlow,
        );
        canvas.drawRect(
          Rect.fromLTRB(x - 2, cy - 5, x, cy + 5),
          fill..color = s.accentFill,
        );
      }
      for (final t in ticks) {
        canvas.drawRect(
          Rect.fromLTWH(left + t * w - 1, cy - 11, 2, 22),
          fill..color = s.textMuted,
        );
      }
      final thumb = RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(x, cy), width: 14, height: 30),
        const Radius.circular(3),
      );
      canvas.drawRRect(thumb, fill..color = s.text);
      canvas.drawRRect(
        thumb,
        stroke
          ..color = active ? s.accentFill : s.shadow
          ..strokeWidth = 2,
      );
      return;
    }

    // Signal fader: a ticked slot and a big accent cap with a hard shadow.
    final slot = RRect.fromRectAndRadius(
      Rect.fromLTRB(left, cy - 5, right, cy + 5),
      const Radius.circular(4),
    );
    canvas.drawRRect(slot, fill..color = s.panelSolid);
    final tick = Paint()
      ..color = s.textFaint
      ..strokeWidth = 1;
    for (var tx = left; tx <= right; tx += 12) {
      canvas.drawLine(Offset(tx, cy - 4), Offset(tx, cy + 4), tick);
    }
    canvas.drawRRect(
      slot,
      stroke
        ..color = s.line
        ..strokeWidth = 1.5,
    );
    final cap = Rect.fromCenter(center: Offset(x, cy), width: 22, height: 38);
    const r = Radius.circular(4);
    canvas.drawRRect(
      RRect.fromRectAndRadius(cap.shift(const Offset(3, 3)), r),
      fill..color = s.shadow,
    );
    canvas.drawRRect(RRect.fromRectAndRadius(cap, r), fill..color = s.accentFill);
    canvas.drawRRect(
      RRect.fromRectAndRadius(cap, r),
      stroke
        ..color = s.shadow
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(_SliderPainter old) =>
      old.fraction != fraction ||
      old.active != active ||
      old.style != style ||
      old.kind != kind ||
      old.pad != pad ||
      !_sameTicks(old.ticks, ticks);

  static bool _sameTicks(List<double> a, List<double> b) {
    if (identical(a, b)) return true;
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

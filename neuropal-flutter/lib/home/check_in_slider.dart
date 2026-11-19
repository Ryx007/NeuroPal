// "How are you feeling right now?" as a real slider (a port of the Expo
// app's StateSlider and the web app's CheckInSlider). One 0–100 track in
// three equal regions — Okay / Bit off / Overwhelmed; the region the knob
// rests in becomes the state, and the exact level is kept too.
//
//   touch          drag the knob, or tap anywhere on the track: saves on
//                  release
//   keyboard       arrows ±5, Page Up/Down ±10, Home/End
//   screen reader  swipe up/down ±5
// Keys and screen-reader steps move the knob at once and save a second
// after the last step (or when focus leaves, or when the slider goes away),
// so you can pass through Overwhelmed on the way to 70 without a check-in
// for every step. A screen reader's double tap says where it is and saves
// nothing (otherwise Android taps the track's centre: "Bit off · 50").
//
// Nothing here opens a page by itself (WCAG 3.2.2): Home offers the
// calming steps while the state is Overwhelmed.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';

import '../day/day_models.dart';
import '../theme/np_style.dart';
import 'home_bits.dart';

// ---- the scale (the Expo app's stateScale.js) -----------------------------------

/// Region edges at 33.5 and 66.5, so the 0–100 number always agrees with
/// the region: 0–33 okay, 34–66 a bit off, 67–100 overwhelmed.
const List<double> kRegionEdges = [0.335, 0.665];
const int kLevelStep = 5;
const Duration kStepSave = Duration(seconds: 1);

double clamp01(double x) => x < 0 ? 0 : (x > 1 ? 1 : x);

/// 0–1 → the 0–100 number people see and hear.
int toValue(double pos) => (clamp01(pos) * 100).round();

int regionOf(double pos) =>
    pos < kRegionEdges[0] ? 0 : (pos < kRegionEdges[1] ? 1 : 2);

NervousState stateForLevel(double pos) =>
    NervousState.values[regionOf(clamp01(pos))];

/// Where the knob rests for a stored check-in: the exact level when it
/// agrees with the state, else the region's middle; null before any.
double? levelFor(NervousState? state, double? level) {
  if (state == null) return null;
  if (level != null && level.isFinite && regionOf(clamp01(level)) == state.index) {
    return clamp01(level);
  }
  return state.middle;
}

/// "Okay, 17" (what a screen reader hears for a position).
String spokenValue(double? pos) {
  if (pos == null) return 'Not checked in yet';
  return '${stateForLevel(pos).word}, ${toValue(pos)}';
}

typedef CheckInCommit =
    void Function(NervousState state, double level, {required bool viaSteps});

const double _knob = 30;
const double _inset = _knob / 2;
const double _track = 44;

class CheckInSlider extends StatefulWidget {
  const CheckInSlider({
    super.key,
    required this.state,
    required this.level,
    required this.onCommit,
    this.onLive,
    this.legend = false,
    this.label = 'How are you feeling, 0 to 100',
  });

  final NervousState? state;
  final double? level;

  /// A saved check-in. `viaSteps`: made with keys or a screen reader.
  final CheckInCommit onCommit;

  /// The live position while dragging or stepping (null when it settles).
  final ValueChanged<double?>? onLive;

  /// Words and glyphs under the regions (large tiles).
  final bool legend;
  final String label;

  @override
  State<CheckInSlider> createState() => _CheckInSliderState();
}

class _Stepped {
  const _Stepped(this.value, this.from);

  /// 0–100, not saved yet.
  final int value;

  /// The saved level the steps started from: a check-in made elsewhere
  /// meanwhile (a state button) wins over them.
  final double? from;
}

class _CheckInSliderState extends State<CheckInSlider> {
  final FocusNode _focus = FocusNode(debugLabel: 'check-in slider');
  double? _drag;
  _Stepped? _stepped;
  Timer? _stepTimer;
  bool _ring = false;

  double? get _committed => levelFor(widget.state, widget.level);

  int? get _stepValue {
    final p = _stepped;
    return p != null && p.from == _committed ? p.value : null;
  }

  double? get _pos {
    final step = _stepValue;
    return _drag ?? (step != null ? step / 100 : _committed);
  }

  @override
  void dispose() {
    // Steps still waiting are saved, not lost — after this frame, since the
    // store must not tell other widgets to rebuild while the tree is being
    // taken down.
    final pending = _takePending();
    if (pending != null) scheduleMicrotask(pending);
    _stepTimer?.cancel();
    _focus.dispose();
    super.dispose();
  }

  /// Clears the steps not saved yet and returns the save they amount to
  /// (null when there is nothing to save).
  VoidCallback? _takePending() {
    final p = _stepped;
    if (p == null) return null;
    _stepTimer?.cancel();
    _stepTimer = null;
    _stepped = null;
    final committed = _committed;
    // Something else checked in meanwhile, or stepped away and back.
    if (p.from != committed) return null;
    if (committed != null && toValue(committed) == p.value) return null;
    final commit = widget.onCommit;
    return () => commit(
      stateForLevel(p.value / 100),
      p.value / 100,
      viaSteps: true,
    );
  }

  void _flush() {
    final save = _takePending();
    if (mounted) setState(() {});
    widget.onLive?.call(null);
    save?.call();
  }

  void _stepTo(int raw) {
    final v = raw.clamp(0, 100);
    final from = _stepped?.from ?? _committed;
    _stepTimer?.cancel();
    _stepTimer = Timer(kStepSave, _flush);
    setState(() => _stepped = _Stepped(v, from));
    widget.onLive?.call(v / 100);
  }

  int get _current => _stepValue ?? (_committed == null ? 50 : toValue(_committed!));

  void _dropSteps() {
    _stepTimer?.cancel();
    _stepTimer = null;
    _stepped = null;
  }

  double _posAt(double dx, double width) {
    final span = width - _knob;
    return span > 0 ? clamp01((dx - _inset) / span) : 0.5;
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) {
      return KeyEventResult.ignored;
    }
    final key = event.logicalKey;
    int? next;
    if (key == LogicalKeyboardKey.arrowRight || key == LogicalKeyboardKey.arrowUp) {
      next = _current + kLevelStep;
    } else if (key == LogicalKeyboardKey.arrowLeft ||
        key == LogicalKeyboardKey.arrowDown) {
      next = _current - kLevelStep;
    } else if (key == LogicalKeyboardKey.pageUp) {
      next = _current + 10;
    } else if (key == LogicalKeyboardKey.pageDown) {
      next = _current - 10;
    } else if (key == LogicalKeyboardKey.home) {
      next = 0;
    } else if (key == LogicalKeyboardKey.end) {
      next = 100;
    }
    if (next == null) return KeyEventResult.ignored;
    _stepTo(next);
    return KeyEventResult.handled;
  }

  void _announceWhere() {
    final message = '${spokenValue(_pos)}. Swipe up or down to change it.';
    if (MediaQuery.maybeSupportsAnnounceOf(context) ?? false) {
      unawaited(
        SemanticsService.sendAnnouncement(
          View.of(context),
          message,
          Directionality.of(context),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final pos = _pos;
    final current = _current;
    final region = pos == null ? null : regionOf(pos);
    final state = region == null ? null : NervousState.values[region];
    final tint = stateTint(s, state);
    final value = pos == null ? null : toValue(pos);
    final dragging = _drag != null;
    final bubbleText = state == null
        ? 'Drag or tap to check in'
        : '${state.word} · $value';

    final slider = LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final textScaler = MediaQuery.textScalerOf(context);
        final bubbleFont = s.isSignal ? 11.0 : 12.0;
        final bubbleHeight = math.max(22.0, textScaler.scale(bubbleFont) * 1.3 + 8);
        final lane = bubbleHeight + 4;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          excludeFromSemantics: true,
          onHorizontalDragStart: (d) {
            final p = _posAt(d.localPosition.dx, width);
            setState(() {
              _dropSteps(); // a drag replaces any steps not saved yet
              _drag = p;
            });
            widget.onLive?.call(p);
          },
          onHorizontalDragUpdate: (d) {
            final p = _posAt(d.localPosition.dx, width);
            setState(() => _drag = p);
            widget.onLive?.call(p);
          },
          onHorizontalDragEnd: (_) {
            final p = _drag;
            setState(() => _drag = null);
            widget.onLive?.call(null);
            if (p != null) {
              final snapped = toValue(p) / 100;
              widget.onCommit(stateForLevel(snapped), snapped, viaSteps: false);
            }
          },
          onHorizontalDragCancel: () {
            setState(() => _drag = null); // back to what is saved
            widget.onLive?.call(null);
          },
          onTapUp: (d) {
            _dropSteps();
            final p = toValue(_posAt(d.localPosition.dx, width)) / 100;
            setState(() {});
            widget.onCommit(stateForLevel(p), p, viaSteps: false);
          },
          child: SizedBox(
            height: lane + _track,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned.fill(
                  child: CustomPaint(
                    painter: _TrackPainter(
                      style: s,
                      pos: pos,
                      lane: lane,
                      ring: _ring,
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  top: 0,
                  height: bubbleHeight,
                  child: CustomSingleChildLayout(
                    delegate: _BubbleLayout(pos ?? 0.5),
                    child: _Bubble(
                      text: bubbleText,
                      state: state,
                      tint: tint,
                      dragging: dragging,
                      height: bubbleHeight,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    final focusable = Focus(
      focusNode: _focus,
      onKeyEvent: _onKey,
      onFocusChange: (focused) {
        setState(
          () => _ring =
              focused &&
              FocusManager.instance.highlightMode == FocusHighlightMode.traditional,
        );
        if (!focused) _flush();
      },
      child: slider,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          container: true,
          slider: true,
          focusable: true,
          label: widget.label,
          value: spokenValue(pos),
          increasedValue: spokenValue(math.min(100, current + kLevelStep) / 100),
          decreasedValue: spokenValue(math.max(0, current - kLevelStep) / 100),
          hint: 'Saves a second after your last change.',
          onIncrease: () => _stepTo(current + kLevelStep),
          onDecrease: () => _stepTo(current - kLevelStep),
          onTap: _announceWhere,
          child: ExcludeSemantics(child: focusable),
        ),
        // At large text the three words don't fit under their thirds; the
        // state buttons above say them, and the bubble says the current one.
        if (widget.legend && MediaQuery.textScalerOf(context).scale(10) <= 13)
          _Legend(active: region),
      ],
    );
  }
}

/// Centres the value bubble over the knob, kept inside the slider.
class _BubbleLayout extends SingleChildLayoutDelegate {
  const _BubbleLayout(this.pos);

  final double pos;

  @override
  BoxConstraints getConstraintsForChild(BoxConstraints constraints) =>
      constraints.loosen();

  @override
  Offset getPositionForChild(Size size, Size childSize) {
    final cx = _inset + pos * math.max(0.0, size.width - _knob);
    final x = (cx - childSize.width / 2)
        .clamp(0.0, math.max(0.0, size.width - childSize.width))
        .toDouble();
    return Offset(x, 0);
  }

  @override
  bool shouldRelayout(_BubbleLayout old) => old.pos != pos;
}

class _Bubble extends StatelessWidget {
  const _Bubble({
    required this.text,
    required this.state,
    required this.tint,
    required this.dragging,
    required this.height,
  });

  final String text;
  final NervousState? state;
  final Color tint;
  final bool dragging;
  final double height;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final glyph = state == null
        ? null
        : StateGlyph(shape: state!.shape, color: tint, size: s.isSignal ? 9 : 10);
    final label = Text(
      s.isSignal ? text.toUpperCase() : text,
      maxLines: 1,
      style: s.isSignal
          ? s.fonts.label(s.text, size: 11)
          : s.fonts.body(12, s.text, weight: FontWeight.w600, height: 1.3),
    );
    // widthFactor 1: the bubble hugs its words (centred in its height).
    final row = Align(
      widthFactor: 1,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (glyph != null) ...[glyph, const SizedBox(width: 6)],
          Flexible(child: label),
        ],
      ),
    );
    if (s.isSignal) {
      final r = math.min(4.0, s.radiusControl * 0.4);
      return CustomPaint(
        painter: s.shadowOffset > 0
            ? _OffsetShadowPainter(color: s.shadow, radius: r)
            : null,
        child: Container(
          height: height,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            color: s.surfaceContainer,
            borderRadius: BorderRadius.circular(r),
            border: Border.all(
              color: dragging && state != null ? tint : s.control,
              width: 1.5,
            ),
          ),
          child: row,
        ),
      );
    }
    return Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 9),
      decoration: BoxDecoration(
        color: s.surfaceHigh,
        borderRadius: BorderRadius.circular(height / 2),
        border: Border.all(
          color: dragging && state != null
              ? tint.withValues(alpha: 0.7)
              : s.line.withValues(alpha: 0.5),
        ),
      ),
      child: row,
    );
  }
}

/// Signal's 2 px hard shadow under the bubble.
class _OffsetShadowPainter extends CustomPainter {
  const _OffsetShadowPainter({required this.color, required this.radius});

  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        (Offset.zero & size).shift(const Offset(2, 2)),
        Radius.circular(radius),
      ),
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(_OffsetShadowPainter old) =>
      old.color != color || old.radius != radius;
}

/// The track: three region bands (the one under the knob bright), a 1 px
/// rule that keeps the track visible whatever the fill (WCAG 1.4.11),
/// Signal's ruler ticks and hazard stripes on Overwhelmed, and the knob.
class _TrackPainter extends CustomPainter {
  _TrackPainter({
    required this.style,
    required this.pos,
    required this.lane,
    required this.ring,
  });

  final NpStyle style;
  final double? pos;
  final double lane;
  final bool ring;

  @override
  void paint(Canvas canvas, Size size) {
    final s = style;
    final span = math.max(0.0, size.width - _knob);
    final lineY = lane + _track / 2;
    const bandH = 8.0;
    final bandTop = lineY - bandH / 2;
    final gap = s.isSignal ? 2.0 : 3.0;
    final active = pos == null ? -1 : regionOf(pos!);
    const edges = [0.0, 0.335, 0.665, 1.0];

    if (ring) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(-4, lane - 4, size.width + 8, _track + 8),
          Radius.circular(s.isSignal ? 4 : 16),
        ),
        Paint()
          ..color = s.accentText
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3,
      );
    }

    for (var i = 0; i < 3; i++) {
      final x0 = _inset + edges[i] * span + (i > 0 ? gap / 2 : 0);
      final x1 = _inset + edges[i + 1] * span - (i < 2 ? gap / 2 : 0);
      if (x1 <= x0) continue;
      final rect = Rect.fromLTRB(x0, bandTop, x1, bandTop + bandH);
      final radius = Radius.circular(
        s.isSignal ? math.min(2.0, s.radiusControl).toDouble() : bandH / 2,
      );
      final tint = stateTint(s, NervousState.values[i]);
      final shape = RRect.fromRectAndRadius(rect, radius);
      canvas.drawRRect(
        shape,
        Paint()..color = tint.withValues(alpha: active == i ? 1 : 0.55),
      );
      if (s.isSignal && i == 2) {
        // Signal's warning language: hazard stripes, never red alone.
        canvas
          ..save()
          ..clipRRect(shape);
        final stripe = Paint()
          ..color = s.shadow.withValues(alpha: 0.6)
          ..strokeWidth = 2.5;
        for (var x = rect.left - bandH; x < rect.right + bandH; x += 6) {
          canvas.drawLine(
            Offset(x, rect.bottom),
            Offset(x + bandH, rect.top),
            stripe,
          );
        }
        canvas.restore();
      }
    }

    canvas.drawRect(
      Rect.fromLTWH(_inset, bandTop + bandH + 2, span, 1),
      Paint()..color = s.textFaint,
    );

    if (s.isSignal) {
      final minor = Paint()..color = s.textFaint;
      for (var k = 1; k < 30; k++) {
        if (k == 10 || k == 20) continue;
        final x = _inset + (k / 30) * span;
        canvas.drawRect(
          Rect.fromLTWH(x - 0.75, lineY - 4 - 7, 1.5, 7),
          minor,
        );
      }
      final major = Paint()..color = s.textMuted;
      for (final e in edges) {
        final x = _inset + e * span;
        canvas.drawRect(Rect.fromLTWH(x - 1, lineY - 4 - 15, 2, 15), major);
      }
    }

    // The knob (resting in the middle with a dot before any check-in).
    final p = pos ?? 0.5;
    final center = Offset(_inset + p * span, lineY);
    final state = pos == null ? null : NervousState.values[active];
    final tint = stateTint(s, state);
    const r = _knob / 2;
    if (s.isSignal) {
      final sh = math.min(3.0, math.max(2.0, s.shadowOffset));
      canvas.drawCircle(center + Offset(sh, sh), r - 1, Paint()..color = s.shadow);
      final body = Rect.fromCircle(center: center, radius: r - 1.5);
      canvas
        ..drawCircle(
          center,
          r - 1.5,
          Paint()
            ..shader = RadialGradient(
              center: const Alignment(-0.24, -0.36),
              radius: 0.75,
              colors: [s.surfaceHighest, s.surfaceLowest],
            ).createShader(body),
        )
        ..drawCircle(
          center,
          r - 1.5,
          Paint()
            ..color = state == null ? s.control : tint
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
    } else {
      canvas
        ..drawCircle(
          center + const Offset(0, 2),
          r,
          Paint()
            ..color = (state == null ? s.shadow : tint).withValues(alpha: 0.3)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
        )
        ..drawCircle(center, r, Paint()..color = s.surfaceHighest)
        ..drawCircle(
          center,
          r - 1.25,
          Paint()
            ..color = state == null ? s.textFaint : tint
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2.5,
        );
    }
    if (state == null) {
      canvas.drawCircle(center, 3, Paint()..color = s.textMuted);
    } else {
      StateGlyphPainter.paintAt(canvas, center, s.isSignal ? 11 : 12, state.shape, tint);
    }
  }

  @override
  bool shouldRepaint(_TrackPainter old) =>
      old.pos != pos || old.style != style || old.lane != lane || old.ring != ring;
}

/// Words + glyphs under each region (large tiles). Decorative for screen
/// readers: the slider's value already says the region, and the state
/// buttons say every word.
class _Legend extends StatelessWidget {
  const _Legend({required this.active});

  final int? active;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return ExcludeSemantics(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(_inset, 2, _inset, 0),
        child: Row(
          children: [
            for (final (i, st) in NervousState.values.indexed)
              Expanded(
                flex: i == 1 ? 330 : 335,
                child: FittedBox(
                  // Decorative and said elsewhere: rather than overflow its
                  // third, a word may shrink a little.
                  fit: BoxFit.scaleDown,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      StateGlyph(shape: st.shape, color: stateTint(s, st), size: 9),
                      const SizedBox(width: 5),
                      Text(
                        s.isSignal ? st.word.toUpperCase() : st.word,
                        style: s.isSignal
                            ? s.fonts.label(
                                active == i ? s.text : s.textMuted,
                                size: 10.5,
                              )
                            : s.fonts.body(
                                12,
                                active == i ? s.text : s.textMuted,
                                weight: FontWeight.w500,
                              ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// The check-in tile: three one-tap choices (the original way in), the
// slider for the exact level, a line that says what the state means (read
// out when it changes), and, while overwhelmed, the calming steps right in
// the tile. Signal's large tile adds the S-Today dial, which follows the
// slider live. A port of the web app's StateTile.tsx.

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../day/day_models.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_panel.dart';
import '../widgets/np_pressable.dart';
import 'check_in_slider.dart';
import 'home_bits.dart';

typedef StateCheckIn =
    void Function(
      NervousState state,
      double level, {
      required bool viaSteps,
      required bool button,
    });

class StateTile extends StatefulWidget {
  const StateTile({
    super.key,
    required this.size,
    required this.state,
    required this.level,
    required this.message,
    required this.onCheckIn,
    required this.onCalm,
  });

  /// "S" | "M" | "L".
  final String size;
  final NervousState? state;
  final double? level;
  final String message;
  final StateCheckIn onCheckIn;
  final VoidCallback onCalm;

  @override
  State<StateTile> createState() => _StateTileState();
}

class _StateTileState extends State<StateTile> {
  /// The slider's live position (for the dial), null when settled.
  double? _live;

  void _pick(NervousState s) =>
      widget.onCheckIn(s, s.middle, viaSteps: false, button: true);

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final large = widget.size == 'L';
    // Big text: the row of three would cut "Overwhelmed"; list them instead.
    final bigText = MediaQuery.textScalerOf(context).scale(10) > 13;

    Widget buttons(bool compact) {
      if (compact) {
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final (i, st) in NervousState.values.indexed) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: _StateButton(
                  state: st,
                  selected: widget.state == st,
                  compact: true,
                  onTap: () => _pick(st),
                ),
              ),
            ],
          ],
        );
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (i, st) in NervousState.values.indexed) ...[
            if (i > 0) const SizedBox(height: 8),
            _StateButton(
              state: st,
              selected: widget.state == st,
              compact: false,
              signalWords: s.isSignal,
              onTap: () => _pick(st),
            ),
          ],
        ],
      );
    }

    final choices = Semantics(
      container: true,
      label: 'How are you feeling right now?',
      explicitChildNodes: true,
      child: large || bigText ? buttons(false) : buttons(true),
    );

    Widget top = choices;
    if (large && s.isSignal) {
      top = LayoutBuilder(
        builder: (context, constraints) {
          final dial = _Dial(
            pos: _live ?? levelFor(widget.state, widget.level),
          );
          if (constraints.maxWidth < 330 || bigText) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [Center(child: dial), const SizedBox(height: 12), choices],
            );
          }
          return Row(
            children: [
              dial,
              const SizedBox(width: 14),
              Expanded(child: choices),
            ],
          );
        },
      );
    }

    return HomeTileFrame(
      children: [
        if (widget.size != 'S') ...[
          TileHead(
            large ? 'How are you feeling right now?' : 'How are you feeling?',
            trailing: [
              if (large && s.isSignal)
                ExcludeSemantics(
                  child: Text('CH·01', style: s.fonts.mono(11, s.textMuted)),
                ),
            ],
          ),
          const SizedBox(height: 12),
        ],
        top,
        const SizedBox(height: 12),
        CheckInSlider(
          state: widget.state,
          level: widget.level,
          legend: large,
          onLive: (p) {
            if (mounted && s.isSignal && large) setState(() => _live = p);
          },
          onCommit: (st, level, {required viaSteps}) =>
              widget.onCheckIn(st, level, viaSteps: viaSteps, button: false),
        ),
        const SizedBox(height: 12),
        Semantics(
          liveRegion: true,
          container: true,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (s.isSignal) ...[
                ExcludeSemantics(
                  child: Text(
                    '>',
                    style: s.fonts.label(s.accentText, size: 14),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  widget.message,
                  style: s.fonts.body(15, s.text, height: 1.45),
                ),
              ),
            ],
          ),
        ),
        if (widget.state == NervousState.red) ...[
          const SizedBox(height: 14),
          Align(
            alignment: Alignment.centerLeft,
            child: NpButton(
              label: 'Open the calming steps',
              icon: Icons.spa_outlined,
              onPressed: widget.onCalm,
            ),
          ),
        ],
      ],
    );
  }
}

/// One of the three choices. Unpicked: a hollow ring; picked: filled (and
/// the accent block in Signal). Never colour alone.
class _StateButton extends StatelessWidget {
  const _StateButton({
    required this.state,
    required this.selected,
    required this.compact,
    required this.onTap,
    this.signalWords = false,
  });

  final NervousState state;
  final bool selected;
  final bool compact;
  final bool signalWords;
  final VoidCallback onTap;

  /// Signal's large tile says "A bit off" (as the S-Today board).
  String get _word {
    if (compact) return state.word;
    if (signalWords) {
      return switch (state) {
        NervousState.green => 'I feel okay',
        NervousState.yellow => 'A bit off',
        NervousState.red => 'Overwhelmed',
      };
    }
    return state.long;
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final tint = stateTint(s, state);
    final radius = s.isSignal ? s.radiusControl * 0.6 : (compact ? 16.0 : 18.0);
    final Color bg;
    final Color fg;
    final Color border;
    if (s.isSignal) {
      bg = selected ? s.accentFill : s.surfaceContainer.withValues(alpha: 0.55);
      fg = selected ? s.accentInk : s.text;
      border = selected ? s.shadow : s.control;
    } else {
      bg = selected
          ? Color.alphaBlend(tint.withValues(alpha: 0.14), s.surfaceContainer)
          : s.surfaceContainer;
      fg = s.text;
      border = selected ? tint : Colors.transparent;
    }
    final glyphColor = s.isSignal && selected ? s.accentInk : tint;
    final word = Text(
      _word,
      textAlign: compact ? TextAlign.center : TextAlign.start,
      style: s.fonts.body(compact ? 13.5 : 15, fg, weight: FontWeight.w700),
    );
    final ring = Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? fg : Colors.transparent,
        border: Border.all(color: selected ? fg : s.textMuted, width: 1.5),
      ),
    );

    return NpPressable(
      onTap: onTap,
      selected: selected,
      semanticLabel: state.long,
      focusRadius: radius,
      minSize: Size(44, compact ? 60 : (s.isSignal ? 48 : 56)),
      builder: (context, pressed, focused) {
        Widget body = Container(
          // The full width of its slot (NpPressable centres a loose child).
          width: double.infinity,
          constraints: BoxConstraints(minHeight: compact ? 60 : (s.isSignal ? 48 : 56)),
          padding: compact
              ? const EdgeInsets.symmetric(horizontal: 4, vertical: 6)
              : const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: border, width: s.isSignal ? 1.5 : 1),
          ),
          child: compact
              ? Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    StateGlyph(shape: state.shape, color: glyphColor, size: 14),
                    const SizedBox(height: 4),
                    word,
                  ],
                )
              : Row(
                  children: [
                    StateGlyph(shape: state.shape, color: glyphColor, size: 13),
                    const SizedBox(width: 12),
                    Expanded(child: word),
                    const SizedBox(width: 10),
                    ring,
                  ],
                ),
        );
        if (s.isSignal && selected && s.shadowOffset > 0) {
          body = CustomPaint(
            painter: HardShadowPainter(
              color: s.shadow,
              offset: math.min(4, s.shadowOffset),
              radius: radius,
            ),
            child: body,
          );
        }
        return body;
      },
    );
  }
}

/// The S-Today dial (Signal): decorative — the slider and the buttons say
/// the state. Its pointer sweeps −75°…+75° with the level, resting to the
/// left before any check-in.
class _Dial extends StatelessWidget {
  const _Dial({required this.pos});

  final double? pos;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return ExcludeSemantics(
      child: CustomPaint(
        size: const Size.square(104),
        painter: _DialPainter(style: s, pos: pos),
      ),
    );
  }
}

class _DialPainter extends CustomPainter {
  _DialPainter({required this.style, required this.pos});

  final NpStyle style;
  final double? pos;

  @override
  void paint(Canvas canvas, Size size) {
    final s = style;
    final c = size.width / 2;
    final center = Offset(c, c);
    final tick = Paint()
      ..color = s.textFaint
      ..strokeWidth = 1.6;
    for (var i = 0; i <= 26; i++) {
      final a = (-135 + i * (270 / 26)) * math.pi / 180;
      final r1 = c - 2;
      final r2 = c - (i % 13 == 0 ? 11 : 7);
      canvas.drawLine(
        Offset(c + r1 * math.sin(a), c - r1 * math.cos(a)),
        Offset(c + r2 * math.sin(a), c - r2 * math.cos(a)),
        tick,
      );
    }
    final r = c - 15;
    canvas.drawCircle(center + const Offset(3, 3), r, Paint()..color = s.shadow);
    final body = Rect.fromCircle(center: center, radius: r);
    canvas
      ..drawCircle(
        center,
        r,
        Paint()
          ..shader = RadialGradient(
            center: const Alignment(-0.24, -0.36),
            radius: 0.75,
            colors: [s.surfaceHighest, s.surfaceLowest],
          ).createShader(body),
      )
      ..drawCircle(
        center,
        r,
        Paint()
          ..color = s.line
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      )
      ..drawCircle(
        center,
        r - 7,
        Paint()
          ..color = s.text.withValues(alpha: 0.08)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
    final p = pos;
    final angle = (p == null ? -110.0 : -75 + 150 * p) * math.pi / 180;
    final pr = r - 9;
    canvas.drawLine(
      Offset(c + 7 * math.sin(angle), c - 7 * math.cos(angle)),
      Offset(c + pr * math.sin(angle), c - pr * math.cos(angle)),
      Paint()
        ..color = s.accentFill
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(_DialPainter old) => old.pos != pos || old.style != style;
}

// Small text and indicator pieces shared by the screens.

import 'package:flutter/material.dart';

import '../theme/np_style.dart';

/// An upper-case section label ("READING SPEED"). Screen readers get the
/// normal-case words, not shouting letters.
class NpLabel extends StatelessWidget {
  const NpLabel(this.text, {super.key, this.color, this.size = 11});

  final String text;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Text(
      text.toUpperCase(),
      semanticsLabel: text,
      style: s.fonts.label(color ?? (s.isSignal ? s.textFaint : s.textMuted),
          size: size),
    );
  }
}

/// The little status light. [live] pulses gently while something is
/// playing — unless motion is Still / reduce-motion is on.
class Led extends StatefulWidget {
  const Led({super.key, this.on = true, this.live = false, this.size = 8});

  final bool on;
  final bool live;
  final double size;

  @override
  State<Led> createState() => _LedState();
}

class _LedState extends State<Led> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );

  void _sync(NpStyle s) {
    final animate = widget.live && widget.on && !s.still;
    if (animate && !_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    } else if (!animate && _pulse.isAnimating) {
      _pulse
        ..stop()
        ..value = 0;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync(NpStyle.of(context)); // the theme (motion) may have changed
  }

  @override
  void didUpdateWidget(Led oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync(NpStyle.of(context));
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final dot = widget.on
        ? Container(
            width: widget.size,
            height: widget.size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: s.accentFill,
              boxShadow: [BoxShadow(color: s.accentGlow, blurRadius: 10)],
            ),
          )
        : Container(
            width: widget.size,
            height: widget.size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: s.textFaint, width: 1.5),
            ),
          );
    return ExcludeSemantics(
      child: FadeTransition(
        opacity: Tween<double>(begin: 1, end: 0.3).animate(_pulse),
        child: dot,
      ),
    );
  }
}

/// Thousands separators for word counts: 12345 → "12,345".
String formatCount(int n) {
  final s = n.abs().toString();
  final out = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) out.write(',');
    out.write(s[i]);
  }
  return out.toString();
}

/// Minutes → "m:ss" or "h:mm:ss".
String formatDuration(Duration d) {
  final h = d.inHours;
  final m = d.inMinutes.remainder(60);
  final sec = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  return h > 0 ? '$h:${m.toString().padLeft(2, '0')}:$sec' : '$m:$sec';
}

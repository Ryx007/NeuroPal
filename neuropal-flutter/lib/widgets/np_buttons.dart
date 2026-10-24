// Buttons and chips for both skins, built on NpPressable.

import 'package:flutter/material.dart';

import '../theme/np_style.dart';
import 'np_panel.dart';
import 'np_pressable.dart';

enum NpButtonKind { primary, ghost }

/// A labelled button. Primary = filled accent; ghost = outlined.
class NpButton extends StatelessWidget {
  const NpButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.kind = NpButtonKind.primary,
    this.semanticLabel,
    this.expand = false,
    this.minHeight,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final NpButtonKind kind;
  final String? semanticLabel;

  /// Fill the available width.
  final bool expand;

  /// Overrides the default height (primary 48, ghost 44), e.g. 48 for
  /// ghost buttons on screens that use 48 dp targets throughout.
  final double? minHeight;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final primary = kind == NpButtonKind.primary;
    final radius = s.isSignal ? s.radiusMedium : s.radiusControl;
    final fg = primary ? s.accentInk : s.text;
    final height = minHeight ?? (primary ? 48.0 : 44.0);

    return NpPressable(
      onTap: onPressed,
      semanticLabel: semanticLabel,
      focusRadius: radius.clamp(0, 24),
      minSize: Size(44, height),
      builder: (context, pressed, focused) {
        final content = Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 19, color: fg),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: s.fonts.body(15, fg, weight: FontWeight.w700),
                ),
              ),
            ],
          ),
        );

        final decoration = BoxDecoration(
          color: primary ? s.accentFill : Colors.transparent,
          borderRadius: BorderRadius.circular(radius),
          border: primary
              ? (s.isSignal && s.borderWidth > 0
                    ? Border.all(color: s.shadow, width: s.borderWidth)
                    : null)
              : Border.all(color: s.control, width: 1.5),
          boxShadow: primary && !s.isSignal
              ? [
                  BoxShadow(
                    color: s.accentGlow,
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                    spreadRadius: -6,
                  ),
                ]
              : null,
        );

        Widget button = ConstrainedBox(
          constraints: BoxConstraints(minHeight: height),
          child: DecoratedBox(decoration: decoration, child: content),
        );

        // Signal: a hard shadow in the deep accent; pressing sinks the
        // button into it (unless nothing may move).
        if (primary && s.isSignal && s.shadowOffset > 0) {
          final sunk = pressed && !s.still;
          button = CustomPaint(
            painter: sunk
                ? null
                : HardShadowPainter(
                    color: s.accentDeep,
                    offset: s.shadowOffset,
                    radius: radius,
                  ),
            child: Transform.translate(
              offset: sunk ? Offset(s.shadowOffset, s.shadowOffset) : Offset.zero,
              child: button,
            ),
          );
        }
        return Opacity(opacity: onPressed == null ? 0.42 : 1, child: button);
      },
    );
  }
}

/// A square/round icon-only button. Always needs a [semanticLabel].
class NpIconButton extends StatelessWidget {
  const NpIconButton({
    super.key,
    required this.icon,
    required this.semanticLabel,
    required this.onPressed,
    this.size = 44,
    this.iconSize = 22,
    this.outlined = true,
    this.color,
  });

  final IconData icon;
  final String semanticLabel;
  final VoidCallback? onPressed;
  final double size;
  final double iconSize;

  /// Signal draws a control-coloured outline; Classic stays borderless.
  final bool outlined;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final radius = s.isSignal ? s.radiusMedium : size / 2;
    return NpPressable(
      onTap: onPressed,
      semanticLabel: semanticLabel,
      tooltip: semanticLabel,
      focusRadius: radius,
      minSize: Size(size, size),
      builder: (context, pressed, focused) {
        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: s.isSignal
                ? s.panel
                : (pressed ? s.accentGlow : Colors.transparent),
            borderRadius: BorderRadius.circular(radius),
            border: s.isSignal && outlined
                ? Border.all(color: s.control, width: 1.5)
                : null,
          ),
          child: Icon(
            icon,
            size: iconSize,
            color: onPressed == null
                ? s.textFaint
                : (color ?? (s.isSignal ? s.text : s.accentText)),
          ),
        );
      },
    );
  }
}

/// A selectable chip (reader font, line spacing, presets…).
class NpChip extends StatelessWidget {
  const NpChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.semanticLabel,
    this.labelStyle,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final String? semanticLabel;

  /// Lets a chip preview its own font (e.g. the reader font picker).
  final TextStyle? labelStyle;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final radius = s.isSignal ? s.radiusMedium : s.radiusControl;
    final Color bg;
    final Color fg;
    final Color border;
    if (selected) {
      bg = s.isSignal ? s.accentFill : s.accentText.withValues(alpha: 0.18);
      fg = s.isSignal ? s.accentInk : s.accentText;
      border = s.isSignal ? s.shadow : s.accentText.withValues(alpha: 0.5);
    } else {
      bg = Colors.transparent;
      fg = s.text;
      border = s.control;
    }
    return NpPressable(
      onTap: onTap,
      selected: selected,
      semanticLabel: semanticLabel,
      focusRadius: radius.clamp(0, 22),
      builder: (context, pressed, focused) => Container(
        constraints: const BoxConstraints(minHeight: 44),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(radius),
          border: Border.all(color: border, width: 1.5),
        ),
        // widthFactor/heightFactor 1: hug the label (a plain alignment
        // would stretch the chip to the full row width).
        child: Align(
          widthFactor: 1,
          heightFactor: 1,
          child: Text(
            label,
            style: (labelStyle ?? s.fonts.body(14, fg, weight: FontWeight.w700))
                .copyWith(color: fg),
          ),
        ),
      ),
    );
  }
}

// The skin-aware surface every card, sheet and bar is built from.
//
//   Classic ("liquid glass"): accent-tinted translucent fill, hairline edge,
//   big radius, optional backdrop blur.
//   Signal ("brutal glass"): smoked translucent fill, solid border in
//   `line`, HARD offset shadow in `shadowColor`, radius from the corners
//   setting, optional backdrop blur.
//
// Why a custom painter for the shadow: Flutter's BoxShadow is painted under
// the whole box, so it would show THROUGH a translucent panel. The hard
// shadow here is only the L-shaped part that sticks out, like CSS.

import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../theme/np_style.dart';

class NpPanel extends StatelessWidget {
  const NpPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.radius,
    this.blur = false,
    this.fill,
    this.borderColor,
    this.shadow = true,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  /// Defaults to the skin's panel radius.
  final double? radius;

  /// Blur what is behind (headers, the player, sheets). Costly: don't use
  /// it for every card in a list.
  final bool blur;

  /// Override the fill (e.g. a selected state).
  final Color? fill;
  final Color? borderColor;

  /// Signal's hard shadow (ignored by Classic, whose token is 0).
  final bool shadow;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final r = radius ?? s.radius;
    final shape = BorderRadius.circular(r);

    final decoration = s.isSignal
        ? BoxDecoration(
            color: fill ?? s.panel,
            borderRadius: shape,
            border: s.borderWidth > 0
                ? Border.all(color: borderColor ?? s.line, width: s.borderWidth)
                : null,
          )
        : BoxDecoration(
            borderRadius: shape,
            color: fill,
            // Classic glass: accent → container tint over the panel colour.
            gradient: fill != null
                ? null
                : LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color.alphaBlend(
                        s.accentFill.withValues(alpha: 0.10),
                        s.panel,
                      ),
                      Color.alphaBlend(
                        s.primaryContainer.withValues(alpha: 0.16),
                        s.panel,
                      ),
                    ],
                  ),
            border: Border.all(
              color: borderColor ?? s.line.withValues(alpha: 0.5),
              width: s.borderWidth,
            ),
          );

    Widget body = DecoratedBox(
      decoration: decoration,
      child: Padding(padding: padding, child: child),
    );

    if (blur) {
      body = ClipRRect(
        borderRadius: shape,
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: s.blurSigma, sigmaY: s.blurSigma),
          child: body,
        ),
      );
    }

    final offset = s.isSignal && shadow ? s.shadowOffset : 0.0;
    if (offset <= 0) return body;
    return CustomPaint(
      painter: HardShadowPainter(
        color: s.shadow,
        offset: offset,
        radius: r,
      ),
      child: body,
    );
  }
}

/// Paints only the visible part of a hard offset shadow (the box shifted by
/// [offset], minus the box itself).
class HardShadowPainter extends CustomPainter {
  const HardShadowPainter({
    required this.color,
    required this.offset,
    required this.radius,
  });

  final Color color;
  final double offset;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final box = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(radius),
    );
    final shifted = box.shift(Offset(offset, offset));
    final path = Path.combine(
      PathOperation.difference,
      Path()..addRRect(shifted),
      Path()..addRRect(box),
    );
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(HardShadowPainter old) =>
      old.color != color || old.offset != offset || old.radius != radius;
}

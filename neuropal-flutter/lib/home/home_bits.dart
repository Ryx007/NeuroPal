// Small pieces Home's tiles share: the state glyph (a state is never colour
// alone: word + shape + colour), the tile frame and head, the one-line row
// of a small tile, and the status line with Undo.

import 'package:flutter/material.dart';

import '../day/day_models.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_panel.dart';
import '../widgets/np_pressable.dart';
import '../widgets/np_text.dart';

/// The colour of a state in this skin (always next to its word and shape).
Color stateTint(NpStyle s, NervousState? state) => switch (state) {
  NervousState.green => s.secondary,
  NervousState.yellow => s.tertiary,
  NervousState.red => s.error,
  null => s.textFaint,
};

/// Okay = circle, a bit off = triangle, overwhelmed = square. Decorative:
/// the text next to it says the state.
class StateGlyph extends StatelessWidget {
  const StateGlyph({super.key, required this.shape, required this.color, this.size = 12});

  final StateShape shape;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: CustomPaint(
      size: Size.square(size),
      painter: StateGlyphPainter(shape: shape, color: color),
    ),
  );
}

class StateGlyphPainter extends CustomPainter {
  const StateGlyphPainter({required this.shape, required this.color});

  final StateShape shape;
  final Color color;

  /// Draws the glyph in a [size]-wide square centred on [center].
  static void paintAt(Canvas canvas, Offset center, double size, StateShape shape, Color color) {
    final k = size / 12;
    final o = center - Offset(size / 2, size / 2);
    final paint = Paint()..color = color;
    switch (shape) {
      case StateShape.circle:
        canvas.drawCircle(center, 5 * k, paint);
      case StateShape.triangle:
        canvas.drawPath(
          Path()
            ..moveTo(o.dx + 6 * k, o.dy + 1 * k)
            ..lineTo(o.dx + 11.5 * k, o.dy + 11 * k)
            ..lineTo(o.dx + 0.5 * k, o.dy + 11 * k)
            ..close(),
          paint,
        );
      case StateShape.square:
        canvas.drawRect(Rect.fromLTWH(o.dx + k, o.dy + k, 10 * k, 10 * k), paint);
    }
  }

  @override
  void paint(Canvas canvas, Size size) =>
      paintAt(canvas, size.center(Offset.zero), size.shortestSide, shape, color);

  @override
  bool shouldRepaint(StateGlyphPainter old) => old.shape != shape || old.color != color;
}

/// A Home tile: the skin's panel with the tiles' padding.
class HomeTileFrame extends StatelessWidget {
  const HomeTileFrame({super.key, required this.children, this.padding});

  final List<Widget> children;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) => NpPanel(
    padding: padding ?? const EdgeInsets.fromLTRB(16, 14, 16, 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: children,
    ),
  );
}

/// A tile's heading (a mono label, a heading for screen readers) and
/// anything to its right.
class TileHead extends StatelessWidget {
  const TileHead(this.title, {super.key, this.trailing = const []});

  final String title;
  final List<Widget> trailing;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(child: Semantics(header: true, child: NpLabel(title))),
      for (final t in trailing) ...[const SizedBox(width: 8), t],
    ],
  );
}

/// A small (S) tile: one tappable line — an icon, a label and the value.
class OneLineTile extends StatelessWidget {
  const OneLineTile({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
    this.semanticLabel,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback? onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return NpPanel(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      child: NpPressable(
        onTap: onTap,
        semanticLabel: semanticLabel ?? '$label: $value',
        focusRadius: s.radiusMedium,
        minSize: const Size(44, 48),
        builder: (context, pressed, focused) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            children: [
              Icon(icon, size: 19, color: s.accentText),
              const SizedBox(width: 10),
              NpLabel(label),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: s.fonts.body(14.5, s.text, weight: FontWeight.w700),
                ),
              ),
              if (onTap != null)
                Icon(Icons.chevron_right_rounded, size: 22, color: s.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

/// What just happened ("Removed “Walk”.") with Undo next to it. Always in
/// the tree, as a live region, so screen readers hear each change.
class UndoStatus extends StatelessWidget {
  const UndoStatus({super.key, required this.text, this.onUndo});

  final String? text;
  final VoidCallback? onUndo;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final message = text;
    return Semantics(
      liveRegion: true,
      container: true,
      child: message == null
          ? const SizedBox.shrink()
          : Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 10,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(message, style: s.fonts.body(14.5, s.textMuted)),
                  if (onUndo != null)
                    NpButton(
                      label: 'Undo',
                      icon: Icons.undo_rounded,
                      kind: NpButtonKind.ghost,
                      minHeight: 44,
                      onPressed: onUndo,
                    ),
                ],
              ),
            ),
    );
  }
}

/// The icon for an anchor's kind.
IconData categoryIcon(AnchorCategory c) => switch (c) {
  AnchorCategory.medication => Icons.medication_outlined,
  AnchorCategory.rest => Icons.free_breakfast_outlined,
  AnchorCategory.study => Icons.menu_book_outlined,
  AnchorCategory.move => Icons.directions_walk_rounded,
  AnchorCategory.other => Icons.flag_outlined,
};

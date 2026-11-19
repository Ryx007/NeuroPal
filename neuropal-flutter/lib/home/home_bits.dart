// Small pieces Home's tiles share: the state glyph (a state is never colour
// alone: word + shape + colour), the tile frame and head, the one-line row
// of a small tile, and the status line with Undo.

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

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
/// anything to its right. While the label's longest word still fits next to
/// those things, they share one row and the label takes the rest of it (and
/// wraps there); when it doesn't (200 % text on a narrow phone), they move
/// under the label and wrap themselves. Nothing is ever clipped.
class TileHead extends StatelessWidget {
  const TileHead(this.title, {super.key, this.trailing = const []});

  final String title;
  final List<Widget> trailing;

  @override
  Widget build(BuildContext context) {
    final label = Semantics(header: true, child: NpLabel(title));
    if (trailing.isEmpty) return label;
    return _HeadLayout(
      label: label,
      trailing: Wrap(
        spacing: 8,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: trailing,
      ),
    );
  }
}

/// [TileHead]'s layout: one row while it fits, else stacked.
class _HeadLayout extends MultiChildRenderObjectWidget {
  _HeadLayout({required Widget label, required Widget trailing})
    : super(children: [label, trailing]);

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderHead(Directionality.of(context));

  @override
  void updateRenderObject(BuildContext context, _RenderHead renderObject) {
    renderObject.textDirection = Directionality.of(context);
  }
}

class _HeadParentData extends ContainerBoxParentData<RenderBox> {}

class _RenderHead extends RenderBox
    with
        ContainerRenderObjectMixin<RenderBox, _HeadParentData>,
        RenderBoxContainerDefaultsMixin<RenderBox, _HeadParentData> {
  _RenderHead(this._textDirection);

  /// Between the label and the things beside it, and under it.
  static const double _gap = 8;
  static const double _runGap = 6;

  TextDirection _textDirection;
  set textDirection(TextDirection value) {
    if (value == _textDirection) return;
    _textDirection = value;
    markNeedsLayout();
  }

  RenderBox get _label => firstChild!;
  RenderBox get _trailing => lastChild!;

  @override
  void setupParentData(RenderBox child) {
    if (child.parentData is! _HeadParentData) child.parentData = _HeadParentData();
  }

  /// One row when the trailing things and the label's longest word fit
  /// side by side.
  bool _fitsInRow(double trailingWidth, double width) =>
      trailingWidth + _gap + _label.getMinIntrinsicWidth(double.infinity) <= width;

  ({Size size, bool row, Size label, Size trailing}) _measure(
    BoxConstraints constraints,
    ChildLayouter layoutChild,
  ) {
    if (!constraints.hasBoundedWidth) {
      final label = layoutChild(_label, const BoxConstraints());
      final trailing = layoutChild(_trailing, const BoxConstraints());
      final size = Size(
        label.width + _gap + trailing.width,
        math.max(label.height, trailing.height),
      );
      return (size: constraints.constrain(size), row: true, label: label, trailing: trailing);
    }
    final width = constraints.maxWidth;
    final trailing = layoutChild(_trailing, BoxConstraints(maxWidth: width));
    if (_fitsInRow(trailing.width, width)) {
      final label = layoutChild(
        _label,
        BoxConstraints.tightFor(width: width - trailing.width - _gap),
      );
      final size = Size(width, math.max(label.height, trailing.height));
      return (size: constraints.constrain(size), row: true, label: label, trailing: trailing);
    }
    final label = layoutChild(_label, BoxConstraints.tightFor(width: width));
    final size = Size(width, label.height + _runGap + trailing.height);
    return (size: constraints.constrain(size), row: false, label: label, trailing: trailing);
  }

  @override
  Size computeDryLayout(BoxConstraints constraints) =>
      _measure(constraints, ChildLayoutHelper.dryLayoutChild).size;

  @override
  void performLayout() {
    final m = _measure(constraints, ChildLayoutHelper.layoutChild);
    size = m.size;
    final rtl = _textDirection == TextDirection.rtl;
    final label = _label.parentData! as _HeadParentData;
    final trailing = _trailing.parentData! as _HeadParentData;
    final w = size.width;
    if (m.row) {
      final h = size.height;
      label.offset = Offset(rtl ? w - m.label.width : 0, (h - m.label.height) / 2);
      trailing.offset = Offset(rtl ? 0 : w - m.trailing.width, (h - m.trailing.height) / 2);
    } else {
      label.offset = Offset(rtl ? w - m.label.width : 0, 0);
      trailing.offset = Offset(
        rtl ? w - m.trailing.width : 0,
        m.label.height + _runGap,
      );
    }
  }

  @override
  double computeMinIntrinsicWidth(double height) => math.max(
    _label.getMinIntrinsicWidth(double.infinity),
    _trailing.getMinIntrinsicWidth(double.infinity),
  );

  @override
  double computeMaxIntrinsicWidth(double height) =>
      _label.getMaxIntrinsicWidth(double.infinity) +
      _gap +
      _trailing.getMaxIntrinsicWidth(double.infinity);

  double _heightFor(double width) {
    if (!width.isFinite) {
      return math.max(
        _label.getMaxIntrinsicHeight(width),
        _trailing.getMaxIntrinsicHeight(width),
      );
    }
    final trailingWidth = math.min(_trailing.getMaxIntrinsicWidth(double.infinity), width);
    if (_fitsInRow(trailingWidth, width)) {
      return math.max(
        _label.getMaxIntrinsicHeight(width - trailingWidth - _gap),
        _trailing.getMaxIntrinsicHeight(trailingWidth),
      );
    }
    return _label.getMaxIntrinsicHeight(width) +
        _runGap +
        _trailing.getMaxIntrinsicHeight(width);
  }

  @override
  double computeMinIntrinsicHeight(double width) => _heightFor(width);

  @override
  double computeMaxIntrinsicHeight(double width) => _heightFor(width);

  @override
  double? computeDistanceToActualBaseline(TextBaseline baseline) =>
      defaultComputeDistanceToFirstActualBaseline(baseline);

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) =>
      defaultHitTestChildren(result, position: position);

  @override
  void paint(PaintingContext context, Offset offset) => defaultPaint(context, offset);
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
        minSize: const Size(kNpTarget, 48),
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

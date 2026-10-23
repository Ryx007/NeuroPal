// The one building block for everything tappable.
//
// It gives every control the same accessibility basics:
//   * a semantic label and button role for TalkBack / VoiceOver,
//   * keyboard / switch-access focus with a visible 3 px focus ring,
//   * at least 44 × 44 logical pixels of touch target,
//   * a "pressed" flag the skins use for their press effect (Signal buttons
//     sink into their hard shadow; nothing moves when motion is Still).

import 'package:flutter/material.dart';

import '../theme/np_style.dart';

typedef PressableBuilder =
    Widget Function(BuildContext context, bool pressed, bool focused);

class NpPressable extends StatefulWidget {
  const NpPressable({
    super.key,
    required this.onTap,
    required this.builder,
    this.semanticLabel,
    this.tooltip,
    this.selected,
    this.toggled,
    this.focusRadius = 8,
    this.minSize = const Size(44, 44),
    this.excludeChildSemantics = false,
  });

  /// Null disables the control (and announces it as disabled).
  final VoidCallback? onTap;
  final PressableBuilder builder;

  /// What a screen reader announces. Leave null when the child's own text
  /// already says it.
  final String? semanticLabel;
  final String? tooltip;

  /// For options in a group (tone, skin, theme…).
  final bool? selected;

  /// For on/off switches.
  final bool? toggled;
  final double focusRadius;
  final Size minSize;

  /// Hide the child's semantics (when [semanticLabel] says it all).
  final bool excludeChildSemantics;

  @override
  State<NpPressable> createState() => _NpPressableState();
}

class _NpPressableState extends State<NpPressable> {
  bool _pressed = false;
  bool _focused = false;

  void _setPressed(bool value) {
    if (_pressed != value && mounted) setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final style = NpStyle.of(context);
    final enabled = widget.onTap != null;

    Widget child = widget.builder(context, _pressed && enabled, _focused);
    child = ConstrainedBox(
      constraints: BoxConstraints(
        minWidth: widget.minSize.width,
        minHeight: widget.minSize.height,
      ),
      child: Center(widthFactor: 1, heightFactor: 1, child: child),
    );

    // Focus ring: drawn outside the control, never shifts layout.
    child = DecoratedBox(
      position: DecorationPosition.foreground,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(widget.focusRadius + 3),
        border: Border.all(
          color: _focused ? style.accentText : Colors.transparent,
          width: 3,
          strokeAlign: BorderSide.strokeAlignOutside,
        ),
      ),
      child: child,
    );

    child = FocusableActionDetector(
      enabled: enabled,
      onShowFocusHighlight: (v) => setState(() => _focused = v),
      actions: {
        ActivateIntent: CallbackAction<ActivateIntent>(
          onInvoke: (_) {
            widget.onTap?.call();
            return null;
          },
        ),
      },
      mouseCursor: enabled ? SystemMouseCursors.click : MouseCursor.defer,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        excludeFromSemantics: true,
        onTapDown: enabled ? (_) => _setPressed(true) : null,
        onTapUp: enabled ? (_) => _setPressed(false) : null,
        onTapCancel: enabled ? () => _setPressed(false) : null,
        onTap: widget.onTap,
        child: child,
      ),
    );

    // One semantics node per control. With an explicit label the child's
    // own text is hidden (no double announcements); without one, the
    // child's text becomes the label.
    child = Semantics(
      container: true,
      button: widget.toggled == null,
      enabled: enabled,
      selected: widget.selected,
      toggled: widget.toggled,
      label: widget.semanticLabel,
      onTap: widget.onTap,
      excludeSemantics:
          widget.semanticLabel != null || widget.excludeChildSemantics,
      child: child,
    );

    if (widget.tooltip != null) {
      child = Tooltip(
        message: widget.tooltip!,
        excludeFromSemantics: true,
        child: child,
      );
    }
    return child;
  }
}

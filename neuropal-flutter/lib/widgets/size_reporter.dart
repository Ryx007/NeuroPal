// Reports its child's size after layout.
//
// The reader's player floats over the text (so the glass can blur it); the
// text list needs to know how tall the player is to keep its last lines
// reachable. The player's height changes with text scaling and when it is
// collapsed, so it is measured instead of guessed.

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

class SizeReporter extends SingleChildRenderObjectWidget {
  const SizeReporter({super.key, required this.onChange, super.child});

  final ValueChanged<Size> onChange;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      RenderSizeReporter(onChange);

  @override
  void updateRenderObject(
    BuildContext context,
    RenderSizeReporter renderObject,
  ) {
    renderObject.onChange = onChange;
  }
}

class RenderSizeReporter extends RenderProxyBox {
  RenderSizeReporter(this.onChange);

  ValueChanged<Size> onChange;
  Size? _last;

  @override
  void performLayout() {
    super.performLayout();
    final current = size;
    if (current == _last) return;
    _last = current;
    // Never call back during layout: wait for the frame to finish.
    WidgetsBinding.instance.addPostFrameCallback((_) => onChange(current));
  }
}

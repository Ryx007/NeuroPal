// A one-of-N selector (Soft · Natural · Deep, Classic · Signal…).
//
// Signal: a solid well with a sliding accent block (it slides only when
// motion allows). Classic: a soft pill well with a tinted selected pill.

import 'package:flutter/material.dart';

import '../theme/np_style.dart';
import 'np_pressable.dart';

class NpSegmented<T> extends StatelessWidget {
  const NpSegmented({
    super.key,
    required this.options,
    required this.selected,
    required this.onChanged,
    required this.labelOf,
    this.semanticsLabelOf,
  });

  final List<T> options;
  final T selected;
  final ValueChanged<T> onChanged;
  final String Function(T) labelOf;

  /// Longer screen-reader wording per option (defaults to the label).
  final String Function(T)? semanticsLabelOf;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final index = options.indexOf(selected);
    final n = options.length;

    final row = Row(
      children: [
        for (final option in options)
          Expanded(
            child: NpPressable(
              onTap: () => onChanged(option),
              selected: option == selected,
              semanticLabel: semanticsLabelOf?.call(option) ?? labelOf(option),
              focusRadius: s.isSignal ? s.radiusMedium * 0.6 : 18,
              minSize: const Size(44, 40),
              builder: (context, pressed, focused) {
                final on = option == selected;
                return Container(
                  constraints: const BoxConstraints(minHeight: 40),
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  decoration: s.isSignal || !on
                      ? null
                      : BoxDecoration(
                          color: s.accentText.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(s.radiusControl),
                        ),
                  child: Text(
                    labelOf(option),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: s.fonts.body(
                      14,
                      on
                          ? (s.isSignal ? s.accentInk : s.accentText)
                          : s.textMuted,
                      weight: FontWeight.w700,
                    ),
                  ),
                );
              },
            ),
          ),
      ],
    );

    if (!s.isSignal) {
      return Container(
        padding: const EdgeInsets.all(5),
        decoration: BoxDecoration(
          color: s.shadow.withValues(alpha: s.dark ? 0.28 : 0.06),
          borderRadius: BorderRadius.circular(s.radiusControl),
        ),
        child: row,
      );
    }

    // Signal: the accent block sits behind the row and slides between
    // options.
    final x = n <= 1 || index < 0 ? -1.0 : -1 + 2 * index / (n - 1);
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: s.panelSolid,
        borderRadius: BorderRadius.circular(s.radiusMedium),
        border: Border.all(
          color: s.line,
          width: s.borderWidth < 1 ? 1 : s.borderWidth,
        ),
      ),
      child: Stack(
        children: [
          if (index >= 0)
            Positioned.fill(
              child: AnimatedAlign(
                alignment: Alignment(x, 0),
                duration: s.still
                    ? Duration.zero
                    : const Duration(milliseconds: 350),
                curve: Curves.easeOutBack,
                child: FractionallySizedBox(
                  widthFactor: 1 / n,
                  heightFactor: 1,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: s.accentFill,
                      borderRadius: BorderRadius.circular(s.radius * 0.5),
                      border: Border.all(color: s.shadow, width: 2),
                    ),
                  ),
                ),
              ),
            ),
          row,
        ],
      ),
    );
  }
}

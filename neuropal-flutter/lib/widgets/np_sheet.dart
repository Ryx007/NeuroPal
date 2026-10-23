// Bottom sheets in the skin's style (Ask, voice picker, text settings).

import 'package:flutter/material.dart';

import '../theme/np_style.dart';
import 'np_buttons.dart';

/// Shows [builder] in a skin-styled modal bottom sheet. [heightFactor]
/// fixes the height (as a share of the screen) for scrolling content.
Future<T?> showNpSheet<T>(
  BuildContext context, {
  required String title,
  required WidgetBuilder builder,
  double? heightFactor,
}) {
  final s = NpStyle.of(context);
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    barrierColor: s.shadow.withValues(alpha: 0.5),
    sheetAnimationStyle: s.still ? AnimationStyle.noAnimation : null,
    builder: (context) => NpSheetFrame(
      title: title,
      heightFactor: heightFactor,
      child: builder(context),
    ),
  );
}

class NpSheetFrame extends StatelessWidget {
  const NpSheetFrame({
    super.key,
    required this.title,
    required this.child,
    this.heightFactor,
  });

  final String title;
  final Widget child;
  final double? heightFactor;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final media = MediaQuery.of(context);
    final radius = Radius.circular(s.isSignal ? s.radius : 28);

    Widget body = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        Center(
          child: Container(
            width: 38,
            height: 4,
            decoration: BoxDecoration(
              color: s.textMuted.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 6, 8, 4),
          child: Row(
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    title,
                    style: s.isSignal
                        ? s.fonts.display(22, s.text)
                        : s.fonts.display(20, s.text),
                  ),
                ),
              ),
              NpIconButton(
                icon: Icons.close_rounded,
                semanticLabel: 'Close',
                outlined: false,
                onPressed: () => Navigator.of(context).maybePop(),
              ),
            ],
          ),
        ),
        if (heightFactor != null) Expanded(child: child) else Flexible(child: child),
      ],
    );

    if (heightFactor != null) {
      body = SizedBox(height: media.size.height * heightFactor!, child: body);
    }

    return Padding(
      // Lift the sheet above the keyboard (Ask's text field).
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: s.surfaceLow,
          borderRadius: BorderRadius.vertical(top: radius),
          // (A rounded box needs a uniform border in Flutter; the bottom
          // edge sits at the screen edge anyway.)
          border: s.isSignal && s.borderWidth > 0
              ? Border.all(color: s.line, width: s.borderWidth)
              : null,
        ),
        child: SafeArea(top: false, child: body),
      ),
    );
  }
}

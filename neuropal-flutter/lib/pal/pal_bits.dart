// Small pieces the Pal sheet's tools share (the Expo app's pal/bits.jsx):
// the tool title, the intro line, the quiet card, the three-state check-in
// row, the progress bar, the careful crisis reply, and a way to say
// something to a screen reader. Colours, fonts and shapes come from the
// theme only: Classic stays soft, Signal gets hard edges and its shadow.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import '../calm/help_lines.dart';
import '../day/day_models.dart';
import '../home/home_bits.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_panel.dart';
import '../widgets/np_pressable.dart';

/// Says [message] to a screen reader (when one is listening).
void palAnnounce(BuildContext context, String message, {bool assertive = false}) {
  if (!(MediaQuery.maybeSupportsAnnounceOf(context) ?? false)) return;
  unawaited(
    SemanticsService.sendAnnouncement(
      View.of(context),
      message,
      Directionality.of(context),
      assertiveness: assertive ? Assertiveness.assertive : Assertiveness.polite,
    ),
  );
}

/// How much bigger than set the person's text is (1 = as designed; capped
/// at 3). The sheet uses it to decide what still fits.
double palTextScale(BuildContext context) =>
    (MediaQuery.textScalerOf(context).scale(14) / 14).clamp(1.0, 3.0);

/// A tool's heading.
class PalTitle extends StatelessWidget {
  const PalTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Semantics(
      header: true,
      child: Text(
        text,
        style: s.isSignal ? s.fonts.display(22, s.text) : s.fonts.displaySemi(20, s.text),
      ),
    );
  }
}

/// The muted line under a title (Pal's words in the person's talk style).
class PalIntro extends StatelessWidget {
  const PalIntro(this.text, {super.key, this.center = false, this.size = 14.5});

  final String text;
  final bool center;
  final double size;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(
        text,
        textAlign: center ? TextAlign.center : TextAlign.start,
        style: s.fonts.body(size, s.textMuted, height: 1.45),
      ),
    );
  }
}

/// A quiet block for one thing (the suggestion, the steps, a question).
/// [accent] marks the one thing to act on.
class PalCard extends StatelessWidget {
  const PalCard({super.key, required this.child, this.accent = false});

  final Widget child;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    if (s.isSignal) {
      return NpPanel(
        padding: const EdgeInsets.all(14),
        radius: s.radiusMedium,
        fill: s.surfaceHigh,
        borderColor: accent ? s.accentFill : s.line,
        child: child,
      );
    }
    return NpPanel(
      padding: const EdgeInsets.all(16),
      radius: 18,
      fill: accent
          ? Color.alphaBlend(s.accentText.withValues(alpha: 0.10), s.surfaceContainer)
          : s.surfaceHigh,
      borderColor: accent ? s.accentText.withValues(alpha: 0.35) : Colors.transparent,
      child: child,
    );
  }
}

/// The three-tap check-in, inline: word + shape + colour, never colour alone.
class PalStateChoices extends StatelessWidget {
  const PalStateChoices({super.key, required this.onPick, this.selected});

  final ValueChanged<NervousState> onPick;
  final NervousState? selected;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final bigText = MediaQuery.textScalerOf(context).scale(10) > 13;
    Widget choice(NervousState st) {
      final on = selected == st;
      final fg = on ? (s.isSignal ? s.accentInk : s.accentText) : s.text;
      final radius = s.isSignal ? s.radiusControl : 16.0;
      return NpPressable(
        onTap: () => onPick(st),
        selected: on,
        semanticLabel: st.long,
        focusRadius: radius,
        minSize: const Size(44, 52),
        builder: (context, pressed, focused) => Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: 52),
          alignment: bigText ? Alignment.centerLeft : Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            color: on
                ? (s.isSignal ? s.accentFill : s.accentText.withValues(alpha: 0.14))
                : Colors.transparent,
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(
              color: on ? (s.isSignal ? s.shadow : s.accentText) : s.control,
              width: on ? 2 : 1.5,
            ),
          ),
          child: Flex(
            direction: bigText ? Axis.horizontal : Axis.vertical,
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              StateGlyph(shape: st.shape, color: on ? fg : stateTint(s, st), size: 13),
              SizedBox(width: bigText ? 10 : 0, height: bigText ? 0 : 4),
              Flexible(
                child: Text(
                  st.word,
                  textAlign: TextAlign.center,
                  style: s.fonts.body(13.5, fg, weight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final choices = [for (final st in NervousState.values) choice(st)];
    return Semantics(
      container: true,
      label: 'How are you right now?',
      explicitChildNodes: true,
      child: bigText
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (i, c) in choices.indexed) ...[if (i > 0) const SizedBox(height: 8), c],
              ],
            )
          : Row(
              children: [
                for (final (i, c) in choices.indexed) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(child: c),
                ],
              ],
            ),
    );
  }
}

/// A thin, still progress bar (it only fills as time passes).
class PalProgress extends StatelessWidget {
  const PalProgress({super.key, required this.value, required this.label});

  final double value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final v = value.clamp(0.0, 1.0);
    return Semantics(
      container: true,
      label: label,
      value: '${(v * 100).round()}%',
      child: ExcludeSemantics(
        child: Container(
          height: 8,
          decoration: BoxDecoration(
            color: s.isSignal ? s.panelSolid : s.textFaint.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(s.isSignal ? 2 : 4),
            border: s.isSignal ? Border.all(color: s.line) : null,
          ),
          clipBehavior: Clip.antiAlias,
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: v,
            heightFactor: 1,
            child: ColoredBox(color: s.accentFill),
          ),
        ),
      ),
    );
  }
}

/// Pal's careful answer to a message that sounds like a crisis: the reply,
/// the way to the calming steps, and people to call. Nothing was sent.
class PalCrisisReply extends StatelessWidget {
  const PalCrisisReply({super.key, required this.reply, required this.onCalm, this.showReply = true});

  final String reply;
  final VoidCallback onCalm;

  /// False when the reply text is already on screen (a chat bubble).
  final bool showReply;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return PalCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (showReply) ...[
            Text(reply, style: s.fonts.body(15.5, s.text, height: 1.5)),
            const SizedBox(height: 14),
          ],
          Align(
            alignment: Alignment.centerLeft,
            child: NpButton(
              label: 'Open the calming steps',
              icon: Icons.spa_outlined,
              onPressed: onCalm,
            ),
          ),
          const SizedBox(height: 18),
          const HelpLines(compact: true),
        ],
      ),
    );
  }
}

// Pal's assistant sheet (the Expo app's PalSheet): Pal's face and a
// greeting that follows the check-in, then five tools — What now? · Break it
// down · Brain dump · Sit with me · Talk. All but Talk work offline. A
// running (or just finished) sit is what you came back for, so the sheet
// opens on it. "All tools" leads from a tool back to the list; Android's
// Back and the Close button close the sheet. (NpSheetFrame's Close goes
// through maybePop, as Back does: a PopScope that sent Back to the list
// would hold the Close button back too.)

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_routes.dart';
import '../data/models.dart';
import '../day/day_models.dart';
import '../day/day_store.dart';
import '../home/home_logic.dart' show helloFor, moodFor;
import '../reader/reader_controller.dart';
import '../theme/appearance_controller.dart';
import '../theme/np_style.dart';
import '../theme/pal.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_pressable.dart';
import '../widgets/np_sheet.dart';
import '../widgets/np_text.dart';
import 'pal_avatar.dart';
import 'pal_bits.dart';
import 'pal_breakdown.dart';
import 'pal_controller.dart';
import 'pal_dump.dart';
import 'pal_logic.dart';
import 'pal_now.dart';
import 'pal_sit.dart';
import 'pal_talk.dart';

/// Opens Pal. [tool] opens straight on one tool; [from] is the route of
/// the screen underneath (so "the calming steps" never stacks a second
/// copy of the screen you are on).
Future<void> showPalSheet(BuildContext context, {PalTool? tool, String? from}) {
  final pal = context.read<AppearanceController>().appearance.pal;
  final sitting = context.read<PalController>().sit != null;
  return showNpSheet<void>(
    context,
    title: pal.name,
    builder: (_) => PalSheet(initial: tool ?? (sitting ? PalTool.sit : null), from: from),
  );
}

class PalSheet extends StatefulWidget {
  const PalSheet({super.key, this.initial, this.from});

  final PalTool? initial;
  final String? from;

  @override
  State<PalSheet> createState() => _PalSheetState();
}

class _PalSheetState extends State<PalSheet> {
  late PalTool? _tool = widget.initial;

  void _open(PalTool? tool) => setState(() => _tool = tool);

  /// Leaves the sheet for the calming steps.
  void _goCalm() {
    final navigator = Navigator.of(context);
    navigator.pop();
    if (widget.from != AppRoutes.calm) unawaited(navigator.pushNamed(AppRoutes.calm));
  }

  /// Leaves the sheet for the reader, on [doc].
  void _goRead(DocumentSummary doc) {
    final navigator = Navigator.of(context);
    final reader = context.read<ReaderController>();
    navigator.pop();
    unawaited(reader.open(doc));
    if (widget.from != AppRoutes.reader) unawaited(navigator.pushNamed(AppRoutes.reader));
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final pal = context.select<AppearanceController, PalSettings>((a) => a.appearance.pal);
    final state = context.select<DayStore, NervousState?>((d) => d.state);
    final tool = _tool;

    final Widget content;
    switch (tool) {
      case PalTool.talk:
        content = PalTalkPanel(pal: pal, onCalm: _goCalm);
      case null:
        content = _scroll(_ToolList(pal: pal, onOpen: _open));
      case PalTool.now:
        content = _scroll(PalNowPanel(pal: pal, onTool: _open, onCalm: _goCalm, onRead: _goRead));
      case PalTool.breakdown:
        content = _scroll(PalBreakdownPanel(pal: pal, onCalm: _goCalm, onSit: () => _open(PalTool.sit)));
      case PalTool.dump:
        content = _scroll(PalDumpPanel(pal: pal));
      case PalTool.sit:
        content = _scroll(PalSitPanel(pal: pal));
    }

    // Pal's face and greeting give way when the sheet is short (a small
    // phone, big text, the keyboard up), so the tool and its text field
    // always fit. The greeting is no live region for that reason: it would
    // be read out again each time it came back. (What now?'s check-in says
    // what changed itself.)
    return LayoutBuilder(
      builder: (context, constraints) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (constraints.maxHeight >= 172 * palTextScale(context) + 120)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 18, 4),
              child: Row(
                children: [
                  PalAvatar(pal: pal, size: 58, mood: moodFor(state)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (s.isSignal) const NpLabel('Pal · your assistant'),
                        Text(
                          helloFor(pal, state),
                          style: s.fonts.body(14.5, s.textMuted, height: 1.35),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          if (tool != null)
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(left: 6),
                child: NpPressable(
                  onTap: () => _open(null),
                  semanticLabel: 'Back to all of ${pal.name}’s tools',
                  focusRadius: s.radiusControl,
                  builder: (context, pressed, focused) => Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.arrow_back_rounded, size: 18, color: s.textMuted),
                        const SizedBox(width: 6),
                        Text(
                          'All tools',
                          style: s.fonts.body(14, s.textMuted, weight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          Flexible(child: content),
        ],
      ),
    );
  }

  Widget _scroll(Widget child) => SingleChildScrollView(
    // A fresh scroll position per tool: each opens at its top.
    key: ValueKey<PalTool?>(_tool),
    padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
    child: child,
  );
}

/// The five tools, and the bubble switch.
class _ToolList extends StatelessWidget {
  const _ToolList({required this.pal, required this.onOpen});

  final PalSettings pal;
  final ValueChanged<PalTool> onOpen;

  static const _icons = {
    PalTool.now: Icons.near_me_outlined,
    PalTool.breakdown: Icons.call_split_rounded,
    PalTool.dump: Icons.inbox_outlined,
    PalTool.sit: Icons.self_improvement_rounded,
    PalTool.talk: Icons.chat_bubble_outline_rounded,
  };

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final controller = context.watch<PalController>();
    final dumpCount = context.select<DayStore, int>((d) => d.dump.length);
    final sit = controller.sit;

    String sub(PalTool t) {
      if (t == PalTool.dump && dumpCount > 0) return '$dumpCount saved';
      if (t == PalTool.sit && sit != null) {
        return sit.ended
            ? 'Done. Want to note it?'
            : 'Sitting with you · ${leftLabel(sit.endsAt, controller.nowMs())}';
      }
      if (t == PalTool.talk) return 'A short chat with ${pal.name}';
      return t.sub;
    }

    final hidden = controller.bubbleHidden;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final t in PalTool.values) ...[
          _ToolRow(icon: _icons[t]!, title: t.title, sub: sub(t), onTap: () => onOpen(t)),
          SizedBox(height: s.isSignal ? 10 : 8),
        ],
        const SizedBox(height: 8),
        Divider(color: s.line.withValues(alpha: 0.6), height: 1),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: NpButton(
            label: hidden ? 'Show the bubble' : 'Hide the bubble',
            icon: hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
            kind: NpButtonKind.ghost,
            semanticLabel: hidden
                ? 'Show ${pal.name}’s floating bubble again'
                : 'Hide ${pal.name}’s floating bubble',
            onPressed: () => controller.setBubbleHidden(!hidden),
          ),
        ),
        const SizedBox(height: 8),
        Semantics(
          liveRegion: true,
          child: Text(
            hidden
                ? 'The bubble is hidden. ${pal.name} is in the menu, and Settings can '
                      'show the bubble again.'
                : '${pal.name} is in the menu too, so hiding the bubble never hides '
                      '${pal.name}.',
            style: s.fonts.body(13.5, s.textMuted),
          ),
        ),
      ],
    );
  }
}

class _ToolRow extends StatelessWidget {
  const _ToolRow({required this.icon, required this.title, required this.sub, required this.onTap});

  final IconData icon;
  final String title;
  final String sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final radius = s.isSignal ? s.radiusMedium : 16.0;
    return NpPressable(
      onTap: onTap,
      semanticLabel: '$title, $sub',
      focusRadius: radius,
      minSize: const Size(kNpTarget, 62),
      builder: (context, pressed, focused) => Container(
        width: double.infinity,
        constraints: const BoxConstraints(minHeight: 62),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: pressed ? s.accentText.withValues(alpha: 0.12) : s.surfaceHigh,
          borderRadius: BorderRadius.circular(radius),
          border: s.isSignal ? Border.all(color: s.line, width: 1.5) : null,
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: s.isSignal ? s.accentFill : s.accentText.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(s.isSignal ? s.radiusControl : 12),
                border: s.isSignal ? Border.all(color: s.shadow, width: 1.5) : null,
              ),
              child: Icon(icon, size: 20, color: s.isSignal ? s.accentInk : s.accentText),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: s.fonts.body(15.5, s.text, weight: FontWeight.w700)),
                  const SizedBox(height: 1),
                  Text(sub, style: s.fonts.body(13.5, s.textMuted)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, size: 22, color: s.textMuted),
          ],
        ),
      ),
    );
  }
}

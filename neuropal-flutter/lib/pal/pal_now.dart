// "What now?": ONE next step for this moment, with a reason (Pal's local
// brain, suggestionsFor). "Something else" moves on; a new check-in starts
// the list over. Overwhelmed: no chatter, just the step. All on the phone:
// nothing here is sent anywhere.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../data/models.dart';
import '../day/day_models.dart';
import '../day/day_store.dart';
import '../library/library_controller.dart';
import '../theme/np_style.dart';
import '../theme/pal.dart';
import '../widgets/np_buttons.dart';
import 'pal_bits.dart';
import 'pal_controller.dart';
import 'pal_logic.dart';

class PalNowPanel extends StatefulWidget {
  const PalNowPanel({
    super.key,
    required this.pal,
    required this.onTool,
    required this.onCalm,
    required this.onRead,
  });

  final PalSettings pal;
  final ValueChanged<PalTool> onTool;
  final VoidCallback onCalm;
  final ValueChanged<DocumentSummary> onRead;

  @override
  State<PalNowPanel> createState() => _PalNowPanelState();
}

class _PalNowPanelState extends State<PalNowPanel> {
  /// Which suggestion, for which check-in (a new check-in starts over).
  NervousState? _forState;
  int _index = 0;
  String? _acked;

  /// "Within 30 minutes" and "night" depend on the time: look again calmly.
  Timer? _minute;

  @override
  void initState() {
    super.initState();
    _forState = context.read<DayStore>().state;
    _minute = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _minute?.cancel();
    super.dispose();
  }

  void _doIt(Suggestion s) {
    final pal = widget.pal;
    switch (s.action) {
      case CalmAction():
        widget.onCalm();
      case OpenToolAction(:final tool):
        widget.onTool(tool);
      case AckAction():
        setState(() => _acked = s.id);
        palAnnounce(context, '${pal.name}: ${palSay(pal, 'ack')}');
      case SitAction(:final minutes, :final label, :final taskId, :final anchorId):
        context.read<PalController>().startSit(
          minutes: minutes,
          label: label,
          taskId: taskId,
          anchorId: anchorId,
        );
        palAnnounce(context, '${pal.name}: ${palSay(pal, 'sitStart')}');
        widget.onTool(PalTool.sit);
      case ReadAction(:final document, :final minutes, :final label):
        context.read<PalController>().startSit(minutes: minutes, label: label);
        widget.onRead(document);
    }
  }

  String _what(Suggestion s) => switch (s.action) {
    CalmAction() => 'open the calming steps',
    OpenToolAction(:final tool) => tool == PalTool.dump ? 'open the brain dump' : 'open Break it down',
    AckAction() => 'okay',
    SitAction(:final minutes) => 'start $minutes minutes with ${widget.pal.name}',
    ReadAction(:final minutes) => 'open the reader and start $minutes minutes with ${widget.pal.name}',
  };

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final pal = widget.pal;
    final store = context.watch<DayStore>();
    final library = context.watch<LibraryController>();
    final state = store.state;
    if (state != _forState) {
      // A new check-in: the list starts over (no setState needed in build).
      _forState = state;
      _index = 0;
      _acked = null;
    }
    final list = suggestionsFor(
      state: state,
      now: store.now(),
      today: store.today,
      anchors: store.anchors,
      tasks: store.tasks,
      pal: pal,
      signal: s.isSignal,
      reading: unfinishedReading(library.documents),
    );
    final sug = list[_index % list.length];
    final acked = _acked == sug.id;
    final calm = sug.action is CalmAction;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const PalTitle('What now?'),
        if (state != NervousState.red) PalIntro(palSay(pal, 'now')),
        if (state == null) ...[
          const SizedBox(height: 14),
          Text(
            'You haven’t checked in. How are you right now?',
            style: s.fonts.body(15, s.text, weight: FontWeight.w600),
          ),
          const SizedBox(height: 10),
          PalStateChoices(
            onPick: (st) {
              store.recordCheckin(st, st.middle);
              palAnnounce(context, 'Checked in: ${st.word}.');
            },
          ),
        ],
        const SizedBox(height: 14),
        PalCard(
          accent: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Semantics(
                liveRegion: true,
                container: true,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(sug.title, style: s.fonts.displaySemi(19, s.text)),
                    const SizedBox(height: 6),
                    Text(sug.why, style: s.fonts.body(14.5, s.textMuted, height: 1.45)),
                  ],
                ),
              ),
              if (acked) ...[
                const SizedBox(height: 12),
                Text(
                  palSay(pal, 'ack'),
                  style: s.fonts.body(15, s.accentText, weight: FontWeight.w700),
                ),
              ],
              const SizedBox(height: 14),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  if (!acked)
                    NpButton(
                      label: calm ? 'Open the calming steps' : 'Do it',
                      icon: calm ? Icons.spa_outlined : Icons.arrow_forward_rounded,
                      semanticLabel: calm ? null : 'Do it: ${_what(sug)}',
                      onPressed: () => _doIt(sug),
                    ),
                  NpButton(
                    label: 'Something else',
                    kind: NpButtonKind.ghost,
                    onPressed: () => setState(() {
                      _acked = null;
                      _index += 1;
                    }),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (state == NervousState.red) ...[
          const SizedBox(height: 14),
          Text(
            'Nothing else is needed from you right now.',
            style: s.fonts.body(14.5, s.textMuted),
          ),
        ],
      ],
    );
  }
}

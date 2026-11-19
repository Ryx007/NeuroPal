// "Sit with me": body doubling. Pick 10, 25 or 45 minutes; Pal stays with a
// calm timer (minutes, not ticking seconds), asks once at halfway ("Still
// with it? Either answer is fine."), and at the end offers to note what you
// did. The clock lives in PalController, so the session keeps going when
// the sheet closes or the app restarts. No notifications this round: the
// bubble's pill and Home's Focus tile show it instead.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../day/day_models.dart';
import '../day/day_store.dart';
import '../home/home_logic.dart' show moodFor;
import '../theme/np_style.dart';
import '../theme/pal.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_pressable.dart';
import 'pal_avatar.dart';
import 'pal_bits.dart';
import 'pal_controller.dart';
import 'pal_logic.dart';
import 'pal_models.dart';

const String _notReally = 'That’s okay. Stop here, or keep going?';

class PalSitPanel extends StatelessWidget {
  const PalSitPanel({super.key, required this.pal});

  final PalSettings pal;

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<PalController>();
    final sit = controller.sit;
    if (sit == null) return _SitPicker(pal: pal, last: controller.sitNotes.firstOrNull);
    if (sit.ended) return _SitEnded(key: ValueKey('ended:${sit.id}'), pal: pal, sit: sit);
    return _SitRunning(key: ValueKey('running:${sit.id}'), pal: pal, sit: sit);
  }
}

class _SitPicker extends StatefulWidget {
  const _SitPicker({required this.pal, required this.last});

  final PalSettings pal;
  final PalSitNote? last;

  @override
  State<_SitPicker> createState() => _SitPickerState();
}

class _SitPickerState extends State<_SitPicker> {
  final _label = TextEditingController();

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  void _start(int minutes) {
    final pal = widget.pal;
    context.read<PalController>().startSit(minutes: minutes, label: _label.text);
    palAnnounce(context, '${pal.name}: ${palSay(pal, 'sitStart')}');
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final pal = widget.pal;
    final last = widget.last;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const PalTitle('Sit with me'),
        PalIntro(palSay(pal, 'sit')),
        const SizedBox(height: 14),
        TextField(
          controller: _label,
          maxLength: kSitLabelMax,
          textCapitalization: TextCapitalization.sentences,
          style: s.fonts.body(16, s.text),
          decoration: const InputDecoration(
            labelText: 'What are you working on? (optional)',
            counterText: '',
          ),
        ),
        const SizedBox(height: 14),
        Semantics(
          container: true,
          label: 'How long',
          explicitChildNodes: true,
          child: Row(
            children: [
              for (final (i, m) in kSitLengths.indexed) ...[
                if (i > 0) const SizedBox(width: 10),
                Expanded(child: _LengthButton(minutes: m, palName: pal.name, onTap: () => _start(m))),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        PalIntro('Quiet company can make starting easier. You can stop any time.', size: 14),
        if (last != null)
          PalIntro('Last time: ${last.minutes} min${last.note.isEmpty ? '' : ' · ${last.note}'}', size: 14),
      ],
    );
  }
}

class _LengthButton extends StatelessWidget {
  const _LengthButton({required this.minutes, required this.palName, required this.onTap});

  final int minutes;
  final String palName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final radius = s.isSignal ? s.radiusMedium : 18.0;
    return NpPressable(
      onTap: onTap,
      semanticLabel: 'Sit with $palName for $minutes minutes',
      focusRadius: radius,
      minSize: const Size(kNpTarget, 76),
      builder: (context, pressed, focused) => Container(
        width: double.infinity,
        constraints: const BoxConstraints(minHeight: 76),
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: pressed
              ? s.accentText.withValues(alpha: 0.16)
              : (s.isSignal ? s.surfaceHigh : s.accentText.withValues(alpha: 0.08)),
          borderRadius: BorderRadius.circular(radius),
          border: Border.all(
            color: s.isSignal ? s.control : s.accentText.withValues(alpha: 0.45),
            width: s.isSignal ? 1.5 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('$minutes', style: s.fonts.display(28, s.text)),
            const SizedBox(height: 2),
            Text('MIN', style: s.fonts.label(s.textMuted, size: 11.5)),
          ],
        ),
      ),
    );
  }
}

class _SitRunning extends StatefulWidget {
  const _SitRunning({super.key, required this.pal, required this.sit});

  final PalSettings pal;
  final PalSit sit;

  @override
  State<_SitRunning> createState() => _SitRunningState();
}

class _SitRunningState extends State<_SitRunning> {
  bool _notReallyAsked = false;

  void _end() {
    final pal = widget.pal;
    context.read<PalController>().endSit();
    // The pressed button is gone; the end prompt replaced it.
    palAnnounce(context, '${pal.name}: ${palSay(pal, 'sitEnd')}');
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final pal = widget.pal;
    final sit = widget.sit;
    final controller = context.read<PalController>();
    final state = context.select<DayStore, NervousState?>((d) => d.state);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(child: PalAvatar(pal: pal, size: 128, mood: moodFor(state))),
        // Minutes, not seconds; not a live region (it would talk every
        // minute): the halfway question and the end are read out instead.
        ValueListenableBuilder<int>(
          valueListenable: controller.clock,
          builder: (context, _, _) {
            final now = controller.nowMs();
            final left = leftLabel(sit.endsAt, now);
            final total = sit.endsAt - sit.startedAt;
            final done = total <= 0 ? 0.0 : ((now - sit.startedAt) / total).clamp(0.0, 1.0);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 6),
                Semantics(
                  label: '${pal.name} is sitting with you. $left.',
                  excludeSemantics: true,
                  child: Text(
                    left,
                    textAlign: TextAlign.center,
                    style: s.fonts.display(s.isSignal ? 38 : 34, s.text),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  sit.label.isEmpty ? 'Just company. No task needed.' : 'Working on: ${sit.label}',
                  textAlign: TextAlign.center,
                  style: s.fonts.body(14.5, s.textMuted),
                ),
                const SizedBox(height: 14),
                PalProgress(value: done, label: 'This sit, done so far'),
              ],
            );
          },
        ),
        const SizedBox(height: 4),
        if (sit.checkIn == SitCheck.asked) ...[
          const SizedBox(height: 10),
          PalCard(
            accent: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Semantics(
                  liveRegion: true,
                  child: Text(
                    _notReallyAsked ? _notReally : palSay(pal, 'sitCheck'),
                    style: s.fonts.body(15.5, s.text, weight: FontWeight.w600),
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: _notReallyAsked
                      ? [
                          NpButton(label: 'Stop here', onPressed: _end),
                          NpButton(
                            label: 'Keep going',
                            kind: NpButtonKind.ghost,
                            onPressed: () => controller.answerSitCheck(SitCheck.no),
                          ),
                        ]
                      : [
                          NpButton(
                            label: 'Still going',
                            onPressed: () => controller.answerSitCheck(SitCheck.yes),
                          ),
                          NpButton(
                            label: 'Not really',
                            kind: NpButtonKind.ghost,
                            onPressed: () {
                              setState(() => _notReallyAsked = true);
                              palAnnounce(context, '${pal.name}: $_notReally');
                            },
                          ),
                        ],
                ),
              ],
            ),
          ),
        ] else
          PalIntro(palSay(pal, 'sitStart'), center: true),
        const SizedBox(height: 16),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 10,
          runSpacing: 10,
          children: [
            NpButton(
              label: 'I’m done',
              icon: Icons.check_rounded,
              semanticLabel: 'I’m done: end the sit',
              onPressed: _end,
            ),
            NpButton(
              label: 'Stop early',
              kind: NpButtonKind.ghost,
              semanticLabel: 'Stop the sit early',
              onPressed: _end,
            ),
          ],
        ),
      ],
    );
  }
}

class _SitEnded extends StatefulWidget {
  const _SitEnded({super.key, required this.pal, required this.sit});

  final PalSettings pal;
  final PalSit sit;

  @override
  State<_SitEnded> createState() => _SitEndedState();
}

class _SitEndedState extends State<_SitEnded> {
  final _note = TextEditingController();
  bool _ticked = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final pal = widget.pal;
    final sit = widget.sit;
    final store = context.watch<DayStore>();
    final controller = context.read<PalController>();
    final taskId = sit.taskId;
    final task = taskId == null
        ? null
        : store.tasks.where((t) => t.id == taskId).firstOrNull;
    final spentMs = (sit.endedAt ?? sit.endsAt) - sit.startedAt;
    final spent = (spentMs / 60000).round() < 1 ? 1 : (spentMs / 60000).round();
    final summary = sit.endReason == SitEnd.time
        ? 'That was ${sit.minutes} ${sit.minutes == 1 ? 'minute' : 'minutes'}'
              '${sit.label.isEmpty ? '' : ' on ${sit.label}'}.'
        : 'You stopped after $spent ${spent == 1 ? 'minute' : 'minutes'}. That counts.';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(child: PalAvatar(pal: pal, size: 96)),
        const SizedBox(height: 6),
        PalTitle(palSay(pal, 'sitEnd')),
        PalIntro(summary),
        if (task != null && !store.isTaskDone(task) && !_ticked) ...[
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: NpButton(
              label: 'Tick off “${task.title}”',
              icon: Icons.check_rounded,
              kind: NpButtonKind.ghost,
              semanticLabel: 'Tick “${task.title}” off today’s list',
              onPressed: () {
                store.setTaskDone(task.id, true);
                setState(() => _ticked = true);
                palAnnounce(context, 'Ticked off today’s list.');
              },
            ),
          ),
        ],
        if (_ticked) ...[
          const SizedBox(height: 10),
          Text(
            'Ticked off today’s list.',
            style: s.fonts.body(15, s.accentText, weight: FontWeight.w700),
          ),
        ],
        const SizedBox(height: 14),
        TextField(
          controller: _note,
          maxLength: kSitNoteMax,
          minLines: 2,
          maxLines: 4,
          textCapitalization: TextCapitalization.sentences,
          style: s.fonts.body(16, s.text),
          decoration: const InputDecoration(
            labelText: 'What did you do? (optional)',
            counterText: '',
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            NpButton(
              label: 'Save note',
              icon: Icons.edit_note_rounded,
              onPressed: _note.text.trim().isEmpty
                  ? null
                  : () {
                      controller.saveSitNote(_note.text);
                      // The panel moves on to the picker: say it worked.
                      palAnnounce(context, 'Saved.');
                    },
            ),
            NpButton(label: 'Not now', kind: NpButtonKind.ghost, onPressed: controller.clearSit),
          ],
        ),
      ],
    );
  }
}

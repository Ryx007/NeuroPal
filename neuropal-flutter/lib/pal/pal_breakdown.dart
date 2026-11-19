// "Break it down": a big task in, three to seven tiny steps out, from the
// server's AI (POST /api/pal/breakdown). Without the server (offline, busy,
// an answer that doesn't work) Pal's offline steps take over and the panel
// says so; after six seconds it offers them without waiting. The steps are
// a checklist; any step can go on today's minimum day; "Do step 1 with me"
// starts a sit.
//
// CRISIS SAFETY: the task is checked on the phone first. One that sounds
// like a crisis is never sent: Pal answers here with the careful reply, the
// help lines and the way to the calming steps. The server's own
// `crisis: true` answer is shown the same way.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../day/day_store.dart';
import '../theme/np_style.dart';
import '../theme/pal.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_pressable.dart';
import 'crisis.dart';
import 'pal_api.dart';
import 'pal_bits.dart';
import 'pal_controller.dart';
import 'pal_logic.dart';

const String _slowLine = 'Still thinking. Quick steps are ready if you’d rather not wait.';

String _stepsLine(int n) => '$n small ${n == 1 ? 'step' : 'steps'}';

class PalBreakdownPanel extends StatefulWidget {
  const PalBreakdownPanel({super.key, required this.pal, required this.onCalm, required this.onSit});

  final PalSettings pal;
  final VoidCallback onCalm;

  /// "Do step 1 with me" started a sit: show it.
  final VoidCallback onSit;

  @override
  State<PalBreakdownPanel> createState() => _PalBreakdownPanelState();
}

class _Result {
  const _Result(this.steps, this.offline);
  final List<String> steps;
  final OfflineReason? offline;
}

class _PalBreakdownPanelState extends State<PalBreakdownPanel> {
  final _task = TextEditingController();
  final _field = FocusNode();
  bool _loading = false;
  bool _slow = false;
  _Result? _result;
  String? _crisis;
  String? _problem;
  final Set<int> _ticked = {};
  final Set<int> _added = {};

  /// Bumped by every new request (and by closing): an older answer is
  /// dropped.
  int _request = 0;
  Timer? _slowTimer;

  @override
  void dispose() {
    _request += 1;
    _slowTimer?.cancel();
    _task.dispose();
    _field.dispose();
    super.dispose();
  }

  void _showCrisis(String reply) {
    _slowTimer?.cancel();
    // The keyboard goes down so the careful reply and the people to call
    // are on screen.
    _field.unfocus();
    setState(() {
      _result = null;
      _loading = false;
      _slow = false;
      _crisis = reply;
    });
    palAnnounce(context, reply, assertive: true);
  }

  void _show(_Result r) {
    _slowTimer?.cancel();
    setState(() {
      _crisis = null;
      _result = r;
      _ticked.clear();
      _added.clear();
      _loading = false;
      _slow = false;
    });
    final note = r.offline == null ? '' : ' ${r.offline!.note}';
    palAnnounce(context, '${_stepsLine(r.steps.length)}.$note');
  }

  Future<void> _run() async {
    final t = _task.text.trim();
    if (t.isEmpty) {
      const problem = 'Type the task first. Anything goes, big or small.';
      setState(() => _problem = problem);
      _field.requestFocus();
      palAnnounce(context, problem);
      return;
    }
    if (_loading) return;
    setState(() => _problem = null);
    // Safety first, on the phone: nothing is sent.
    if (looksLikeCrisis(t)) {
      _showCrisis(kCrisisReply);
      return;
    }
    final token = ++_request;
    setState(() {
      _loading = true;
      _slow = false;
      _result = null;
      _crisis = null;
    });
    palAnnounce(context, 'Making the steps…');
    _slowTimer?.cancel();
    _slowTimer = Timer(const Duration(seconds: 6), () {
      if (!mounted || token != _request || !_loading) return;
      setState(() => _slow = true);
      palAnnounce(context, _slowLine);
    });
    final PalBreakdownResult r = await context.read<PalController>().api.breakdown(t);
    if (!mounted || token != _request) return;
    if (r.crisis) {
      _showCrisis(r.reply ?? kCrisisReply);
    } else {
      _show(_Result(r.steps, r.offline));
    }
  }

  /// Pal's offline steps now, instead of waiting for the server.
  void _quick() {
    _request += 1; // the server's answer, when it comes, is dropped
    final t = _task.text.trim();
    if (looksLikeCrisis(t)) {
      _showCrisis(kCrisisReply);
      return;
    }
    _show(_Result(localBreakdown(t), OfflineReason.quick));
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final pal = widget.pal;
    final result = _result;
    final crisis = _crisis;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const PalTitle('Break it down'),
        PalIntro(palSay(pal, 'breakdown')),
        const SizedBox(height: 14),
        TextField(
          controller: _task,
          focusNode: _field,
          maxLength: kTaskMaxChars,
          textCapitalization: TextCapitalization.sentences,
          textInputAction: TextInputAction.go,
          style: s.fonts.body(16, s.text),
          decoration: InputDecoration(
            labelText: 'The task',
            hintText: 'e.g. write the intro of my thesis',
            counterText: '',
            errorText: _problem,
            errorMaxLines: 2,
            errorStyle: s.fonts.body(13.5, s.error, weight: FontWeight.w600),
          ),
          onChanged: (_) {
            if (_problem != null) setState(() => _problem = null);
          },
          onSubmitted: (_) => unawaited(_run()),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            NpButton(
              label: 'Break it down',
              icon: Icons.call_split_rounded,
              onPressed: _loading ? null : () => unawaited(_run()),
            ),
            if (_loading && _slow)
              NpButton(label: 'Use quick steps now', kind: NpButtonKind.ghost, onPressed: _quick),
          ],
        ),
        if (_loading) ...[
          const SizedBox(height: 12),
          Text(_slow ? _slowLine : 'Making the steps…', style: s.fonts.body(14.5, s.textMuted)),
        ],
        if (crisis != null) ...[
          const SizedBox(height: 14),
          PalCrisisReply(reply: crisis, onCalm: widget.onCalm),
        ],
        if (result != null) ...[
          const SizedBox(height: 14),
          _steps(context, result),
        ],
      ],
    );
  }

  Widget _steps(BuildContext context, _Result result) {
    final s = NpStyle.of(context);
    final pal = widget.pal;
    final store = context.read<DayStore>();
    final n = result.steps.length;
    return PalCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: 10,
            runSpacing: 4,
            children: [
              Semantics(
                header: true,
                child: Text(_stepsLine(n), style: s.fonts.body(16, s.text, weight: FontWeight.w700)),
              ),
              Text('${_ticked.length} of $n done', style: s.fonts.mono(13, s.textMuted)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Tick steps off as you go. The plus adds a step to today’s minimum day.',
            style: s.fonts.body(13.5, s.textMuted),
          ),
          const SizedBox(height: 8),
          for (final (i, step) in result.steps.indexed)
            _StepRow(
              index: i,
              step: step,
              ticked: _ticked.contains(i),
              added: _added.contains(i),
              onTick: () => setState(() {
                if (!_ticked.remove(i)) _ticked.add(i);
              }),
              onAdd: () {
                if (_added.contains(i)) return;
                // Steps are already cut to a task title's length
                // (cleanSteps), so the day gets exactly what shows here.
                final already = store.tasks.any((t) => t.title == step);
                if (!already && !store.addTask(step)) return;
                setState(() => _added.add(i));
                palAnnounce(
                  context,
                  already ? '“$step” is already on your minimum day.' : 'Added “$step” to your minimum day.',
                );
              },
            ),
          if (result.offline != null) ...[
            const SizedBox(height: 8),
            Text(result.offline!.note, style: s.fonts.body(13.5, s.textMuted)),
          ],
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: NpButton(
              label: 'Do step 1 with me',
              icon: Icons.self_improvement_rounded,
              kind: NpButtonKind.ghost,
              semanticLabel: 'Do step 1 with me: ${result.steps.first}, for 10 minutes',
              onPressed: () {
                context.read<PalController>().startSit(minutes: 10, label: result.steps.first);
                palAnnounce(context, '${pal.name}: ${palSay(pal, 'sitStart')}');
                widget.onSit();
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// One step: a checkbox row (ticked = a check and struck through, never
/// colour alone) and the button that adds it to today's minimum day.
class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.index,
    required this.step,
    required this.ticked,
    required this.added,
    required this.onTick,
    required this.onAdd,
  });

  final int index;
  final String step;
  final bool ticked;
  final bool added;
  final VoidCallback onTick;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final box = Container(
      width: 28,
      height: 28,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: ticked ? s.accentFill : Colors.transparent,
        borderRadius: BorderRadius.circular(s.isSignal ? 4 : 8),
        border: Border.all(color: ticked ? s.accentFill : s.control, width: 2),
      ),
      child: ticked
          ? Icon(Icons.check_rounded, size: 18, color: s.accentInk)
          : Text('${index + 1}', style: s.fonts.mono(13, s.accentText, weight: FontWeight.w700)),
    );
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          Expanded(
            child: MergeSemantics(
              child: Semantics(
                checked: ticked,
                child: NpPressable(
                  onTap: onTick,
                  semanticLabel: 'Step ${index + 1}: $step',
                  focusRadius: s.radiusMedium,
                  minSize: const Size(kNpTarget, 48),
                  builder: (context, pressed, focused) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        ExcludeSemantics(child: box),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            step,
                            style: s.fonts
                                .body(15, ticked ? s.textMuted : s.text, height: 1.35)
                                .copyWith(
                                  decoration: ticked ? TextDecoration.lineThrough : null,
                                  decorationColor: s.textMuted,
                                ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 6),
          NpIconButton(
            icon: added ? Icons.check_rounded : Icons.playlist_add_rounded,
            semanticLabel: added ? '“$step” is on your minimum day' : 'Add “$step” to your minimum day',
            onPressed: added ? null : onAdd,
          ),
        ],
      ),
    );
  }
}

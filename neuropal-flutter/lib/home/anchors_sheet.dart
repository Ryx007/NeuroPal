// The anchors sheet: every anchor of the day by time, and the one being
// added or changed. Each has a time, a window it may move in (so it never
// has to be exact) and a kind. Delete has Undo. A port of the web app's
// AnchorsDialog.tsx, with the list and the editor as two views of one
// sheet (a phone has no room for both side by side).
//
// Screen readers: the time, the window and the kind are pickers TalkBack
// can work (the hour and minute are adjustable — swipe up or down — and
// have − / + buttons too); what just happened is read out (a live region).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:provider/provider.dart';

import '../day/day_models.dart';
import '../day/day_rules.dart';
import '../day/day_store.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_panel.dart';
import '../widgets/np_sheet.dart';
import '../widgets/np_text.dart';
import '../widgets/text_limit.dart';
import 'home_bits.dart';

/// Opens the sheet: on the list, or straight in the editor for [editId]
/// (or a new anchor with [add]).
Future<void> showAnchorsSheet(
  BuildContext context, {
  String? editId,
  bool add = false,
}) => showNpSheet<void>(
  context,
  title: 'Anchors',
  heightFactor: 0.92,
  builder: (_) => AnchorsSheet(editId: editId, add: add),
);

class AnchorsSheet extends StatefulWidget {
  const AnchorsSheet({super.key, this.editId, this.add = false});

  final String? editId;
  final bool add;

  @override
  State<AnchorsSheet> createState() => _AnchorsSheetState();
}

/// What the editor holds while you change it.
class _Draft {
  _Draft({
    required this.hour,
    required this.minute,
    required this.flex,
    required this.category,
  });

  int hour;
  int minute;
  int flex;
  AnchorCategory category;
}

const _newAnchor = '\u0000new';

class _AnchorsSheetState extends State<AnchorsSheet> {
  final _title = TextEditingController();
  final _details = TextEditingController();
  final _titleFocus = FocusNode();

  /// Null = the list; [_newAnchor] = a new one; else the id being edited.
  String? _editing;
  late _Draft _draft;
  String? _problem;
  String? _status;
  DayAnchor? _undo;

  @override
  void initState() {
    super.initState();
    final store = context.read<DayStore>();
    final target = widget.editId == null ? null : store.anchorById(widget.editId!);
    if (target != null) {
      _start(target);
    } else if (widget.add) {
      _start(null);
    } else {
      _draft = _blankDraft(store.now());
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _details.dispose();
    _titleFocus.dispose();
    super.dispose();
  }

  _Draft _blankDraft(DateTime now) => _Draft(
    hour: (now.hour + 1) % 24,
    minute: 0,
    flex: kDefaultFlex,
    category: AnchorCategory.other,
  );

  void _start(DayAnchor? a) {
    final store = context.read<DayStore>();
    _editing = a?.id ?? _newAnchor;
    _problem = null;
    _title.text = a?.title ?? '';
    _details.text = a?.subtitle ?? '';
    _draft = a == null
        ? _blankDraft(store.now())
        : _Draft(
            hour: a.hour,
            minute: a.minute,
            // A window that isn't one of the choices (another client's)
            // shows as the nearest choice and is saved only if changed.
            flex: kFlexChoices.contains(a.flex) ? a.flex : _nearestFlex(a.flex),
            category: a.kind,
          );
  }

  static int _nearestFlex(int m) {
    var best = kFlexChoices.first;
    for (final c in kFlexChoices) {
      if ((c - m).abs() < (best - m).abs()) best = c;
    }
    return best;
  }

  void _edit(DayAnchor? a) {
    setState(() => _start(a));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _titleFocus.requestFocus();
    });
  }

  void _cancel() => setState(() {
    _editing = null;
    _problem = null;
  });

  void _announce(String message) {
    if (MediaQuery.maybeSupportsAnnounceOf(context) ?? false) {
      unawaited(
        SemanticsService.sendAnnouncement(
          View.of(context),
          message,
          Directionality.of(context),
        ),
      );
    }
  }

  void _save() {
    final s = NpStyle.of(context);
    final store = context.read<DayStore>();
    final title = cleanText(_title.text, kTitleMax);
    if (title.isEmpty) {
      setState(() => _problem = 'Give the anchor a name.');
      _titleFocus.requestFocus();
      _announce('Give the anchor a name.');
      return;
    }
    final editing = _editing;
    final existing = editing == null || editing == _newAnchor
        ? null
        : store.anchorById(editing);
    final input = AnchorInput(
      title: title,
      subtitle: _details.text,
      hour: _draft.hour,
      minute: _draft.minute,
      // An untouched window from another client keeps its exact minutes.
      flexMinutes: existing != null && _draft.flex == _nearestFlex(existing.flex) &&
              !kFlexChoices.contains(existing.flex)
          ? existing.flex
          : _draft.flex,
      category: _draft.category,
    );
    if (existing != null) {
      store.updateAnchor(existing.id, input);
    } else {
      store.addAnchor(input);
    }
    setState(() {
      _editing = null;
      _problem = null;
      _undo = null;
      _status =
          'Saved “$title” at ${clockText(_draft.hour, _draft.minute, signal: s.isSignal)}.';
    });
  }

  void _remove(DayAnchor a) {
    final gone = context.read<DayStore>().removeAnchor(a.id);
    if (gone == null) return;
    setState(() {
      if (_editing == a.id) _editing = null;
      _status = 'Deleted “${a.title}”.';
      _undo = gone;
    });
  }

  void _restore() {
    final back = _undo;
    if (back == null) return;
    context.read<DayStore>().restoreAnchor(back);
    setState(() {
      _status = '“${back.title}” is back.';
      _undo = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final store = context.watch<DayStore>();
    final editing = _editing;
    return SingleChildScrollView(
      // A fresh scroll position per view: the editor opens at its top.
      key: ValueKey<String>(editing == null ? 'list' : 'editor:$editing'),
      padding: const EdgeInsets.fromLTRB(18, 4, 18, 24),
      child: editing == null
          ? _list(context, store)
          : _editor(context, editing == _newAnchor ? null : store.anchorById(editing)),
    );
  }

  Widget _list(BuildContext context, DayStore store) {
    final s = NpStyle.of(context);
    final anchors = store.anchors;
    final n = anchors.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Fixed points in your day: meds, breaks, study blocks. Each one has '
          'a window, so it never has to be exact.',
          style: s.fonts.body(15, s.textMuted),
        ),
        const SizedBox(height: 14),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 10,
          runSpacing: 8,
          children: [
            Semantics(
              header: true,
              child: NpLabel('Today · $n ${n == 1 ? 'anchor' : 'anchors'}'),
            ),
            NpButton(
              label: 'Add anchor',
              icon: Icons.add_rounded,
              onPressed: () => _edit(null),
            ),
          ],
        ),
        // What just happened, at the top: a saved anchor brings you back
        // here, and a phone shows the top of the list first.
        UndoStatus(text: _status, onUndo: _undo == null ? null : _restore),
        const SizedBox(height: 12),
        if (anchors.isEmpty)
          Text(
            'No anchors yet. Add one for meds, a break or a study block.',
            style: s.fonts.body(15, s.textMuted),
          )
        else
          for (final a in anchors) ...[
            _AnchorRow(
              anchor: a,
              done: store.isAnchorDone(a),
              onDone: (v) => store.setAnchorDone(a.id, v),
              onEdit: () => _edit(a),
              onDelete: () => _remove(a),
            ),
            const SizedBox(height: 10),
          ],
      ],
    );
  }

  Widget _editor(BuildContext context, DayAnchor? existing) {
    final s = NpStyle.of(context);
    final fieldLabel = s.fonts.body(15, s.textMuted);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: NpLabel(existing == null ? 'New anchor' : 'Edit · ${existing.title}'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _title,
          focusNode: _titleFocus,
          // No more than an anchor keeps (DAY-SYNC §8 "Text limits").
          maxLength: kTitleMax,
          inputFormatters: const [TextLimit(kTitleMax)],
          textCapitalization: TextCapitalization.sentences,
          style: s.fonts.body(16, s.text),
          decoration: InputDecoration(
            labelText: 'Name',
            hintText: 'e.g. Evening meds',
            counterText: '',
            errorText: _problem,
            errorMaxLines: 2,
            errorStyle: s.fonts.body(13.5, s.error, weight: FontWeight.w600),
          ),
          onChanged: (_) {
            if (_problem != null) setState(() => _problem = null);
          },
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _details,
          maxLength: kAnchorSubtitleMax,
          inputFormatters: const [TextLimit(kAnchorSubtitleMax)],
          textCapitalization: TextCapitalization.sentences,
          style: s.fonts.body(16, s.text),
          decoration: const InputDecoration(
            labelText: 'Details (optional)',
            hintText: 'e.g. with water',
            counterText: '',
          ),
        ),
        const SizedBox(height: 18),
        Semantics(header: true, child: Text('Time', style: fieldLabel)),
        const SizedBox(height: 6),
        _TimePicker(
          hour: _draft.hour,
          minute: _draft.minute,
          onChanged: (h, m) => setState(() {
            _draft
              ..hour = h
              ..minute = m;
          }),
        ),
        const SizedBox(height: 18),
        Semantics(header: true, child: Text('Window', style: fieldLabel)),
        const SizedBox(height: 4),
        Text(
          'How far it may move. Anywhere inside the window counts.',
          style: s.fonts.body(13.5, s.textMuted),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final m in kFlexChoices)
              NpChip(
                label: flexChoiceLabel(m),
                semanticLabel: 'Window: ${flexChoiceSpoken(m)}',
                selected: _draft.flex == m,
                onTap: () => setState(() => _draft.flex = m),
              ),
          ],
        ),
        const SizedBox(height: 18),
        Semantics(header: true, child: Text('Kind', style: fieldLabel)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final c in AnchorCategory.values)
              NpChip(
                label: c.label,
                semanticLabel: 'Kind: ${c.label}',
                selected: _draft.category == c,
                onTap: () => setState(() => _draft.category = c),
              ),
          ],
        ),
        const SizedBox(height: 22),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            NpButton(label: 'Save', icon: Icons.check_rounded, onPressed: _save),
            NpButton(label: 'Cancel', kind: NpButtonKind.ghost, onPressed: _cancel),
            if (existing != null)
              NpButton(
                label: 'Delete',
                icon: Icons.delete_outline_rounded,
                kind: NpButtonKind.ghost,
                semanticLabel: 'Delete ${existing.title}',
                onPressed: () => _remove(existing),
              ),
          ],
        ),
      ],
    );
  }
}

/// One anchor in the list: its time, kind and window, and Done today /
/// Edit / Delete.
class _AnchorRow extends StatelessWidget {
  const _AnchorRow({
    required this.anchor,
    required this.done,
    required this.onDone,
    required this.onEdit,
    required this.onDelete,
  });

  final DayAnchor anchor;
  final bool done;
  final ValueChanged<bool> onDone;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final a = anchor;
    final clock = anchorClock(a, signal: s.isSignal);
    final meta = [
      a.kind.label,
      windowLabel(a.flex),
      if (done) 'done today',
    ].join(' · ');
    return NpPanel(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 8),
      shadow: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MergeSemantics(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(clock, style: s.fonts.mono(15, s.text, weight: FontWeight.w700)),
                const SizedBox(width: 10),
                ExcludeSemantics(
                  child: Icon(categoryIcon(a.kind), size: 20, color: s.accentText),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        a.title,
                        style: s.fonts.body(15.5, s.text, weight: FontWeight.w700),
                      ),
                      if (a.subtitle.isNotEmpty)
                        Text(a.subtitle, style: s.fonts.body(13.5, s.textMuted)),
                      Text(meta, style: s.fonts.body(13.5, s.textMuted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            alignment: WrapAlignment.end,
            spacing: 6,
            runSpacing: 6,
            children: [
              NpChip(
                label: done ? 'Done today' : 'Mark done',
                // Starts with the visible words, so voice control can say them.
                semanticLabel: '${done ? 'Done today' : 'Mark done'}: ${a.title}',
                selected: done,
                onTap: () => onDone(!done),
              ),
              NpIconButton(
                icon: Icons.edit_outlined,
                semanticLabel: 'Edit ${a.title}',
                onPressed: onEdit,
              ),
              NpIconButton(
                icon: Icons.delete_outline_rounded,
                semanticLabel: 'Delete ${a.title}',
                onPressed: onDelete,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The hour and the minute, each adjustable by a screen reader (swipe up
/// or down), by − / + buttons, and by the arrow keys on those buttons.
/// Minutes move in steps of 5: an anchor has a window, it never has to be
/// exact.
class _TimePicker extends StatelessWidget {
  const _TimePicker({
    required this.hour,
    required this.minute,
    required this.onChanged,
  });

  final int hour;
  final int minute;
  final void Function(int hour, int minute) onChanged;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    String hourText(int h) => s.isSignal
        ? h.toString().padLeft(2, '0')
        : '${h % 12 == 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}';
    String hourSpoken(int h) => s.isSignal ? '$h hours' : hourText(h);
    String minuteText(int m) => m.toString().padLeft(2, '0');
    int up5(int m) => ((m ~/ 5) + 1) * 5 % 60;
    int down5(int m) => m % 5 != 0 ? m - m % 5 : (m + 55) % 60;

    final hourUnit = _Spinner(
      name: 'Hour',
      shown: hourText(hour),
      spoken: hourSpoken(hour),
      spokenUp: hourSpoken((hour + 1) % 24),
      spokenDown: hourSpoken((hour + 23) % 24),
      lessLabel: 'Earlier hour',
      moreLabel: 'Later hour',
      onUp: () => onChanged((hour + 1) % 24, minute),
      onDown: () => onChanged((hour + 23) % 24, minute),
    );
    final minuteUnit = _Spinner(
      name: 'Minute',
      shown: minuteText(minute),
      spoken: '$minute minutes',
      spokenUp: '${up5(minute)} minutes',
      spokenDown: '${down5(minute)} minutes',
      lessLabel: '5 minutes earlier',
      moreLabel: '5 minutes later',
      onUp: () => onChanged(hour, up5(minute)),
      onDown: () => onChanged(hour, down5(minute)),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 16,
          runSpacing: 10,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [hourUnit, minuteUnit],
        ),
        const SizedBox(height: 6),
        Text(
          'At ${clockText(hour, minute, signal: s.isSignal)}',
          style: s.fonts.mono(14, s.textMuted),
        ),
      ],
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner({
    required this.name,
    required this.shown,
    required this.spoken,
    required this.spokenUp,
    required this.spokenDown,
    required this.lessLabel,
    required this.moreLabel,
    required this.onUp,
    required this.onDown,
  });

  final String name;
  final String shown;
  final String spoken;
  final String spokenUp;
  final String spokenDown;
  final String lessLabel;
  final String moreLabel;
  final VoidCallback onUp;
  final VoidCallback onDown;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final row = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        NpIconButton(
          icon: Icons.remove_rounded,
          semanticLabel: lessLabel,
          onPressed: onDown,
        ),
        const SizedBox(width: 6),
        // Hugs its value; on a narrow phone at big text it takes what is
        // left between the buttons and the value wraps ("11 / AM").
        Flexible(
          child: Semantics(
            container: true,
            slider: true,
            label: name,
            value: spoken,
            increasedValue: spokenUp,
            decreasedValue: spokenDown,
            onIncrease: onUp,
            onDecrease: onDown,
            child: ExcludeSemantics(
              child: Container(
                constraints: const BoxConstraints(minWidth: 72, minHeight: 48),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: s.panelSolid,
                  borderRadius: BorderRadius.circular(s.radiusMedium),
                  border: Border.all(color: s.control, width: 1.5),
                ),
                child: Center(
                  widthFactor: 1,
                  heightFactor: 1,
                  child: Text(
                    shown,
                    textAlign: TextAlign.center,
                    style: s.fonts.mono(20, s.text, weight: FontWeight.w700),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 6),
        NpIconButton(
          icon: Icons.add_rounded,
          semanticLabel: moreLabel,
          onPressed: onUp,
        ),
      ],
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // The adjustable value already says its name to screen readers.
        ExcludeSemantics(child: NpLabel(name)),
        const SizedBox(height: 4),
        row,
      ],
    );
  }
}

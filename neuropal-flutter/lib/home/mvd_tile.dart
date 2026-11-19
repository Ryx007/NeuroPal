// The minimum viable day: three to five small things that make today
// count. A tick is for today only (it stops counting tomorrow by itself).
// Edit adds and removes, with Undo. A port of the web app's MvdTile.tsx.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../day/day_models.dart';
import '../day/day_store.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_pressable.dart';
import 'home_bits.dart';

class MvdTile extends StatefulWidget {
  const MvdTile({super.key, required this.size});

  final String size;

  @override
  State<MvdTile> createState() => _MvdTileState();
}

class _MvdTileState extends State<MvdTile> {
  final _draft = TextEditingController();
  bool _editing = false;
  bool _expanded = false;
  String? _status;
  DayTask? _undo;

  @override
  void dispose() {
    _draft.dispose();
    super.dispose();
  }

  void _add() {
    final title = _draft.text.trim();
    if (context.read<DayStore>().addTask(title)) {
      setState(() {
        _status = 'Added “${cleanText(title, kTitleMax)}”.';
        _undo = null;
        _draft.clear();
      });
    }
  }

  void _remove(DayTask t) {
    final gone = context.read<DayStore>().removeTask(t.id);
    if (gone == null) return;
    setState(() {
      _status = 'Removed “${t.title}”.';
      _undo = gone;
    });
  }

  void _restore() {
    final back = _undo;
    if (back == null) return;
    context.read<DayStore>().restoreTask(back);
    setState(() {
      _status = '“${back.title}” is back.';
      _undo = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final store = context.watch<DayStore>();
    final tasks = store.tasks;
    final remaining = store.remainingTasks;
    final size = widget.size;

    if (size == 'S' && !_expanded && !_editing) {
      final value = remaining > 0
          ? '$remaining small ${remaining == 1 ? 'thing' : 'things'} left today'
          : 'Everything for today is done';
      return OneLineTile(
        icon: Icons.checklist_rounded,
        label: 'Min. day',
        value: value,
        // The visible words first, so voice control can say them.
        semanticLabel: 'Min. day: $value. Show the list',
        onTap: () => setState(() => _expanded = true),
      );
    }

    final shown = size == 'M' && !_expanded && !_editing
        ? tasks.take(3).toList()
        : tasks;
    final hidden = tasks.length - shown.length;
    final leftWords = remaining > 0
        ? '$remaining ${remaining == 1 ? 'task' : 'tasks'} left'
        : 'All done';

    return HomeTileFrame(
      children: [
        TileHead(
          'Minimum viable day',
          trailing: [
            Semantics(
              label: leftWords,
              excludeSemantics: true,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  border: Border.all(color: s.accentText, width: 1.5),
                  borderRadius: BorderRadius.circular(s.isSignal ? 0 : 99),
                ),
                child: Text(
                  remaining > 0 ? '$remaining LEFT' : 'DONE',
                  style: s.fonts.label(s.accentText, size: 11),
                ),
              ),
            ),
            NpButton(
              label: _editing ? 'Done editing' : 'Edit',
              kind: NpButtonKind.ghost,
              semanticLabel: _editing ? 'Done editing tasks' : 'Edit tasks',
              onPressed: () => setState(() {
                _editing = !_editing;
                _status = null;
                _undo = null;
              }),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (tasks.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(
              'Nothing here yet. Add one small thing that would make today count.',
              style: s.fonts.body(15, s.textMuted),
            ),
          ),
        for (final (i, t) in shown.indexed)
          _CheckRow(
            task: t,
            first: i == 0,
            done: store.isTaskDone(t),
            editing: _editing,
            onToggle: () => store.toggleTask(t.id),
            onRemove: () => _remove(t),
          ),
        if (hidden > 0)
          Align(
            alignment: Alignment.centerLeft,
            child: NpButton(
              label: '+ $hidden more',
              kind: NpButtonKind.ghost,
              semanticLabel: 'Show $hidden more',
              onPressed: () => setState(() => _expanded = true),
            ),
          ),
        if (_expanded && size != 'L' && !_editing)
          Align(
            alignment: Alignment.centerLeft,
            child: NpButton(
              label: 'Show fewer',
              kind: NpButtonKind.ghost,
              onPressed: () => setState(() => _expanded = false),
            ),
          ),
        if (_editing) ...[
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: TextField(
                  controller: _draft,
                  maxLength: kTitleMax,
                  textCapitalization: TextCapitalization.sentences,
                  textInputAction: TextInputAction.done,
                  style: s.fonts.body(16, s.text),
                  decoration: const InputDecoration(
                    labelText: 'New task for today',
                    hintText: 'Add a task for today…',
                    counterText: '',
                  ),
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _add(),
                ),
              ),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: NpButton(
                  label: 'Add',
                  icon: Icons.add_rounded,
                  semanticLabel: 'Add task',
                  onPressed: _draft.text.trim().isEmpty ? null : _add,
                ),
              ),
            ],
          ),
        ],
        UndoStatus(text: _status, onUndo: _undo == null ? null : _restore),
      ],
    );
  }
}

/// One task: a checkbox row (done today = ticked and struck through, never
/// colour alone), and Remove while editing.
class _CheckRow extends StatelessWidget {
  const _CheckRow({
    required this.task,
    required this.first,
    required this.done,
    required this.editing,
    required this.onToggle,
    required this.onRemove,
  });

  final DayTask task;
  final bool first;
  final bool done;
  final bool editing;
  final VoidCallback onToggle;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final boxSize = s.isSignal ? 26.0 : 30.0;
    final box = Container(
      width: boxSize,
      height: boxSize,
      decoration: BoxDecoration(
        color: done ? s.accentFill : Colors.transparent,
        borderRadius: BorderRadius.circular(
          s.isSignal ? (s.radiusControl < 6 ? s.radiusControl : 6) : 9,
        ),
        border: Border.all(
          color: done
              ? (s.isSignal ? s.shadow : s.accentFill)
              : (s.isSignal ? s.control : s.accentText.withValues(alpha: 0.6)),
          width: 2,
        ),
      ),
      child: done ? Icon(Icons.check_rounded, size: 19, color: s.accentInk) : null,
    );
    final text = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          task.title,
          style: s.fonts
              .body(15.5, done ? s.textMuted : s.text, weight: FontWeight.w700)
              .copyWith(
                decoration: done ? TextDecoration.lineThrough : null,
                decorationColor: s.textMuted,
              ),
        ),
        if (task.subtitle.isNotEmpty)
          Text(
            task.subtitle,
            style: s.isSignal
                ? s.fonts.mono(12.5, s.textMuted)
                : s.fonts.body(13, s.textMuted),
          ),
      ],
    );

    // One checkbox for screen readers: "Stay hydrated, 2 glasses left,
    // checked". (NpPressable gives the focus ring, size and tap.)
    final row = MergeSemantics(
      child: Semantics(
        checked: done,
        child: NpPressable(
          onTap: onToggle,
          semanticLabel: task.subtitle.isEmpty
              ? task.title
              : '${task.title}, ${task.subtitle}',
          focusRadius: s.radiusMedium,
          minSize: const Size(44, 54),
          builder: (context, pressed, focused) => Container(
            width: double.infinity,
            padding: s.isSignal
                ? const EdgeInsets.symmetric(vertical: 9)
                : const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            decoration: s.isSignal
                ? null
                : BoxDecoration(
                    color: s.surfaceHigh,
                    borderRadius: BorderRadius.circular(18),
                  ),
            child: Row(
              children: [
                box,
                const SizedBox(width: 12),
                Expanded(child: text),
              ],
            ),
          ),
        ),
      ),
    );

    final line = Row(
      children: [
        Expanded(child: row),
        if (editing) ...[
          const SizedBox(width: 6),
          NpIconButton(
            icon: Icons.close_rounded,
            semanticLabel: 'Remove ${task.title}',
            color: s.error,
            onPressed: onRemove,
          ),
        ],
      ],
    );

    if (!s.isSignal) {
      return Padding(padding: const EdgeInsets.only(bottom: 8), child: line);
    }
    // Signal: a dashed rule between the rows.
    return first
        ? line
        : CustomPaint(painter: _DashedTopRule(color: s.line), child: line);
  }
}

class _DashedTopRule extends CustomPainter {
  const _DashedTopRule({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    for (var x = 0.0; x < size.width; x += 8) {
      canvas.drawLine(Offset(x, 0.5), Offset(x + 4, 0.5), paint);
    }
  }

  @override
  bool shouldRepaint(_DashedTopRule old) => old.color != color;
}

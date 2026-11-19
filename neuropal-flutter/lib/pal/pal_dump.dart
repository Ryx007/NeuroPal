// "Brain dump": get it out of your head. Sort it later, or never. A line can
// move to today's minimum day (cut to a task title's 120 characters; a
// longer line stays in the dump as well, so nothing is lost); Delete has
// Undo (the text comes back under a new id, as DAY-SYNC §5 says a dump line
// must). Nothing is sent anywhere.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../day/day_models.dart' show cleanText, kTitleMax;
import '../day/day_store.dart';
import '../home/home_bits.dart' show UndoStatus;
import '../home/home_logic.dart' show shorten;
import '../theme/np_style.dart';
import '../theme/pal.dart';
import '../widgets/np_buttons.dart';
import 'pal_bits.dart';
import 'pal_controller.dart';
import 'pal_models.dart';

/// The newest lines shown at once (the rest stay saved).
const int _shown = 100;

class PalDumpPanel extends StatefulWidget {
  const PalDumpPanel({super.key, required this.pal});

  final PalSettings pal;

  @override
  State<PalDumpPanel> createState() => _PalDumpPanelState();
}

class _PalDumpPanelState extends State<PalDumpPanel> {
  final _draft = TextEditingController();
  final _field = FocusNode();
  String? _status;
  DumpItem? _undo;

  @override
  void dispose() {
    _draft.dispose();
    _field.dispose();
    super.dispose();
  }

  void _save() {
    if (!context.read<PalController>().addDump(_draft.text)) return;
    setState(() {
      _draft.clear();
      _status = 'Saved.';
      _undo = null;
    });
    _field.requestFocus();
  }

  /// Puts a line on today's minimum day as a task, cut to a task title's
  /// length here and now (the day keeps and syncs no more), so the cut is
  /// seen at once. A line that fits moves: it leaves the dump. A longer
  /// one stays in the dump, so nothing is lost, and the status says so.
  void _toDay(DumpItem d) {
    final store = context.read<DayStore>();
    final title = cleanText(d.text, kTitleMax);
    final whole = title == cleanText(d.text, kDumpTextMax);
    final String line;
    if (store.tasks.any((t) => t.title == title)) {
      line = 'Already on your minimum day.';
    } else if (store.addTask(title)) {
      line = 'Added “${shorten(title)}” to your minimum day.';
    } else {
      return;
    }
    if (whole) context.read<PalController>().removeDump(d.id);
    setState(() {
      _status = whole ? line : '$line The full note stays in your brain dump.';
      _undo = null;
    });
  }

  void _remove(DumpItem d) {
    final gone = context.read<PalController>().removeDump(d.id);
    if (gone == null) return;
    setState(() {
      _status = 'Deleted.';
      _undo = gone;
    });
  }

  void _restore() {
    final back = _undo;
    if (back == null) return;
    context.read<PalController>().addDump(back.text);
    setState(() {
      _status = 'Back in the dump.';
      _undo = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final pal = widget.pal;
    final items = context.watch<PalController>().dump;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const PalTitle('Brain dump'),
        PalIntro(palSay(pal, 'dump')),
        const SizedBox(height: 14),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                controller: _draft,
                focusNode: _field,
                maxLength: kDumpTextMax,
                minLines: 1,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.done,
                style: s.fonts.body(16, s.text),
                decoration: const InputDecoration(
                  labelText: 'A thought, a worry, a to-do',
                  counterText: '',
                ),
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _save(),
              ),
            ),
            const SizedBox(width: 8),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: NpButton(
                label: 'Save',
                icon: Icons.add_rounded,
                semanticLabel: 'Save to the brain dump',
                onPressed: _draft.text.trim().isEmpty ? null : _save,
              ),
            ),
          ],
        ),
        UndoStatus(text: _status, onUndo: _undo == null ? null : _restore),
        const SizedBox(height: 12),
        if (items.isEmpty)
          PalIntro(palSay(pal, 'dumpEmpty'))
        else ...[
          Semantics(
            header: true,
            child: Text(
              '${items.length} ${items.length == 1 ? 'line' : 'lines'}, newest first',
              style: s.fonts.body(13.5, s.textMuted, weight: FontWeight.w600),
            ),
          ),
          for (final d in items.take(_shown)) ...[
            const SizedBox(height: 10),
            PalCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(d.text, style: s.fonts.body(15.5, s.text, height: 1.45)),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      NpButton(
                        label: 'Minimum day',
                        icon: Icons.playlist_add_rounded,
                        kind: NpButtonKind.ghost,
                        semanticLabel: 'Minimum day: add “${shorten(d.text, 60)}”',
                        onPressed: () => _toDay(d),
                      ),
                      NpIconButton(
                        icon: Icons.delete_outline_rounded,
                        semanticLabel: 'Delete “${shorten(d.text, 60)}”',
                        onPressed: () => _remove(d),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
          if (items.length > _shown) ...[
            const SizedBox(height: 10),
            Text(
              'Showing the newest $_shown of ${items.length}. The rest are kept.',
              style: s.fonts.body(13.5, s.textMuted),
            ),
          ],
        ],
      ],
    );
  }
}

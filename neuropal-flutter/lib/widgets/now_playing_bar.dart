// A slim bar on the Library/Settings screens while a reading session is
// open: play/pause without leaving, tap the title to go back to the Reader.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_routes.dart';
import '../reader/reader_controller.dart';
import '../theme/np_style.dart';
import 'np_buttons.dart';
import 'np_panel.dart';
import 'np_pressable.dart';
import 'np_text.dart';

class NowPlayingBar extends StatelessWidget {
  const NowPlayingBar({super.key, required this.from});

  /// The route we are on (for the drawer-style navigation rule).
  final String from;

  @override
  Widget build(BuildContext context) {
    final reader = context.watch<ReaderController>();
    final doc = reader.document;
    if (doc == null || reader.phase != ReaderPhase.ready) {
      return const SizedBox.shrink();
    }
    final s = NpStyle.of(context);
    final content = reader.content!;
    final bottom = MediaQuery.paddingOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(12, 6, 12, 10 + bottom),
      child: NpPanel(
        blur: true,
        padding: const EdgeInsets.fromLTRB(8, 6, 12, 6),
        child: Row(
          children: [
            NpIconButton(
              icon: reader.playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
              semanticLabel: reader.playing ? 'Pause reading' : 'Resume reading',
              onPressed: reader.togglePlay,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: NpPressable(
                onTap: () => goToRoute(context, AppRoutes.reader, from: from),
                semanticLabel: 'Back to the reader: ${doc.title}',
                builder: (context, pressed, focused) => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    NpLabel(reader.playing ? 'Now playing' : 'Paused'),
                    Text(
                      doc.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: s.fonts.body(14.5, s.text, weight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    ListenableBuilder(
                      listenable: reader.cursor,
                      builder: (context, _) => ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: LinearProgressIndicator(
                          minHeight: 3,
                          value: content.wordCount <= 1
                              ? 0
                              : reader.cursor.index / (content.wordCount - 1),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

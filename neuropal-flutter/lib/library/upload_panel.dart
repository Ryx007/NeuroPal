// The Library's "Add a document": the button, what the server reads, and
// the upload in progress (a progress bar and Cancel), or why one didn't go
// up (Try again). When it is done, the document's own card takes over.
// What happens is read out once (the controller's news), so a screen
// reader hears progress start and end, not every percent.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_panel.dart';
import 'upload_controller.dart';

class UploadSection extends StatefulWidget {
  const UploadSection({
    super.key,
    required this.controller,
    required this.demo,
    required this.onPick,
  });

  final UploadController controller;

  /// The demo library is on: nothing can be uploaded to it (it says why).
  final bool demo;
  final VoidCallback onPick;

  @override
  State<UploadSection> createState() => _UploadSectionState();
}

class _UploadSectionState extends State<UploadSection> {
  late int _spoken = widget.controller.newsId;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChange);
  }

  @override
  void didUpdateWidget(UploadSection old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller.removeListener(_onChange);
      widget.controller.addListener(_onChange);
      _spoken = widget.controller.newsId;
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() {
    final c = widget.controller;
    final news = c.news;
    if (c.newsId != _spoken && news != null && mounted) {
      _spoken = c.newsId;
      if (MediaQuery.maybeSupportsAnnounceOf(context) ?? false) {
        unawaited(
          SemanticsService.sendAnnouncement(View.of(context), news, Directionality.of(context)),
        );
      }
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final c = widget.controller;
    final busy = c.busy || c.picking;
    final status = c.status;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            NpButton(
              label: 'Add a document',
              icon: Icons.upload_file_rounded,
              onPressed: widget.demo || busy ? null : widget.onPick,
            ),
            if (!widget.demo)
              Text(
                c.preparing
                    ? 'Getting the file ready…'
                    : 'PDF, EPUB, Word, PowerPoint, Markdown, text or DjVu · up to 300 MB',
                style: s.fonts.body(13.5, s.textMuted),
              ),
          ],
        ),
        if (widget.demo) ...[
          const SizedBox(height: 8),
          Text(
            'Uploading needs your NeuroPal server. The demo library is built into '
            'the app, so nothing can be added to it. Turn off the demo library in '
            'Settings to add your own documents.',
            style: s.fonts.body(14, s.textMuted),
          ),
        ],
        for (final item in c.items) ...[
          const SizedBox(height: 12),
          _UploadRow(
            item: item,
            onCancel: () => c.cancel(item.key),
            onRetry: item.canRetry && !c.busy ? () => unawaited(c.retry(item.key)) : null,
            onDismiss: () => c.dismiss(item.key),
          ),
        ],
        if (status != null) ...[
          const SizedBox(height: 10),
          Text(status, style: s.fonts.body(14.5, s.textMuted)),
        ],
      ],
    );
  }
}

class _UploadRow extends StatelessWidget {
  const _UploadRow({
    required this.item,
    required this.onCancel,
    required this.onRetry,
    required this.onDismiss,
  });

  final UploadItem item;
  final VoidCallback onCancel;
  final VoidCallback? onRetry;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final uploading = item.phase == UploadPhase.uploading;
    final failed = item.phase == UploadPhase.failed;
    final String state;
    if (uploading) {
      state = item.size > 0
          ? 'Uploading · ${item.percent}% of ${sizeLabel(item.size)}'
          : 'Uploading…';
    } else if (failed) {
      state = item.error ?? 'Not uploaded.';
    } else {
      state = 'Cancelled. Nothing was added.';
    }
    final icon = failed
        ? Icon(Icons.warning_amber_rounded, size: 22, color: s.warn)
        : Icon(Icons.description_outlined, size: 22, color: s.accentText);
    return NpPanel(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      shadow: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MergeSemantics(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExcludeSemantics(child: icon),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: s.fonts.body(15, s.text, weight: FontWeight.w700),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        state,
                        style: uploading
                            ? s.fonts.mono(12.5, s.textMuted)
                            : s.fonts.body(14, failed ? s.text : s.textMuted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (uploading) ...[
            const SizedBox(height: 10),
            Semantics(
              container: true,
              label: 'Uploading ${item.name}',
              value: '${item.percent}%',
              child: ExcludeSemantics(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(s.isSignal ? 2 : 3),
                  child: LinearProgressIndicator(
                    value: item.fraction,
                    minHeight: s.isSignal ? 7 : 6,
                    color: s.accentFill,
                    backgroundColor: s.isSignal ? s.panelSolid : s.surfaceHigh,
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (uploading)
                NpButton(
                  label: 'Cancel',
                  icon: Icons.close_rounded,
                  kind: NpButtonKind.ghost,
                  semanticLabel: 'Cancel uploading ${item.name}',
                  onPressed: onCancel,
                )
              else ...[
                if (onRetry != null)
                  NpButton(
                    label: 'Try again',
                    icon: Icons.refresh_rounded,
                    kind: NpButtonKind.ghost,
                    semanticLabel: 'Try uploading ${item.name} again',
                    onPressed: onRetry,
                  ),
                NpButton(
                  label: 'Remove',
                  kind: NpButtonKind.ghost,
                  semanticLabel: 'Remove ${item.name} from this list',
                  onPressed: onDismiss,
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

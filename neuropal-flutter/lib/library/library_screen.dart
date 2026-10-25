// The Library: every document on the backend with its processing status
// and how far you've read. Pull down (or use the Refresh button) to reload;
// tap a document to open it in the Reader.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_routes.dart';
import '../data/backend.dart';
import '../data/models.dart';
import '../reader/reader_controller.dart';
import '../theme/np_style.dart';
import '../widgets/np_banner.dart';
import '../widgets/np_busy.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_panel.dart';
import '../widgets/np_pressable.dart';
import '../widgets/np_scaffold.dart';
import '../widgets/np_text.dart';
import '../widgets/now_playing_bar.dart';
import 'library_controller.dart';

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key});

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  @override
  void initState() {
    super.initState();
    // First load after the first frame: a controller may not notify its
    // listeners while the widget tree is being built.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final library = context.read<LibraryController>();
      if (!library.loadedOnce) unawaited(library.refresh());
    });
  }

  Future<void> _open(DocumentSummary doc) async {
    final reader = context.read<ReaderController>();
    final library = context.read<LibraryController>();
    unawaited(reader.open(doc));
    await Navigator.of(context).pushNamed(AppRoutes.reader);
    // Back from the Reader: show the reading progress just saved.
    unawaited(library.refresh(quiet: true));
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final library = context.watch<LibraryController>();
    final playing = context.select<ReaderController, bool>((r) => r.playing);

    return NpScaffold(
      route: AppRoutes.library,
      header: NpHeader(
        title: NpBrand(live: playing),
        actions: [
          NpIconButton(
            icon: Icons.refresh_rounded,
            semanticLabel: 'Refresh the library',
            onPressed: library.loading ? null : library.refresh,
          ),
        ],
      ),
      bottom: const NowPlayingBar(from: AppRoutes.library),
      body: RefreshIndicator(
        onRefresh: library.refresh,
        color: s.accentFill,
        backgroundColor: s.surfaceHigh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            _LibraryTitle(library: library),
            const SizedBox(height: 14),
            ..._content(context, library),
          ],
        ),
      ),
    );
  }

  List<Widget> _content(BuildContext context, LibraryController library) {
    final s = NpStyle.of(context);
    final backend = context.watch<Backend>();
    final items = <Widget>[];

    if (library.isDemo) {
      items.add(
        const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: NpBanner(
            icon: Icons.science_outlined,
            title: 'Demo library (offline)',
            message:
                'Two bundled samples, nothing from your backend. Reading '
                'and listening work; Ask needs the backend. Turn this off '
                'in Settings.',
          ),
        ),
      );
    }

    final error = library.error;
    if (error != null) {
      items.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: NpBanner(
            title: error.unreachable
                ? 'Can’t reach the NeuroPal backend'
                : 'The library didn’t load',
            message: error.unreachable
                ? '${backend.offlineMessage()} Check that the phone is '
                      'online (for the Mac mini: that it is on and '
                      'Tailscale is connected).'
                : error.message,
            actions: [
              NpButton(
                label: 'Retry',
                icon: Icons.refresh_rounded,
                onPressed: () async {
                  await backend.probe();
                  await library.refresh();
                },
              ),
              NpButton(
                label: 'Settings',
                kind: NpButtonKind.ghost,
                onPressed: () => goToRoute(
                  context,
                  AppRoutes.settings,
                  from: AppRoutes.library,
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (library.loading && library.documents.isEmpty) {
      items.add(
        Semantics(
          label: 'Loading the library',
          child: const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: NpBusy()),
          ),
        ),
      );
      return items;
    }

    if (library.documents.isEmpty && error == null && library.loadedOnce) {
      items.add(
        NpPanel(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'No documents yet',
                style: s.fonts.displaySemi(18, s.text),
              ),
              const SizedBox(height: 6),
              Text(
                'Upload papers from the Expo app, or drop files into '
                '~/NeuroPal-Inbox on the Mac mini. (Uploading from this app '
                'arrives in M2.)',
                style: s.fonts.body(14.5, s.textMuted),
              ),
            ],
          ),
        ),
      );
    }

    for (final doc in library.documents) {
      items.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _DocumentCard(doc: doc, onOpen: () => _open(doc)),
        ),
      );
    }
    return items;
  }
}

class _LibraryTitle extends StatelessWidget {
  const _LibraryTitle({required this.library});

  final LibraryController library;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final n = library.documents.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        NpLabel(
          !library.loadedOnce
              ? 'Loading…'
              : library.error != null && n == 0
              ? 'Not loaded'
              : '$n document${n == 1 ? '' : 's'}${library.isDemo ? ' · demo' : ''}',
        ),
        const SizedBox(height: 6),
        Semantics(
          header: true,
          child: Text(
            'Library',
            style: s.isSignal
                ? s.fonts.display(44, s.text)
                : s.fonts.display(34, s.text),
          ),
        ),
      ],
    );
  }
}

class _DocumentCard extends StatelessWidget {
  const _DocumentCard({required this.doc, required this.onOpen});

  final DocumentSummary doc;
  final VoidCallback onOpen;

  String get _statusWords {
    if (doc.isReady) return 'Ready';
    if (doc.isFailed) return 'Processing failed';
    return 'Processing: ${doc.status}, ${(doc.ingestProgress * 100).round()} percent';
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final read = (doc.readingProgress * 100).round();
    final meta = [
      doc.type.toUpperCase(),
      if (doc.pageCount != null && doc.pageCount! > 0) '${doc.pageCount} pages',
      if (doc.wordCount != null && doc.wordCount! > 0)
        '${formatCount(doc.wordCount!)} words',
    ].join(' · ');

    final semantics = [
      doc.title,
      _statusWords,
      if (doc.isReady) '$read percent read',
      meta,
    ].join('. ');

    return NpPressable(
      onTap: onOpen,
      semanticLabel: '$semantics. Open in the reader.',
      focusRadius: s.radius,
      builder: (context, pressed, focused) => NpPanel(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
        borderColor: pressed ? s.accentText : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: NpLabel(meta)),
                const SizedBox(width: 8),
                _StatusChip(doc: doc),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              doc.title,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: s.fonts.displaySemi(18, s.text),
            ),
            if (doc.subtitle != null && doc.subtitle!.trim().isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(
                doc.subtitle!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: s.fonts.body(13.5, s.textMuted),
              ),
            ],
            const SizedBox(height: 12),
            if (doc.isReady)
              _Meter(
                value: doc.readingProgress,
                label: read == 0 ? 'Not started' : '$read% read',
              )
            else if (doc.isProcessing)
              _Meter(
                value: doc.ingestProgress,
                label:
                    'Processing · ${doc.status} · ${(doc.ingestProgress * 100).round()}%',
                muted: true,
              )
            else if (doc.isFailed)
              Text(
                doc.ingestError ?? 'The backend could not process this file.',
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: s.fonts.body(13.5, s.warn),
              ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.doc});

  final DocumentSummary doc;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final String label;
    final Color color;
    Widget? lead;
    if (doc.isReady) {
      label = 'Ready';
      color = s.accentText;
      lead = const Led(size: 7);
    } else if (doc.isFailed) {
      label = 'Failed';
      color = s.warn;
      lead = Icon(Icons.warning_amber_rounded, size: 14, color: s.warn);
    } else {
      label = doc.status;
      color = s.textMuted;
      lead = Icon(Icons.hourglass_top_rounded, size: 14, color: s.textMuted);
    }
    return ExcludeSemantics(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(
            s.isSignal ? 4 : s.radiusControl,
          ),
          border: Border.all(color: color.withValues(alpha: 0.7), width: 1.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            lead,
            const SizedBox(width: 6),
            Text(label.toUpperCase(), style: s.fonts.label(color, size: 10.5)),
          ],
        ),
      ),
    );
  }
}

/// A progress meter: Signal = ruler ticks + glowing fill; Classic = bar.
class _Meter extends StatelessWidget {
  const _Meter({required this.value, required this.label, this.muted = false});

  final double value;
  final String label;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(s.isSignal ? 2 : 3),
          child: LinearProgressIndicator(
            value: value.clamp(0.0, 1.0),
            minHeight: s.isSignal ? 7 : 6,
            color: muted ? s.textMuted : s.accentFill,
            backgroundColor: s.isSignal ? s.panelSolid : s.surfaceHigh,
          ),
        ),
        const SizedBox(height: 6),
        Text(label, style: s.fonts.mono(12, s.textMuted)),
      ],
    );
  }
}

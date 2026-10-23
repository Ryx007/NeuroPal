// The Reader: the document's text with the spoken word highlighted, and
// the player docked at the bottom.
//
// AUTO-FOLLOW: while the voice plays, the text scrolls just enough to keep
// the spoken word in view. If you scroll yourself, following pauses and a
// "Follow voice" button appears; pressing play or seeking resumes it.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_routes.dart';
import '../ask/ask_sheet.dart';
import '../data/models.dart';
import '../data/settings_controller.dart';
import '../theme/np_style.dart';
import '../theme/np_type.dart';
import '../widgets/np_banner.dart';
import '../widgets/np_busy.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_panel.dart';
import '../widgets/np_pressable.dart';
import '../widgets/np_scaffold.dart';
import '../widgets/np_text.dart';
import '../widgets/size_reporter.dart';
import 'karaoke_text.dart';
import 'reader_controller.dart';
import 'reader_document.dart';
import 'reader_player.dart';
import 'reader_sheets.dart';

class ReaderScreen extends StatefulWidget {
  const ReaderScreen({super.key});

  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  final ScrollController _scroll = ScrollController();
  final ParagraphRegistry _registry = ParagraphRegistry();
  final GlobalKey _viewportKey = GlobalKey();
  late final ReaderController _reader = context.read<ReaderController>();

  double _playerHeight = 0;
  bool _follow = true;
  bool _animating = false;
  bool _wasPlaying = false;
  String? _positionedFor;

  @override
  void initState() {
    super.initState();
    _reader.addListener(_onReaderChanged);
    _reader.cursor.addListener(_onCursorMoved);
    _wasPlaying = _reader.playing;
    _onReaderChanged();
  }

  @override
  void dispose() {
    _reader.removeListener(_onReaderChanged);
    _reader.cursor.removeListener(_onCursorMoved);
    _scroll.dispose();
    super.dispose();
  }

  void _onReaderChanged() {
    final doc = _reader.document;
    // First time a document is ready on screen: jump to the resume point.
    if (_reader.phase == ReaderPhase.ready && doc != null && _positionedFor != doc.id) {
      _positionedFor = doc.id;
      _follow = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _reveal(jump: true));
    }
    // Pressing play always brings the voice back into view.
    if (_reader.playing && !_wasPlaying) {
      if (!_follow && mounted) setState(() => _follow = true);
      unawaited(_reveal());
    }
    _wasPlaying = _reader.playing;
  }

  void _onCursorMoved() {
    if (_follow && mounted) unawaited(_reveal());
  }

  /// The part of the text area not covered by the player (screen coords).
  Rect? _visibleRect() {
    final box = _viewportKey.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.hasSize) return null;
    final origin = box.localToGlobal(Offset.zero);
    return Rect.fromLTRB(
      origin.dx,
      origin.dy + 8,
      origin.dx + box.size.width,
      origin.dy + box.size.height - _playerHeight - 8,
    );
  }

  /// Scrolls so the spoken word is visible (a quarter down from the top).
  Future<void> _reveal({bool jump = false}) async {
    final content = _reader.content;
    if (content == null || content.isEmpty || _animating) return;
    final index = _reader.cursor.index;
    final p = content.paragraphIndexForWord(index);
    final local = index - content.paragraphs[p].startWord;
    final animate = !jump && !NpStyle.of(context).still;

    for (var attempt = 0; attempt < 6; attempt++) {
      if (!mounted || !_scroll.hasClients) return;
      final view = _visibleRect();
      final rect = _registry[p]?.tokenRect(local);
      final position = _scroll.position;
      if (view != null && rect != null) {
        final visible = rect.top >= view.top && rect.bottom <= view.bottom;
        if (visible && !jump) return; // leave the reader's view alone
        final desired = view.top + view.height * 0.25;
        final to = (position.pixels + rect.top - desired).clamp(
          position.minScrollExtent,
          position.maxScrollExtent,
        );
        if ((to - position.pixels).abs() < 1) return;
        if (animate) {
          _animating = true;
          await _scroll.animateTo(
            to,
            duration: const Duration(milliseconds: 320),
            curve: Curves.easeOutCubic,
          );
          _animating = false;
        } else {
          _scroll.jumpTo(to);
        }
        return;
      }
      // The paragraph isn't built yet (far away): jump to an estimate so
      // the list builds it, then measure again next frame.
      final fraction = p / content.paragraphs.length;
      final estimate =
          (position.maxScrollExtent + position.viewportDimension) * fraction -
          position.viewportDimension * 0.25;
      _scroll.jumpTo(
        estimate.clamp(position.minScrollExtent, position.maxScrollExtent),
      );
      await WidgetsBinding.instance.endOfFrame;
    }
  }

  Future<void> _seek(int wordIndex) async {
    if (!_follow) setState(() => _follow = true);
    await _reader.seekTo(wordIndex);
    unawaited(_reveal());
  }

  bool _onScroll(ScrollNotification n) {
    // A finger drag (not our own animation) pauses auto-follow.
    if (n is ScrollStartNotification && n.dragDetails != null && _follow) {
      setState(() => _follow = false);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final reader = context.watch<ReaderController>();
    final doc = reader.document;

    return NpScaffold(
      route: AppRoutes.reader,
      header: NpHeader(
        title: _ReaderTitle(doc: doc, playing: reader.playing),
        actions: [
          if (reader.phase == ReaderPhase.ready)
            NpIconButton(
              icon: Icons.text_fields_rounded,
              semanticLabel: 'Text settings',
              onPressed: () => showTextSettingsSheet(context),
            ),
          if (doc != null) _AskButton(onPressed: () => showAskSheet(context)),
        ],
      ),
      body: KeyedSubtree(key: _viewportKey, child: _body(context, reader)),
    );
  }

  Widget _body(BuildContext context, ReaderController reader) {
    final doc = reader.document;
    switch (reader.phase) {
      case ReaderPhase.idle:
        return _Centered(
          child: _Message(
            title: 'Nothing open',
            message: 'Pick a document in the Library to read and listen.',
            action: NpButton(
              label: 'Open the Library',
              icon: Icons.library_books_outlined,
              onPressed: () =>
                  goToRoute(context, AppRoutes.library, from: AppRoutes.reader),
            ),
          ),
        );
      case ReaderPhase.loading:
        return const _Centered(child: _Loading());
      case ReaderPhase.processing:
        return _Centered(child: _Processing(doc: doc!));
      case ReaderPhase.failed:
        return _Centered(
          child: NpBanner(
            title: 'This document failed to process',
            message:
                '${doc?.ingestError ?? 'The backend could not extract its text.'} '
                'Re-ingest it from the Expo app or the backend.',
            actions: [
              NpButton(
                label: 'Back to the Library',
                kind: NpButtonKind.ghost,
                onPressed: () => goToRoute(
                  context,
                  AppRoutes.library,
                  from: AppRoutes.reader,
                ),
              ),
            ],
          ),
        );
      case ReaderPhase.error:
        return _Centered(
          child: NpBanner(
            title: 'Couldn’t open the document',
            message: reader.error,
            actions: [
              NpButton(
                label: 'Retry',
                icon: Icons.refresh_rounded,
                onPressed: reader.retry,
              ),
            ],
          ),
        );
      case ReaderPhase.ready:
        return _readerBody(context, reader);
    }
  }

  Widget _readerBody(BuildContext context, ReaderController reader) {
    final s = NpStyle.of(context);
    final settings = context.watch<SettingsController>();
    final content = reader.content!;
    if (content.isEmpty) {
      return const _Centered(
        child: _Message(
          title: 'No readable text',
          message:
              'The backend found no text in this document (a scan without '
              'OCR, or an image-only file). Re-ingest it to try again.',
        ),
      );
    }
    final textStyle = TextStyle(
      fontFamily: readerFontFamily(settings.readerFont, s),
      // Greek letters and math symbols inside prose and equations.
      fontFamilyFallback: kGlyphFallback,
      fontSize: settings.readerFontSize,
      height: settings.readerLineHeight,
      color: s.text,
    );
    final mathStyle = textStyle.copyWith(
      fontFamily: 'Fraunces',
      color: s.tertiary,
    );

    return ChangeNotifierProvider<WordCursor>.value(
      value: reader.cursor,
      child: Stack(
        children: [
          Positioned.fill(
            child: NotificationListener<ScrollNotification>(
              onNotification: _onScroll,
              child: Scrollbar(
                controller: _scroll,
                child: ListView.builder(
                  controller: _scroll,
                  padding: EdgeInsets.fromLTRB(20, 18, 20, _playerHeight + 28),
                  itemCount: content.paragraphs.length + 1,
                  itemBuilder: (context, i) {
                    if (i == 0) {
                      return _DocHeader(doc: reader.document!, content: content);
                    }
                    final p = content.paragraphs[i - 1];
                    return Padding(
                      key: ValueKey(p.index),
                      padding: EdgeInsets.only(
                        bottom: settings.readerFontSize * 0.9,
                      ),
                      child: p.kind == ParagraphKind.equation
                          ? EquationCard(
                              paragraph: p,
                              mathStyle: mathStyle,
                              registry: _registry,
                              onSeek: _seek,
                            )
                          : KaraokeParagraph(
                              paragraph: p,
                              textStyle: textStyle,
                              mathStyle: mathStyle,
                              registry: _registry,
                              onSeek: _seek,
                            ),
                    );
                  },
                ),
              ),
            ),
          ),
          if (!_follow)
            Positioned(
              right: 16,
              bottom: _playerHeight + 12,
              child: _FollowChip(
                onPressed: () {
                  setState(() => _follow = true);
                  unawaited(_reveal());
                },
              ),
            ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SizeReporter(
              onChange: (size) {
                if (mounted && size.height != _playerHeight) {
                  setState(() => _playerHeight = size.height);
                }
              },
              child: ReaderPlayer(
                onSeek: _seek,
                onChooseVoice: () => showVoicePicker(context),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReaderTitle extends StatelessWidget {
  const _ReaderTitle({required this.doc, required this.playing});

  final DocumentSummary? doc;
  final bool playing;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Semantics(
      header: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Led(on: playing, live: playing),
              const SizedBox(width: 7),
              Flexible(
                child: NpLabel(playing ? 'Now playing' : 'Reader', size: 10),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            doc?.title ?? 'Reader',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: s.fonts.body(15, s.text, weight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _AskButton extends StatelessWidget {
  const _AskButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return NpPressable(
      onTap: onPressed,
      semanticLabel: 'Ask about this document',
      focusRadius: s.isSignal ? s.radiusMedium : 22,
      builder: (context, pressed, focused) => NpPanel(
        radius: s.isSignal ? s.radiusMedium : s.radiusControl,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        shadow: false,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.auto_awesome_outlined, size: 17, color: s.accentText),
            const SizedBox(width: 7),
            Text(
              'Ask',
              style: s.fonts.body(14, s.accentText, weight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }
}

class _FollowChip extends StatelessWidget {
  const _FollowChip({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return NpButton(
      label: 'Follow voice',
      icon: Icons.my_location_rounded,
      semanticLabel: 'Scroll back to the spoken word and follow the voice',
      onPressed: onPressed,
    );
  }
}

class _DocHeader extends StatelessWidget {
  const _DocHeader({required this.doc, required this.content});

  final DocumentSummary doc;
  final ReaderDocument content;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final minutes = (content.wordCount / 225).ceil();
    final meta = [
      doc.type.toUpperCase(),
      if (doc.pageCount != null && doc.pageCount! > 0) '${doc.pageCount} pages',
      '${formatCount(content.wordCount)} words',
      '≈ $minutes min at 225 wpm',
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          NpLabel(meta),
          const SizedBox(height: 8),
          Semantics(
            header: true,
            child: Text(
              doc.title,
              style: s.isSignal
                  ? s.fonts.display(28, s.text)
                  : s.fonts.display(26, s.text),
            ),
          ),
          if (doc.subtitle != null && doc.subtitle!.trim().isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(doc.subtitle!, style: s.fonts.body(14.5, s.textMuted)),
          ],
          const SizedBox(height: 10),
          Text(
            'Tap any word to read aloud from there.',
            style: s.fonts.body(13, s.textFaint),
          ),
        ],
      ),
    );
  }
}

class _Centered extends StatelessWidget {
  const _Centered({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.all(20),
    child: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: child,
      ),
    ),
  );
}

class _Message extends StatelessWidget {
  const _Message({required this.title, required this.message, this.action});

  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return NpPanel(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: s.fonts.displaySemi(19, s.text)),
          const SizedBox(height: 6),
          Text(message, style: s.fonts.body(15, s.textMuted)),
          if (action != null) ...[const SizedBox(height: 14), action!],
        ],
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Semantics(
      liveRegion: true,
      label: 'Preparing the text',
      excludeSemantics: true,
      child: Column(
        children: [
          const SizedBox(height: 40),
          const NpBusy(),
          const SizedBox(height: 16),
          Text('Preparing the text…', style: s.fonts.body(15, s.textMuted)),
        ],
      ),
    );
  }
}

class _Processing extends StatelessWidget {
  const _Processing({required this.doc});

  final DocumentSummary doc;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final pct = (doc.ingestProgress * 100).round();
    return Semantics(
      liveRegion: true,
      child: NpPanel(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const NpLabel('Processing on the backend'),
            const SizedBox(height: 8),
            Text(doc.title, style: s.fonts.displaySemi(19, s.text)),
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                // Indeterminate (animated) only when motion is allowed.
                value: doc.ingestProgress > 0
                    ? doc.ingestProgress
                    : (s.still ? 0 : null),
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Stage: ${doc.status}${pct > 0 ? ' · $pct%' : ''}',
              style: s.fonts.mono(13, s.textMuted),
            ),
            const SizedBox(height: 10),
            Text(
              'The text opens here automatically when it is ready. Big books '
              'can take a few minutes.',
              style: s.fonts.body(14.5, s.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

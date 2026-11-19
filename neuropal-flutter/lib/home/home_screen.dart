// Home ("Today"): the app's first screen. The tiles come in the order the
// person arranged them (the look's Home layout, with today's weekday or
// weekend rules applied): check-in, next anchor, minimum viable day,
// resume reading, Pal's note. A port of the web app's HomeView.tsx; the
// Expo app's HomeScreen is the reference for the look of both skins.
//
// Library, Reader, Settings and the calming steps are pushed on top of
// Home, so Android's Back always leads here.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:provider/provider.dart';

import '../app_routes.dart';
import '../auth/auth_controller.dart';
import '../data/models.dart';
import '../day/day_models.dart';
import '../day/day_rules.dart';
import '../day/day_store.dart';
import '../library/library_controller.dart';
import '../reader/reader_controller.dart';
import '../theme/appearance_controller.dart';
import '../theme/home_layout.dart';
import '../theme/np_style.dart';
import '../widgets/np_scaffold.dart';
import '../widgets/np_text.dart';
import '../widgets/now_playing_bar.dart';
import 'anchor_tile.dart';
import 'anchors_sheet.dart';
import 'home_logic.dart';
import 'mvd_tile.dart';
import 'pal_tile.dart';
import 'reading_tile.dart';
import 'state_tile.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  /// Re-renders the countdown and the date calmly (minutes, not seconds).
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
    // First load after the first frame: a controller may not notify while
    // the tree is being built.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final library = context.read<LibraryController>();
      if (!library.loadedOnce && !library.loading) unawaited(library.refresh());
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

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

  void _checkIn(
    NervousState state,
    double level, {
    required bool viaSteps,
    required bool button,
  }) {
    final store = context.read<DayStore>();
    final was = store.state;
    store.recordCheckin(state, level);
    // The message line (a live region) says what changed; a button that
    // keeps the same state still gets a word back.
    if (button && was == state) _announce('Checked in: ${state.word}.');
  }

  Future<void> _openDocument(DocumentSummary doc) async {
    final reader = context.read<ReaderController>();
    final library = context.read<LibraryController>();
    unawaited(reader.open(doc));
    await Navigator.of(context).pushNamed(AppRoutes.reader);
    // Back from the reader: show the progress just saved.
    unawaited(library.refresh(quiet: true));
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final store = context.watch<DayStore>();
    final appearance = context.watch<AppearanceController>().appearance;
    final library = context.watch<LibraryController>();
    final name = context.select<AuthController, String?>((a) => a.user?.name);
    final playing = context.select<ReaderController, bool>((r) => r.playing);
    final now = store.now();
    final pal = appearance.pal;
    final next = store.nextAnchor;
    final last = store.lastCheckin;
    final tiles = effectiveTiles(homeForSkin(appearance.home, appearance.skin), now);

    final ReadingStatus readingStatus;
    if (library.documents.isNotEmpty) {
      readingStatus = ReadingStatus.ready;
    } else if (library.error != null) {
      readingStatus = ReadingStatus.error;
    } else if (!library.loadedOnce) {
      readingStatus = ReadingStatus.loading;
    } else {
      readingStatus = ReadingStatus.ready;
    }

    Widget? tile(HomeTile t) {
      switch (t.id) {
        case 'state':
          return StateTile(
            size: t.size,
            state: store.state,
            level: store.level,
            message: stateMessage(
              state: store.state,
              next: next,
              pal: pal,
              signal: s.isSignal,
            ),
            onCheckIn: _checkIn,
            onCalm: () => Navigator.of(context).pushNamed(AppRoutes.calm),
          );
        case 'anchor':
          return AnchorTile(
            size: t.size,
            anchor: next,
            count: store.anchors.length,
            now: now,
            onAdd: () => showAnchorsSheet(context, add: true),
            onEdit: (a) => showAnchorsSheet(context, editId: a.id),
            onAll: () => showAnchorsSheet(context),
            onDone: (a) {
              store.setAnchorDone(a.id, true);
              _announce('${a.title}: done for today.');
            },
          );
        case 'mvd':
          return MvdTile(size: t.size);
        case 'reading':
          return ReadingTile(
            size: t.size,
            status: readingStatus,
            document: resumeDocument(library.documents),
            onOpen: _openDocument,
            onLibrary: () =>
                goToRoute(context, AppRoutes.library, from: AppRoutes.home),
          );
        case 'pal':
          final firstOpen = store.tasks.where((x) => !store.isTaskDone(x)).firstOrNull;
          return PalTile(
            size: t.size,
            pal: pal,
            mood: moodFor(store.state),
            line: palNote(pal, store.state, firstOpen),
          );
        default:
          // "focus" belongs to Pal's "Sit with me" (not built yet); a tile
          // from a newer client is skipped quietly.
          return null;
      }
    }

    // Keyed by tile id: a day rule that reorders the tiles never hands one
    // tile's state (an open editor) to another.
    final built = [
      for (final t in tiles)
        if (tile(t) case final w?) KeyedSubtree(key: ValueKey(t.id), child: w),
    ];

    return NpScaffold(
      route: AppRoutes.home,
      header: NpHeader(title: NpBrand(live: playing)),
      bottom: const NowPlayingBar(from: AppRoutes.home),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (s.isSignal) ...[
                    NpLabel(dateLabel(now)),
                    const SizedBox(height: 6),
                  ],
                  Semantics(
                    header: true,
                    child: Text(
                      helloLine(name, signal: s.isSignal),
                      style: s.isSignal
                          ? s.fonts.display(40, s.text)
                          : s.fonts.display(34, s.text),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'One step at a time today.',
                    style: s.fonts.body(16, s.textMuted),
                  ),
                  if (last != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      lastCheckinLine(last, now, signal: s.isSignal),
                      style: s.fonts.mono(13, s.textMuted),
                    ),
                  ],
                  for (final w in built) ...[const SizedBox(height: 14), w],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// The app root: hands the long-lived controllers to the widget tree
// (provider), builds the theme from the user's appearance, and puts the
// sign-in screen in front of everything while the server needs one. Home
// is the first screen; day sync runs while the app is alive (it syncs when
// the app comes back to the front). Pal's own words (Sit with me's halfway
// question and its end) are read out from here, whatever screen is open.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_routes.dart';
import 'ask/ask_controller.dart';
import 'auth/auth_controller.dart';
import 'auth/sign_in_screen.dart';
import 'calm/calm_screen.dart';
import 'data/backend.dart';
import 'data/settings_controller.dart';
import 'day/day_store.dart';
import 'day/day_sync.dart';
import 'home/home_screen.dart';
import 'library/library_controller.dart';
import 'library/library_screen.dart';
import 'pal/pal_controller.dart';
import 'pal/pal_news.dart';
import 'reader/reader_controller.dart';
import 'reader/reader_screen.dart';
import 'services.dart';
import 'settings/settings_screen.dart';
import 'theme/appearance_controller.dart';
import 'theme/np_style.dart';

class NeuroPalApp extends StatefulWidget {
  const NeuroPalApp({super.key, required this.services});

  final AppServices services;

  @override
  State<NeuroPalApp> createState() => _NeuroPalAppState();
}

class _NeuroPalAppState extends State<NeuroPalApp> {
  late final LibraryController _library = LibraryController(widget.services);
  late final ReaderController _reader = ReaderController(widget.services);
  final AskController _ask = AskController();
  late final AppLifecycleListener _lifecycle;
  late bool _signedOut;

  @override
  void initState() {
    super.initState();
    _signedOut = widget.services.auth.needsSignIn;
    widget.services.auth.addListener(_onAuthChanged);
    // Find a reachable backend straight away (shown in the drawer and
    // Settings; the Library waits for it on its first load).
    unawaited(widget.services.backend.probe());
    final sync = widget.services.daySync;
    // Back to the front (not just the notification shade closing): sync.
    _lifecycle = AppLifecycleListener(
      onShow: sync.onForeground,
      onHide: sync.onBackground,
    );
    // After the first frame: starting may notify listeners at once.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) sync.start();
    });
  }

  /// A session ended (signed out, or the server said 401) or began. Nothing
  /// of the old one stays: no open document, no list, no Ask threads, no
  /// Pal chat (and on sign-out no running sit) — the Library loads afresh,
  /// and an upload in flight stops.
  void _onAuthChanged() {
    final out = widget.services.auth.needsSignIn;
    if (out == _signedOut) return;
    _signedOut = out;
    if (out) unawaited(_reader.close());
    _library.clear();
    _ask.clear();
    widget.services.pal.forgetSession(endSit: out);
  }

  @override
  void dispose() {
    widget.services.auth.removeListener(_onAuthChanged);
    widget.services.daySync.stop();
    _lifecycle.dispose();
    _library.dispose();
    _reader.dispose();
    _ask.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final services = widget.services;
    return MultiProvider(
      providers: [
        Provider<AppServices>.value(value: services),
        ChangeNotifierProvider<Backend>.value(value: services.backend),
        ChangeNotifierProvider<AuthController>.value(value: services.auth),
        ChangeNotifierProvider<SettingsController>.value(value: services.settings),
        ChangeNotifierProvider<AppearanceController>.value(
          value: services.appearance,
        ),
        ChangeNotifierProvider<LibraryController>.value(value: _library),
        ChangeNotifierProvider<ReaderController>.value(value: _reader),
        ChangeNotifierProvider<AskController>.value(value: _ask),
        ChangeNotifierProvider<DayStore>.value(value: services.day),
        ChangeNotifierProvider<DaySync>.value(value: services.daySync),
        ChangeNotifierProvider<PalController>.value(value: services.pal),
      ],
      child: Consumer<AppearanceController>(
        builder: (context, appearance, _) {
          // The OS "remove animations" setting always forces motion Still.
          final reduceMotion =
              MediaQuery.maybeDisableAnimationsOf(context) ?? false;
          final style = appearance.style(reduceMotion: reduceMotion);
          // Until there is a session, Sign-in IS the app: no drawer, no
          // Back into Home (only the calming steps can be opened on top of
          // it). The offline demo library never talks to a server, so it
          // opens without one.
          final signIn =
              context.select<AuthController, bool>((a) => a.needsSignIn) &&
              !context.select<SettingsController, bool>((s) => s.demoMode);
          return MaterialApp(
            // A new key = a fresh navigator: signing in starts at Home,
            // signing out leaves no screen of the session behind.
            key: ValueKey<bool>(signIn),
            title: 'NeuroPal F',
            debugShowCheckedModeBanner: false,
            theme: buildMaterialTheme(style),
            // Skin changes switch instantly: no animated theme cross-fade.
            themeAnimationDuration: Duration.zero,
            builder: (context, child) => PalNewsReader(child: child!),
            onGenerateInitialRoutes: (_) => [
              MaterialPageRoute<void>(
                settings: RouteSettings(
                  name: signIn ? AppRoutes.signIn : AppRoutes.home,
                ),
                builder: (_) =>
                    signIn ? const SignInScreen() : const HomeScreen(),
              ),
            ],
            routes: {
              AppRoutes.home: (_) => const HomeScreen(),
              AppRoutes.library: (_) => const LibraryScreen(),
              AppRoutes.reader: (_) => const ReaderScreen(),
              AppRoutes.settings: (_) => const SettingsScreen(),
              AppRoutes.calm: (_) => const CalmScreen(),
            },
          );
        },
      ),
    );
  }
}

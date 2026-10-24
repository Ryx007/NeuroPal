// The app root: hands the long-lived controllers to the widget tree
// (provider), builds the theme from the user's appearance, and puts the
// sign-in screen in front of everything while the server needs one.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_routes.dart';
import 'ask/ask_controller.dart';
import 'auth/auth_controller.dart';
import 'auth/sign_in_screen.dart';
import 'data/backend.dart';
import 'data/settings_controller.dart';
import 'library/library_controller.dart';
import 'library/library_screen.dart';
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
  late bool _signedOut;

  @override
  void initState() {
    super.initState();
    _signedOut = widget.services.auth.needsSignIn;
    widget.services.auth.addListener(_onAuthChanged);
    // Find a reachable backend straight away (shown in the drawer and
    // Settings; the Library waits for it on its first load).
    unawaited(widget.services.backend.probe());
  }

  /// A session ended (signed out, or the server said 401) or began. Nothing
  /// of the old one stays: no open document, no list, no Ask threads — and
  /// the Library loads afresh with the new session.
  void _onAuthChanged() {
    final out = widget.services.auth.needsSignIn;
    if (out == _signedOut) return;
    _signedOut = out;
    if (out) unawaited(_reader.close());
    _library.clear();
    _ask.clear();
  }

  @override
  void dispose() {
    widget.services.auth.removeListener(_onAuthChanged);
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
      ],
      child: Consumer<AppearanceController>(
        builder: (context, appearance, _) {
          // The OS "remove animations" setting always forces motion Still.
          final reduceMotion =
              MediaQuery.maybeDisableAnimationsOf(context) ?? false;
          final style = appearance.style(reduceMotion: reduceMotion);
          // Until there is a session, Sign-in IS the app: no drawer, no
          // Back into the Library. The offline demo library never talks to
          // a server, so it opens without one.
          final signIn =
              context.select<AuthController, bool>((a) => a.needsSignIn) &&
              !context.select<SettingsController, bool>((s) => s.demoMode);
          return MaterialApp(
            // A new key = a fresh navigator: signing in starts at the
            // Library, signing out leaves no screen of the session behind.
            key: ValueKey<bool>(signIn),
            title: 'NeuroPal F',
            debugShowCheckedModeBanner: false,
            theme: buildMaterialTheme(style),
            // Skin changes switch instantly: no animated theme cross-fade.
            themeAnimationDuration: Duration.zero,
            onGenerateInitialRoutes: (_) => [
              MaterialPageRoute<void>(
                settings: RouteSettings(
                  name: signIn ? AppRoutes.signIn : AppRoutes.library,
                ),
                builder: (_) =>
                    signIn ? const SignInScreen() : const LibraryScreen(),
              ),
            ],
            routes: {
              AppRoutes.library: (_) => const LibraryScreen(),
              AppRoutes.reader: (_) => const ReaderScreen(),
              AppRoutes.settings: (_) => const SettingsScreen(),
            },
          );
        },
      ),
    );
  }
}

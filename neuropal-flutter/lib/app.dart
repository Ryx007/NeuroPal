// The app root: hands the long-lived controllers to the widget tree
// (provider) and builds the theme from the user's appearance.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_routes.dart';
import 'ask/ask_controller.dart';
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

  @override
  void initState() {
    super.initState();
    // Find a reachable backend straight away (shown in the drawer and
    // Settings; the Library waits for it on its first load).
    unawaited(widget.services.backend.probe());
  }

  @override
  void dispose() {
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
          return MaterialApp(
            title: 'NeuroPal F',
            debugShowCheckedModeBanner: false,
            theme: buildMaterialTheme(style),
            // Skin changes switch instantly: no animated theme cross-fade.
            themeAnimationDuration: Duration.zero,
            initialRoute: AppRoutes.library,
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

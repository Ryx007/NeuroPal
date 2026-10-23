// The left navigation drawer: Library, Reader, Settings, plus a live
// connection line at the bottom.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_routes.dart';
import '../data/backend.dart';
import '../data/settings_controller.dart';
import '../reader/reader_controller.dart';
import '../theme/np_style.dart';
import 'np_pressable.dart';
import 'np_text.dart';

class NpDrawer extends StatelessWidget {
  const NpDrawer({super.key, required this.current});

  /// Route name of the screen the drawer was opened from.
  final String current;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final reader = context.watch<ReaderController>();
    final doc = reader.document;

    void go(String route) {
      Navigator.of(context).pop(); // close the drawer first
      goToRoute(context, route, from: current);
    }

    return Drawer(
      backgroundColor: s.surfaceLow,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.horizontal(
          right: Radius.circular(s.isSignal ? 0 : s.radius),
        ),
        side: s.isSignal
            ? BorderSide(color: s.line, width: s.borderWidth)
            : BorderSide.none,
      ),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      s.isSignal ? 'NEUROPAL' : 'NeuroPal',
                      style: s.fonts.display(26, s.text),
                    ),
                  ),
                  const SizedBox(height: 4),
                  const NpLabel('Flutter · reader first'),
                ],
              ),
            ),
            _DrawerItem(
              icon: Icons.library_books_outlined,
              label: 'Library',
              selected: current == AppRoutes.library,
              onTap: () => go(AppRoutes.library),
            ),
            _DrawerItem(
              icon: Icons.menu_book_outlined,
              label: 'Reader',
              detail: doc == null
                  ? 'Nothing open yet'
                  : '${reader.playing ? 'Playing' : 'Open'}: ${doc.title}',
              selected: current == AppRoutes.reader,
              onTap: () => go(AppRoutes.reader),
            ),
            _DrawerItem(
              icon: Icons.tune_rounded,
              label: 'Settings',
              selected: current == AppRoutes.settings,
              onTap: () => go(AppRoutes.settings),
            ),
            const Spacer(),
            const _ConnectionLine(),
          ],
        ),
      ),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.detail,
  });

  final IconData icon;
  final String label;
  final String? detail;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final Color bg;
    final Color fg;
    if (selected) {
      bg = s.isSignal ? s.accentFill : s.accentText.withValues(alpha: 0.16);
      fg = s.isSignal ? s.accentInk : s.accentText;
    } else {
      bg = Colors.transparent;
      fg = s.text;
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
      child: NpPressable(
        onTap: onTap,
        selected: selected,
        focusRadius: s.radiusMedium,
        builder: (context, pressed, focused) => Container(
          constraints: const BoxConstraints(minHeight: 56),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(
              s.isSignal ? s.radiusMedium : s.radiusControl,
            ),
            border: selected && s.isSignal && s.borderWidth > 0
                ? Border.all(color: s.shadow, width: s.borderWidth)
                : null,
          ),
          child: Row(
            children: [
              Icon(icon, color: fg, size: 22),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      label,
                      style: s.fonts.body(16, fg, weight: FontWeight.w700),
                    ),
                    if (detail != null)
                      Text(
                        detail!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: s.fonts.body(13, selected ? fg : s.textMuted),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "● Tailscale · 34 ms" / "○ Offline" / "Demo library (offline)".
class _ConnectionLine extends StatelessWidget {
  const _ConnectionLine();

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final backend = context.watch<Backend>();
    final demo = context.watch<SettingsController>().demoMode;

    final String text;
    var on = false;
    if (demo) {
      text = 'Demo library (offline)';
    } else {
      switch (backend.state) {
        case BackendState.checking:
          text = 'Checking the backend…';
        case BackendState.online:
          on = true;
          final latency = backend.results
              .where((r) => r.candidate == backend.active)
              .firstOrNull
              ?.latencyMs;
          text =
              'Connected · ${backend.active!.label}'
              '${latency == null ? '' : ' · $latency ms'}';
        case BackendState.offline:
          text = 'Backend offline';
      }
    }
    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 12, 20, 18),
        child: Row(
          children: [
            Led(on: on),
            const SizedBox(width: 10),
            Expanded(
              child: Text(text, style: s.fonts.mono(12.5, s.textMuted)),
            ),
          ],
        ),
      ),
    );
  }
}

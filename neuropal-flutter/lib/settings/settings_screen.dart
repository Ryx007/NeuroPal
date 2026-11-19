// Settings: where the backend is, the demo library switch, the look
// (Classic theme × accent, or a Signal preset), day sync, Pal's bubble and
// the account. Appearance changes apply instantly and are saved as the
// shared appearance object.
//
// The bigger sections live in their own files:
//   backend_section.dart     — backend address + live connection status
//   appearance_section.dart  — skin, Classic theme × accent, Signal presets
//   day_sync_section.dart    — "Keep my day in sync" + its status line
//   pal_section.dart         — Pal's floating bubble (show it again)
//   account_section.dart     — who is signed in + Sign out

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_routes.dart';
import '../data/settings_controller.dart';
import '../pal/pal_bubble.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_scaffold.dart';
import '../widgets/now_playing_bar.dart';
import 'account_section.dart';
import 'appearance_section.dart';
import 'backend_section.dart';
import 'day_sync_section.dart';
import 'pal_section.dart';
import 'settings_section.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return NpScaffold(
      route: AppRoutes.settings,
      header: const NpHeader(title: NpHeaderTitle('Settings')),
      bottom: const NowPlayingBar(from: AppRoutes.settings),
      body: ListView(
        // Room under the last section for Pal's bubble.
        padding: EdgeInsets.fromLTRB(
          16,
          18,
          16,
          math.max(32, palBubbleClearance(context, AppRoutes.settings)),
        ),
        children: const [
          BackendSection(),
          SizedBox(height: 14),
          _DemoSection(),
          SizedBox(height: 14),
          AppearanceSection(),
          SizedBox(height: 14),
          DaySyncSection(),
          SizedBox(height: 14),
          PalSection(),
          SizedBox(height: 14),
          AccountSection(),
          SizedBox(height: 14),
          _AboutSection(),
        ],
      ),
    );
  }
}

// ---- demo ----------------------------------------------------------------------

class _DemoSection extends StatelessWidget {
  const _DemoSection();

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final settings = context.watch<SettingsController>();
    return SettingsSection(
      title: 'Demo library',
      children: [
        MergeSemantics(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Demo library (offline)',
                      style: s.fonts.body(15, s.text, weight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Two bundled physics samples instead of your backend. '
                      'Off by default: real mode never fakes data.',
                      style: s.fonts.body(13.5, s.textMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Switch(
                value: settings.demoMode,
                onChanged: settings.setDemoMode,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ---- about ------------------------------------------------------------------

class _AboutSection extends StatelessWidget {
  const _AboutSection();

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return SettingsSection(
      title: 'About',
      children: [
        Text(
          'NeuroPal for Flutter: Home, the reader with Ask, the calming steps '
          'and Pal, your assistant. Voices are your device’s own; no audio '
          'leaves the phone.',
          style: s.fonts.body(14, s.textMuted),
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerLeft,
          child: NpButton(
            label: 'Open-source licences',
            kind: NpButtonKind.ghost,
            onPressed: () => showLicensePage(
              context: context,
              applicationName: 'NeuroPal F',
            ),
          ),
        ),
      ],
    );
  }
}

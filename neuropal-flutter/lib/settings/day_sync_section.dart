// "Your day" in Settings: the "Keep my day in sync" switch (on by default)
// and the one status line under it. This line is the only place a sync
// problem ever shows: sync never interrupts the person.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../day/day_sync.dart';
import '../theme/np_style.dart';
import '../widgets/np_text.dart';
import 'settings_section.dart';

class DaySyncSection extends StatelessWidget {
  const DaySyncSection({super.key});

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final sync = context.watch<DaySync>();
    final phase = sync.phase;
    final status = daySyncStatusText(
      phase,
      syncedAt: sync.syncedAt,
      now: sync.store.now(),
      signal: s.isSignal,
    );
    return SettingsSection(
      title: 'Your day',
      children: [
        MergeSemantics(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Keep my day in sync',
                      style: s.fonts.body(15, s.text, weight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Check-ins, anchors, the minimum day and your brain dump '
                      'are kept on your NeuroPal server too, so your other '
                      'devices see them. Sync never sends them to an AI.',
                      style: s.fonts.body(13.5, s.textMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Switch(value: sync.enabled, onChanged: sync.setEnabled),
            ],
          ),
        ),
        const SizedBox(height: 10),
        // Not a live region: background syncs every few minutes must not
        // talk over whatever the person is doing.
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 5),
              child: Led(on: phase == DaySyncPhase.synced),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(status, style: s.fonts.body(14, s.textMuted)),
            ),
          ],
        ),
      ],
    );
  }
}

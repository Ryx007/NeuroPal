// "Pal" in Settings: the switch for Pal's floating bubble (the way to show
// it again after hiding it from the sheet), and a way to open Pal.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_routes.dart';
import '../pal/pal_controller.dart';
import '../pal/pal_sheet.dart';
import '../theme/appearance_controller.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import 'settings_section.dart';

class PalSection extends StatelessWidget {
  const PalSection({super.key});

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final assistant = context.watch<PalController>();
    final name = context.select<AppearanceController, String>((a) => a.appearance.pal.name);
    return SettingsSection(
      title: '$name, your assistant',
      children: [
        MergeSemantics(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Show $name’s bubble',
                      style: s.fonts.body(15, s.text, weight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'A small $name in the corner of Home, the Library and Settings '
                      'opens your assistant. $name is in the menu too, so hiding the '
                      'bubble never hides $name.',
                      style: s.fonts.body(13.5, s.textMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Switch(
                value: !assistant.bubbleHidden,
                onChanged: (show) => assistant.setBubbleHidden(!show),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerLeft,
          child: NpButton(
            label: 'Open $name',
            kind: NpButtonKind.ghost,
            onPressed: () => showPalSheet(context, from: AppRoutes.settings),
          ),
        ),
      ],
    );
  }
}

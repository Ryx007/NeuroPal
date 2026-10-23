// The titled panel every Settings section is built from.

import 'package:flutter/material.dart';

import '../theme/np_style.dart';
import '../widgets/np_panel.dart';

/// A titled panel; every Settings section is one.
class SettingsSection extends StatelessWidget {
  const SettingsSection({
    super.key,
    required this.title,
    required this.children,
  });

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return NpPanel(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(title, style: s.fonts.displaySemi(18, s.text)),
          ),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }
}

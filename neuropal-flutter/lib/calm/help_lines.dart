// People to call, now. Shown on the calming steps. No network, nothing
// sent anywhere: the numbers are written out large, and can be copied for
// the phone app. (Calling straight from here needs a URL-launcher plugin
// this app doesn't ship yet.)

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';

import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';

class HelpLine {
  const HelpLine({required this.number, required this.dial, required this.what});

  /// As written ("02 2327 2327").
  final String number;

  /// What to dial from anywhere ("+390223272327").
  final String dial;
  final String what;
}

const List<HelpLine> kHelpLines = [
  HelpLine(number: '112', dial: '112', what: 'Emergency, in Italy and across the EU'),
  HelpLine(
    number: '02 2327 2327',
    dial: '+390223272327',
    what: 'Telefono Amico Italia, someone to talk to',
  ),
];

class HelpLines extends StatefulWidget {
  const HelpLines({super.key, this.title = 'Talk to someone now'});

  final String title;

  @override
  State<HelpLines> createState() => _HelpLinesState();
}

class _HelpLinesState extends State<HelpLines> {
  String? _copied;

  Future<void> _copy(HelpLine line) async {
    await Clipboard.setData(ClipboardData(text: line.dial));
    if (!mounted) return;
    final message = '${line.number} copied. Paste it in your phone app to call.';
    setState(() => _copied = message);
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

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(
            widget.title,
            style: s.isSignal
                ? s.fonts.display(24, s.text)
                : s.fonts.display(22, s.text),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'If you’re in danger, or you might act on thoughts of hurting '
          'yourself, call now or go to someone you trust.',
          style: s.fonts.body(15.5, s.textMuted, height: 1.5),
        ),
        const SizedBox(height: 14),
        for (final line in kHelpLines) ...[
          _LineRow(line: line, onCopy: () => _copy(line)),
          const SizedBox(height: 12),
        ],
        Text(
          'Somewhere else? Call your local emergency number.',
          style: s.fonts.body(15.5, s.text, weight: FontWeight.w700),
        ),
        Semantics(
          liveRegion: true,
          container: true,
          child: _copied == null
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(_copied!, style: s.fonts.body(14.5, s.textMuted)),
                ),
        ),
      ],
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({required this.line, required this.onCopy});

  final HelpLine line;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(s.radiusMedium),
        border: Border.all(color: s.control, width: 1.5),
      ),
      child: Row(
        children: [
          Expanded(
            child: MergeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      ExcludeSemantics(
                        child: Icon(Icons.phone_rounded, size: 20, color: s.accentText),
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: SelectableText(
                          line.number,
                          style: s.fonts.mono(20, s.text, weight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(line.what, style: s.fonts.body(14.5, s.textMuted)),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          NpButton(
            label: 'Copy',
            icon: Icons.copy_rounded,
            kind: NpButtonKind.ghost,
            minHeight: 48,
            semanticLabel: 'Copy the number ${line.number}',
            onPressed: onCopy,
          ),
        ],
      ),
    );
  }
}

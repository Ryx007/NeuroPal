// People to call, now. Shown on the calming steps and wherever Pal answers
// a message that sounds like a crisis. No network, nothing sent anywhere:
// Call opens the phone app on the number (a tel: link, via url_launcher);
// when the device can't call, it says so in plain words, and Copy puts the
// number on the clipboard for whatever phone is at hand.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

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

/// Opens the phone app on a number. The app uses the system's; tests hand
/// in their own through the widget tree (a `PhoneDialer` provided above
/// the app).
abstract class PhoneDialer {
  const PhoneDialer();

  /// True when the phone app opened.
  Future<bool> dial(String number);

  static PhoneDialer of(BuildContext context) =>
      Provider.of<PhoneDialer?>(context, listen: false) ?? const SystemPhoneDialer();
}

class SystemPhoneDialer extends PhoneDialer {
  const SystemPhoneDialer();

  @override
  Future<bool> dial(String number) async {
    try {
      return await launchUrl(
        Uri(scheme: 'tel', path: number),
        mode: LaunchMode.externalApplication,
      );
    } on Object catch (e) {
      // A tablet without a phone app, a missing handler: say so on screen.
      debugPrint('Couldn’t open the phone app (${e.runtimeType})');
      return false;
    }
  }
}

class HelpLines extends StatefulWidget {
  const HelpLines({super.key, this.title = 'Talk to someone now', this.compact = false});

  final String title;

  /// Inside a card (Pal's careful reply): a smaller heading.
  final bool compact;

  @override
  State<HelpLines> createState() => _HelpLinesState();
}

class _HelpLinesState extends State<HelpLines> {
  String? _note;

  void _tell(String message) {
    setState(() => _note = message);
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

  Future<void> _call(HelpLine line) async {
    final dialer = PhoneDialer.of(context);
    final opened = await dialer.dial(line.dial);
    if (!mounted || opened) return;
    _tell(
      'This device can’t start a call. Dial ${line.number} on a phone, or '
      'copy the number.',
    );
  }

  Future<void> _copy(HelpLine line) async {
    await Clipboard.setData(ClipboardData(text: line.dial));
    if (!mounted) return;
    _tell('${line.number} copied. Paste it in your phone app to call.');
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final compact = widget.compact;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(
            widget.title,
            style: compact
                ? s.fonts.displaySemi(18, s.text)
                : (s.isSignal ? s.fonts.display(24, s.text) : s.fonts.display(22, s.text)),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'If you’re in danger, or you might act on thoughts of hurting '
          'yourself, call now or go to someone you trust.',
          style: s.fonts.body(compact ? 14.5 : 15.5, s.textMuted, height: 1.5),
        ),
        const SizedBox(height: 14),
        for (final line in kHelpLines) ...[
          _LineRow(line: line, onCall: () => _call(line), onCopy: () => _copy(line)),
          const SizedBox(height: 12),
        ],
        Text(
          'Somewhere else? Call your local emergency number.',
          style: s.fonts.body(compact ? 14.5 : 15.5, s.text, weight: FontWeight.w700),
        ),
        Semantics(
          liveRegion: true,
          container: true,
          child: _note == null
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(_note!, style: s.fonts.body(14.5, s.textMuted)),
                ),
        ),
      ],
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({required this.line, required this.onCall, required this.onCopy});

  final HelpLine line;
  final VoidCallback onCall;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(s.radiusMedium),
        border: Border.all(color: s.control, width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MergeSemantics(
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
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              NpButton(
                label: 'Call',
                icon: Icons.call_rounded,
                minHeight: 48,
                semanticLabel: 'Call ${line.number}, ${line.what}',
                onPressed: onCall,
              ),
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
        ],
      ),
    );
  }
}

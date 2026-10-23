// Settings → Backend connection: which addresses are tried, which one is
// in use, why the others failed, and a custom address field.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../data/backend.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_text.dart';
import 'settings_section.dart';

class BackendSection extends StatefulWidget {
  const BackendSection({super.key});

  @override
  State<BackendSection> createState() => _BackendSectionState();
}

class _BackendSectionState extends State<BackendSection> {
  late final TextEditingController _address = TextEditingController(
    text: context.read<Backend>().customAddress ?? '',
  );
  String? _addressError;

  @override
  void dispose() {
    _address.dispose();
    super.dispose();
  }

  Future<void> _save(Backend backend, {bool clear = false}) async {
    if (clear) _address.clear();
    final error = await backend.setCustomAddress(clear ? null : _address.text);
    if (!mounted) return;
    setState(() => _addressError = error);
    if (error == null && backend.customAddress != null) {
      _address.text = backend.customAddress!;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final backend = context.watch<Backend>();
    final active = backend.active;

    final String status;
    switch (backend.state) {
      case BackendState.checking:
        status = 'Checking…';
      case BackendState.online:
        status = 'Connected via ${active!.label}';
      case BackendState.offline:
        status = 'Offline — no address answered';
    }

    return SettingsSection(
      title: 'Backend connection',
      children: [
        Semantics(
          liveRegion: true,
          child: Row(
            children: [
              Led(on: backend.isOnline),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  status,
                  style: s.fonts.body(15, s.text, weight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        for (final c in backend.candidates)
          _CandidateRow(
            candidate: c,
            result: backend.results
                .where((r) => r.candidate.base == c.base)
                .firstOrNull,
            active: active?.base == c.base,
          ),
        const SizedBox(height: 6),
        Text(
          'Tried in this order; the first one that answers is used.',
          style: s.fonts.body(13, s.textFaint),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _address,
          keyboardType: TextInputType.url,
          autocorrect: false,
          style: s.fonts.mono(14.5, s.text),
          decoration: InputDecoration(
            labelText: 'Custom address (tried first)',
            hintText: 'http://192.168.1.20:4000',
            errorText: _addressError,
          ),
          onSubmitted: (_) => _save(backend),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            NpButton(
              label: 'Save address',
              onPressed: () => _save(backend),
            ),
            if (backend.customAddress != null)
              NpButton(
                label: 'Clear',
                kind: NpButtonKind.ghost,
                onPressed: () => _save(backend, clear: true),
              ),
            NpButton(
              label: 'Check now',
              icon: Icons.network_check_rounded,
              kind: NpButtonKind.ghost,
              onPressed: backend.state == BackendState.checking
                  ? null
                  : () => unawaited(backend.probe()),
            ),
          ],
        ),
      ],
    );
  }
}

class _CandidateRow extends StatelessWidget {
  const _CandidateRow({
    required this.candidate,
    required this.result,
    required this.active,
  });

  final BackendCandidate candidate;
  final CandidateResult? result;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final r = result;
    final String state;
    final IconData icon;
    final Color color;
    if (r == null) {
      state = 'not checked yet';
      icon = Icons.help_outline_rounded;
      color = s.textFaint;
    } else if (r.reachable) {
      state = 'answers${r.latencyMs == null ? '' : ' in ${r.latencyMs} ms'}';
      icon = Icons.check_circle_outline_rounded;
      color = s.accentText;
    } else {
      state = r.error ?? 'no answer';
      icon = Icons.cancel_outlined;
      color = s.warn;
    }
    return Semantics(
      container: true,
      label:
          '${candidate.label}, ${candidate.base}: $state${active ? ', in use' : ''}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(icon, size: 20, color: color),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${candidate.label}${active ? '  ·  in use' : ''}',
                    style: s.fonts.body(14.5, s.text, weight: FontWeight.w700),
                  ),
                  Text(candidate.base, style: s.fonts.mono(12, s.textMuted)),
                  Text(state, style: s.fonts.body(13, color)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

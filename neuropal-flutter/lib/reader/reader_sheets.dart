// The reader's two settings sheets:
//   * "Aa" — reading font, text size, line spacing (with a live preview),
//   * Voice — the device's TTS voices, English and best quality first.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../data/settings_controller.dart';
import '../theme/np_style.dart';
import '../theme/np_type.dart';
import '../widgets/np_busy.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_pressable.dart';
import '../widgets/np_sheet.dart';
import '../widgets/np_text.dart';
import 'reader_controller.dart';
import 'speech_engine.dart';

/// The family for a reader-font choice ("Skin" = the skin's body font).
String readerFontFamily(String choice, NpStyle s) =>
    choice == 'Skin' ? s.fonts.bodyFamily : choice;

Future<void> showTextSettingsSheet(BuildContext context) => showNpSheet<void>(
  context,
  title: 'Text',
  builder: (_) => const _TextSettings(),
);

class _TextSettings extends StatelessWidget {
  const _TextSettings();

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final settings = context.watch<SettingsController>();
    final family = readerFontFamily(settings.readerFont, s);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(18, 6, 18, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const NpLabel('Reading font'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final font in kReaderFonts)
                NpChip(
                  label: font == 'Skin' ? 'Skin font' : font,
                  selected: settings.readerFont == font,
                  labelStyle: TextStyle(
                    fontFamily: readerFontFamily(font, s),
                    fontSize: 15,
                  ),
                  onTap: () => settings.setReaderFont(font),
                ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              const Expanded(child: NpLabel('Text size')),
              NpIconButton(
                icon: Icons.text_decrease_rounded,
                semanticLabel: 'Smaller text',
                onPressed: settings.readerFontSize > 14
                    ? () => settings.setReaderFontSize(settings.readerFontSize - 1)
                    : null,
              ),
              Semantics(
                liveRegion: true,
                label: 'Text size ${settings.readerFontSize.round()}',
                excludeSemantics: true,
                child: SizedBox(
                  width: 52,
                  child: Text(
                    settings.readerFontSize.round().toString(),
                    textAlign: TextAlign.center,
                    style: s.fonts.mono(15, s.text, weight: FontWeight.w700),
                  ),
                ),
              ),
              NpIconButton(
                icon: Icons.text_increase_rounded,
                semanticLabel: 'Larger text',
                onPressed: settings.readerFontSize < 30
                    ? () => settings.setReaderFontSize(settings.readerFontSize + 1)
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 14),
          const NpLabel('Line spacing'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final h in const [1.4, 1.6, 1.8])
                NpChip(
                  label: h.toStringAsFixed(1),
                  semanticLabel: 'Line spacing $h',
                  selected: (settings.readerLineHeight - h).abs() < 0.05,
                  onTap: () => settings.setReaderLineHeight(h),
                ),
            ],
          ),
          const SizedBox(height: 18),
          const NpLabel('Preview'),
          const SizedBox(height: 8),
          Text(
            'The correlation term survives even when each arm is separately '
            'incoherent.',
            style: TextStyle(
              fontFamily: family,
              fontFamilyFallback: kGlyphFallback,
              fontSize: settings.readerFontSize,
              height: settings.readerLineHeight,
              color: s.text,
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> showVoicePicker(BuildContext context) => showNpSheet<void>(
  context,
  title: 'Voice',
  heightFactor: 0.72,
  builder: (_) => const _VoicePicker(),
);

class _VoicePicker extends StatefulWidget {
  const _VoicePicker();

  @override
  State<_VoicePicker> createState() => _VoicePickerState();
}

class _VoicePickerState extends State<_VoicePicker> {
  late final Future<List<TtsVoice>> _voices = context
      .read<ReaderController>()
      .voices();
  bool _allLanguages = false;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final settings = context.watch<SettingsController>();

    return FutureBuilder<List<TtsVoice>>(
      future: _voices,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: NpBusy());
        }
        final all = snapshot.data ?? const <TtsVoice>[];
        final english = all
            .where((v) => v.locale.toLowerCase().startsWith('en'))
            .toList();
        final shown = _allLanguages || english.isEmpty ? all : english;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 8),
              child: Text(
                'On-device voices from your phone’s speech engine. '
                'High-quality, offline voices are listed first.',
                style: s.fonts.body(13.5, s.textMuted),
              ),
            ),
            if (english.isNotEmpty && english.length != all.length)
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 0, 18, 8),
                child: Wrap(
                  spacing: 8,
                  children: [
                    NpChip(
                      label: 'English',
                      selected: !_allLanguages,
                      onTap: () => setState(() => _allLanguages = false),
                    ),
                    NpChip(
                      label: 'All languages',
                      selected: _allLanguages,
                      onTap: () => setState(() => _allLanguages = true),
                    ),
                  ],
                ),
              ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                itemCount: shown.length + 1,
                itemBuilder: (context, i) {
                  if (i == 0) {
                    return _VoiceRow(
                      title: 'System default (English)',
                      detail: 'Whatever voice the engine picks for en-US',
                      selected: settings.voice == null,
                      onTap: () {
                        settings.setVoice(null);
                        Navigator.of(context).maybePop();
                      },
                    );
                  }
                  final v = shown[i - 1];
                  final detail = [
                    v.locale,
                    if (v.quality != null && v.quality!.isNotEmpty)
                      '${v.quality} quality',
                    if (v.networkRequired) 'needs internet',
                  ].join(' · ');
                  return _VoiceRow(
                    title: v.name,
                    detail: detail,
                    selected: v.matches(settings.voice),
                    onTap: () {
                      settings.setVoice(v.toChoice());
                      Navigator.of(context).maybePop();
                    },
                  );
                },
              ),
            ),
            if (all.isEmpty)
              Padding(
                padding: const EdgeInsets.all(18),
                child: Text(
                  'The speech engine reported no voices. Install or enable a '
                  'text-to-speech engine in the phone’s settings.',
                  style: s.fonts.body(14, s.textMuted),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _VoiceRow extends StatelessWidget {
  const _VoiceRow({
    required this.title,
    required this.detail,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final String detail;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return NpPressable(
      onTap: onTap,
      selected: selected,
      focusRadius: s.radiusMedium,
      builder: (context, pressed, focused) => Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected
              ? (s.isSignal ? s.panelSolid : s.accentText.withValues(alpha: 0.12))
              : Colors.transparent,
          borderRadius: BorderRadius.circular(s.radiusMedium),
          border: Border.all(
            color: selected ? s.accentText : s.line.withValues(alpha: 0.6),
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: s.fonts.body(15, s.text, weight: FontWeight.w700),
                  ),
                  Text(detail, style: s.fonts.mono(12, s.textMuted)),
                ],
              ),
            ),
            if (selected) Icon(Icons.check_rounded, color: s.accentText),
          ],
        ),
      ),
    );
  }
}

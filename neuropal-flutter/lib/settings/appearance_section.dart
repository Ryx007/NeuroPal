// Settings → Appearance: the skin, Classic theme × accent, Signal presets.
// Tiles preview each option in ITS OWN colours (resolved from the tokens).

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../theme/appearance_controller.dart';
import '../theme/classic_palette.dart';
import '../theme/css_color.dart';
import '../theme/np_style.dart';
import '../theme/signal_palette.dart';
import '../theme/token_palette.dart';
import '../theme/tokens.g.dart';
import '../widgets/np_pressable.dart';
import '../widgets/np_segmented.dart';
import '../widgets/np_text.dart';
import 'settings_section.dart';

class AppearanceSection extends StatelessWidget {
  const AppearanceSection({super.key});

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final appearance = context.watch<AppearanceController>();
    final a = appearance.appearance;

    return SettingsSection(
      title: 'Appearance',
      children: [
        const NpLabel('Skin'),
        const SizedBox(height: 8),
        NpSegmented<String>(
          options: const ['classic', 'signal'],
          selected: a.skin,
          onChanged: appearance.setSkin,
          labelOf: (v) => v == 'signal' ? 'Signal' : 'Classic',
          semanticsLabelOf: (v) => v == 'signal'
              ? 'Signal skin: brutal glass'
              : 'Classic skin: calm glass, the original',
        ),
        const SizedBox(height: 6),
        Text(
          a.isSignal
              ? 'Brutal glass: hard shadows, engineering grid, red on graphite.'
              : 'Calm glass: the original NeuroPal look.',
          style: s.fonts.body(13.5, s.textMuted),
        ),
        const SizedBox(height: 16),
        if (a.isSignal) ...[
          const NpLabel('Start from a vibe'),
          const SizedBox(height: 8),
          _SignalPresets(current: appearance.signalPreset),
          const SizedBox(height: 8),
          Text(
            'Fine-tuning every setting (accent, base, motion, corners…) '
            'arrives with “Make it yours” in M2.',
            style: s.fonts.body(13, s.textFaint),
          ),
        ] else ...[
          const NpLabel('Theme'),
          const SizedBox(height: 8),
          _ClassicThemes(current: a.classic.theme),
          const SizedBox(height: 14),
          const NpLabel('Accent'),
          const SizedBox(height: 8),
          _ClassicAccents(theme: a.classic.theme, current: a.classic.accent),
        ],
        const SizedBox(height: 12),
        Text(
          'Lowest text contrast in this look: ${appearance.palette.ratio}:1 '
          '(WCAG AA needs 4.5:1).',
          style: s.fonts.mono(12, s.textMuted),
        ),
      ],
    );
  }
}

String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

class _ClassicThemes extends StatelessWidget {
  const _ClassicThemes({required this.current});

  final String current;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final controller = context.read<AppearanceController>();
    final accent = controller.appearance.classic.accent;
    return Row(
      children: [
        for (final theme in kClassicThemeNames)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3),
              child: _PreviewTile(
                selected: theme == current,
                semanticLabel: '${_cap(theme)} theme',
                label: _cap(theme),
                palette: resolveClassicPalette({'theme': theme, 'accent': accent}),
                onTap: () => controller.setClassicTheme(theme),
                radius: 14,
                child: (p) => Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Aa',
                      style: s.fonts.displaySemi(18, parseCssColor(p.onSurface)),
                    ),
                    const SizedBox(width: 5),
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: parseCssColor(p.accentFill),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _ClassicAccents extends StatelessWidget {
  const _ClassicAccents({required this.theme, required this.current});

  final String theme;
  final String current;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final controller = context.read<AppearanceController>();
    final locked = theme == 'contrast';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            for (final accent in kClassicAccentNames)
              Expanded(
                child: Builder(
                  builder: (context) {
                    final p = resolveClassicPalette({
                      'theme': theme,
                      'accent': accent,
                    });
                    final selected = accent == current && !locked;
                    return NpPressable(
                      onTap: locked
                          ? null
                          : () => controller.setClassicAccent(accent),
                      selected: selected,
                      semanticLabel: '${_cap(accent)} accent',
                      focusRadius: 22,
                      builder: (context, pressed, focused) => Opacity(
                        opacity: locked ? 0.42 : 1,
                        child: Column(
                          children: [
                            // Selected: a ring with a gap, so it shows even
                            // around a swatch of the same colour.
                            Container(
                              padding: const EdgeInsets.all(3),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: selected
                                      ? s.accentText
                                      : Colors.transparent,
                                  width: 2.5,
                                ),
                              ),
                              child: Container(
                                width: 32,
                                height: 32,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: parseCssColor(p.accentFill),
                                  border: Border.all(color: s.line),
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _cap(accent),
                              style: s.fonts.body(12.5, s.text, weight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
        if (locked)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              'High contrast keeps its own fixed colours.',
              style: s.fonts.body(13, s.textFaint),
            ),
          ),
      ],
    );
  }
}

class _SignalPresets extends StatelessWidget {
  const _SignalPresets({required this.current});

  final String? current;

  @override
  Widget build(BuildContext context) {
    final controller = context.read<AppearanceController>();
    return Wrap(
      spacing: 8,
      runSpacing: 10,
      children: [
        for (final name in kSignalPresets.keys)
          SizedBox(
            width: 92,
            child: _PreviewTile(
              selected: name == current,
              semanticLabel: '$name preset',
              label: name,
              palette: resolveSignalPalette(kSignalPresets[name]),
              onTap: () => controller.applySignalPreset(name),
              radius: kSignalCorners[kSignalPresets[name]!['corners']]!.toDouble(),
              child: (p) => _MiniSignalPreview(palette: p),
            ),
          ),
      ],
    );
  }
}

/// A small swatch drawn in ANOTHER palette's colours (theme/preset picker).
class _PreviewTile extends StatelessWidget {
  const _PreviewTile({
    required this.selected,
    required this.semanticLabel,
    required this.label,
    required this.palette,
    required this.onTap,
    required this.child,
    required this.radius,
  });

  final bool selected;
  final String semanticLabel;
  final String label;
  final TokenPalette palette;
  final VoidCallback onTap;
  final Widget Function(TokenPalette) child;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return NpPressable(
      onTap: onTap,
      selected: selected,
      semanticLabel: semanticLabel,
      focusRadius: radius,
      builder: (context, pressed, focused) => Column(
        children: [
          Container(
            height: 52,
            decoration: BoxDecoration(
              color: parseCssColor(palette.surface),
              borderRadius: BorderRadius.circular(radius),
              border: Border.all(
                color: selected ? s.accentText : parseCssColor(palette.line),
                width: selected ? 3 : 1.5,
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(radius),
              child: child(palette),
            ),
          ),
          const SizedBox(height: 5),
          Text(
            label,
            textAlign: TextAlign.center,
            style: s.fonts.mono(
              11.5,
              selected ? s.accentText : s.text,
              weight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniSignalPreview extends StatelessWidget {
  const _MiniSignalPreview({required this.palette});

  final TokenPalette palette;

  @override
  Widget build(BuildContext context) {
    final p = palette;
    final line = parseCssColor(p.line);
    return Stack(
      children: [
        Positioned(
          left: 8,
          top: 8,
          child: Container(
            width: 28,
            height: 18,
            decoration: BoxDecoration(
              color: parseCssColor(p.panelColor),
              borderRadius: BorderRadius.circular(p.shape.radiusMedium / 2),
              border: Border.all(color: line, width: 1.5),
              boxShadow: p.shape.shadow > 0
                  ? [
                      BoxShadow(
                        color: parseCssColor(p.shadowColor),
                        offset: Offset(
                          p.shape.shadow / 2,
                          p.shape.shadow / 2,
                        ),
                      ),
                    ]
                  : null,
            ),
          ),
        ),
        Positioned(
          left: 8,
          right: 8,
          bottom: 8,
          child: Container(
            height: 7,
            decoration: BoxDecoration(
              color: parseCssColor(p.accentFill),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
      ],
    );
  }
}

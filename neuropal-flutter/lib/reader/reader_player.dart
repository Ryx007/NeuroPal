// The docked player, modelled on the approved mockups ("Tidal-style"):
// scrubber on top, transport centred, tone Soft · Natural · Deep, reading
// speed (WPM), voice. It collapses to a slim mini player for more text.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../data/settings_controller.dart';
import '../theme/np_style.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_panel.dart';
import '../widgets/np_pressable.dart';
import '../widgets/np_segmented.dart';
import '../widgets/np_slider.dart';
import '../widgets/np_text.dart';
import 'lissajous_scope.dart';
import 'reader_controller.dart';
import 'reader_document.dart';
import 'wpm.dart';

class ReaderPlayer extends StatefulWidget {
  const ReaderPlayer({
    super.key,
    required this.onSeek,
    required this.onChooseVoice,
  });

  /// Seek to a global word index (the screen also re-follows the voice).
  final ValueChanged<int> onSeek;
  final VoidCallback onChooseVoice;

  @override
  State<ReaderPlayer> createState() => _ReaderPlayerState();
}

class _ReaderPlayerState extends State<ReaderPlayer> {
  bool _expanded = true;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final reader = context.watch<ReaderController>();
    final content = reader.content;
    if (content == null) return const SizedBox.shrink();
    final bottom = MediaQuery.paddingOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(10, 0, 10, 10 + bottom),
      child: NpPanel(
        blur: true,
        radius: s.isSignal ? s.radius : 28,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        child: _sized(
          s,
          _expanded
              ? _FullPlayer(
                  content: content,
                  onSeek: widget.onSeek,
                  onChooseVoice: widget.onChooseVoice,
                  onCollapse: () => setState(() => _expanded = false),
                )
              : _MiniPlayer(
                  content: content,
                  onExpand: () => setState(() => _expanded = true),
                ),
        ),
      ),
    );
  }
}

/// Collapsing/expanding animates the height — unless nothing may move.
/// (AnimatedSize must not be given a zero duration, so it is left out.)
Widget _sized(NpStyle s, Widget child) => s.still
    ? child
    : AnimatedSize(
        duration: const Duration(milliseconds: 220),
        alignment: Alignment.bottomCenter,
        child: child,
      );

class _FullPlayer extends StatelessWidget {
  const _FullPlayer({
    required this.content,
    required this.onSeek,
    required this.onChooseVoice,
    required this.onCollapse,
  });

  final ReaderDocument content;
  final ValueChanged<int> onSeek;
  final VoidCallback onChooseVoice;
  final VoidCallback onCollapse;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final reader = context.watch<ReaderController>();
    final settings = context.watch<SettingsController>();
    // With large system text, the decorative scope gives its room to the
    // tone labels.
    final showScope =
        s.isSignal && MediaQuery.textScalerOf(context).scale(14) <= 18;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (reader.speechError != null) ...[
          _SpeechErrorLine(message: reader.speechError!),
          const SizedBox(height: 8),
        ],
        Row(
          children: [
            Expanded(child: _PositionLabel(content: content)),
            NpIconButton(
              icon: Icons.keyboard_arrow_down_rounded,
              semanticLabel: 'Collapse the player',
              onPressed: onCollapse,
              outlined: false,
            ),
          ],
        ),
        _Scrubber(content: content, wpm: settings.wpm, onSeek: onSeek),
        const SizedBox(height: 4),
        _Transport(size: 64),
        const SizedBox(height: 10),
        Row(
          children: [
            if (showScope) ...[
              LissajousScope(tone: settings.tone, playing: reader.playing),
              const SizedBox(width: 10),
            ] else if (!s.isSignal) ...[
              const NpLabel('Tone'),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: NpSegmented<String>(
                options: kTones,
                selected: settings.tone,
                onChanged: settings.setTone,
                labelOf: (t) => t,
                semanticsLabelOf: (t) => '$t voice tone',
              ),
            ),
            const SizedBox(width: 8),
            NpIconButton(
              icon: Icons.record_voice_over_outlined,
              semanticLabel: settings.voice == null
                  ? 'Choose a voice. Now: system default'
                  : 'Choose a voice. Now: ${settings.voice!.name}',
              onPressed: onChooseVoice,
            ),
          ],
        ),
        const SizedBox(height: 10),
        _SpeedControl(wpm: settings.wpm, onChanged: settings.setWpm),
      ],
    );
  }
}

/// "CH 2/3 · LIGHT SOURCES" (or the word count when there are no chapters).
class _PositionLabel extends StatelessWidget {
  const _PositionLabel({required this.content});

  final ReaderDocument content;

  @override
  Widget build(BuildContext context) {
    final cursor = context.watch<WordCursor>();
    final chapter = content.chapterAt(cursor.index);
    final text = chapter == null
        ? 'Word ${formatCount(cursor.index + 1)} of ${formatCount(content.wordCount)}'
        : 'Ch ${chapter.number}/${content.chapters.length} · ${chapter.mark.title}';
    final playing = context.select<ReaderController, bool>((r) => r.playing);
    return Row(
      children: [
        Led(on: playing, live: playing),
        const SizedBox(width: 8),
        Flexible(child: NpLabel(text)),
      ],
    );
  }
}

class _Scrubber extends StatefulWidget {
  const _Scrubber({required this.content, required this.wpm, required this.onSeek});

  final ReaderDocument content;
  final int wpm;
  final ValueChanged<int> onSeek;

  @override
  State<_Scrubber> createState() => _ScrubberState();
}

class _ScrubberState extends State<_Scrubber> {
  /// While dragging: the previewed word (we only seek when you let go).
  double? _preview;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final cursor = context.watch<WordCursor>();
    final total = widget.content.wordCount;
    final last = (total - 1).clamp(0, total).toDouble();
    final word = _preview ?? cursor.index.toDouble();
    final elapsed = Duration(
      milliseconds: (word / widget.wpm * 60000).round(),
    );
    final remaining = Duration(
      milliseconds: ((total - word) / widget.wpm * 60000).round(),
    );
    final ticks = [
      if (last > 0)
        for (final c in widget.content.chapters) c.wordIndex / last,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        NpSlider(
          value: word.clamp(0, last),
          min: 0,
          max: last <= 0 ? 1 : last,
          step: 1,
          ticks: ticks,
          semanticLabel: 'Reading position',
          semanticValue: (v) {
            final pct = last <= 0 ? 0 : (v / last * 100).round();
            return 'word ${formatCount(v.round() + 1)} of ${formatCount(total)}, $pct percent';
          },
          onChanged: (v) => setState(() => _preview = v),
          onChangeEnd: (v) {
            setState(() => _preview = null);
            widget.onSeek(v.round());
          },
        ),
        ExcludeSemantics(
          child: Row(
            children: [
              Text(
                formatDuration(elapsed),
                style: s.fonts.mono(12.5, s.accentText, weight: FontWeight.w700),
              ),
              const Spacer(),
              Text(
                '−${formatDuration(remaining)}',
                style: s.fonts.mono(12.5, s.textMuted),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Transport extends StatelessWidget {
  const _Transport({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    final reader = context.watch<ReaderController>();
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        NpIconButton(
          icon: Icons.fast_rewind_rounded,
          semanticLabel: 'Back one paragraph',
          size: 52,
          iconSize: 26,
          onPressed: () => reader.skipParagraph(-1),
        ),
        const SizedBox(width: 26),
        PlayButton(
          playing: reader.playing,
          size: size,
          onPressed: reader.togglePlay,
        ),
        const SizedBox(width: 26),
        NpIconButton(
          icon: Icons.fast_forward_rounded,
          semanticLabel: 'Forward one paragraph',
          size: 52,
          iconSize: 26,
          onPressed: () => reader.skipParagraph(1),
        ),
      ],
    );
  }
}

/// The big play/pause button. Signal: a hard-shadowed slab that sinks when
/// pressed; Classic: a glowing accent circle.
class PlayButton extends StatelessWidget {
  const PlayButton({
    super.key,
    required this.playing,
    required this.onPressed,
    this.size = 64,
  });

  final bool playing;
  final VoidCallback onPressed;
  final double size;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final radius = s.isSignal ? s.radius * 0.9 : size / 2;
    return NpPressable(
      onTap: onPressed,
      semanticLabel: playing ? 'Pause' : 'Play',
      focusRadius: radius,
      minSize: Size(size, size),
      builder: (context, pressed, focused) {
        final sunk = pressed && !s.still && s.isSignal;
        final face = Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: s.accentFill,
            borderRadius: BorderRadius.circular(radius),
            border: s.isSignal && s.borderWidth > 0
                ? Border.all(color: s.shadow, width: s.borderWidth)
                : null,
            boxShadow: s.isSignal
                ? null
                : [
                    BoxShadow(
                      color: s.accentGlow,
                      blurRadius: 30,
                      offset: const Offset(0, 12),
                      spreadRadius: -6,
                    ),
                  ],
          ),
          child: Icon(
            playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
            color: s.accentInk,
            size: size * 0.48,
          ),
        );
        if (!s.isSignal || s.shadowOffset <= 0) return face;
        return CustomPaint(
          painter: sunk
              ? null
              : HardShadowPainter(
                  color: s.accentDeep,
                  offset: s.shadowOffset,
                  radius: radius,
                ),
          child: Transform.translate(
            offset: sunk ? Offset(s.shadowOffset, s.shadowOffset) : Offset.zero,
            child: face,
          ),
        );
      },
    );
  }
}

/// Reading speed: Signal = labelled fader; Classic = −/+ stepper.
class _SpeedControl extends StatelessWidget {
  const _SpeedControl({required this.wpm, required this.onChanged});

  final int wpm;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final readout = '$wpm WPM · ${speedMultiplierLabel(wpm)}';

    if (s.isSignal) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Wrap, not Row: with large text the read-out moves to its own
          // line instead of overflowing.
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 12,
            children: [
              const NpLabel('Reading speed'),
              ExcludeSemantics(
                child: Text(
                  readout,
                  style: s.fonts.mono(13, s.text, weight: FontWeight.w700),
                ),
              ),
            ],
          ),
          NpSlider(
            kind: NpSliderKind.fader,
            value: wpm.toDouble(),
            min: kMinWpm.toDouble(),
            max: kMaxWpm.toDouble(),
            step: 10,
            semanticLabel: 'Reading speed',
            semanticValue: (v) => '${v.round()} words per minute',
            onChanged: (v) => onChanged(v.round()),
          ),
        ],
      );
    }

    // Classic: the stepper from the approved mockup (±20 WPM).
    return Wrap(
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 12,
      runSpacing: 6,
      children: [
        const NpLabel('Reading speed'),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: s.shadow.withValues(alpha: s.dark ? 0.28 : 0.06),
            borderRadius: BorderRadius.circular(s.radiusControl),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              NpIconButton(
                icon: Icons.remove_rounded,
                semanticLabel: 'Slower',
                onPressed: wpm > kMinWpm ? () => onChanged(wpm - 20) : null,
              ),
              Flexible(
                child: Semantics(
                  liveRegion: true,
                  label: '$wpm words per minute',
                  excludeSemantics: true,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minWidth: 96),
                    child: Text(
                      readout,
                      textAlign: TextAlign.center,
                      style: s.fonts.mono(13, s.accentText),
                    ),
                  ),
                ),
              ),
              NpIconButton(
                icon: Icons.add_rounded,
                semanticLabel: 'Faster',
                onPressed: wpm < kMaxWpm ? () => onChanged(wpm + 20) : null,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MiniPlayer extends StatelessWidget {
  const _MiniPlayer({required this.content, required this.onExpand});

  final ReaderDocument content;
  final VoidCallback onExpand;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final reader = context.watch<ReaderController>();
    final cursor = context.watch<WordCursor>();
    final last = content.wordCount - 1;
    return Row(
      children: [
        PlayButton(
          playing: reader.playing,
          size: 48,
          onPressed: reader.togglePlay,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _PositionLabel(content: content),
              const SizedBox(height: 6),
              ExcludeSemantics(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: LinearProgressIndicator(
                    minHeight: 4,
                    value: last <= 0 ? 0 : cursor.index / last,
                    backgroundColor: s.isSignal ? s.panelSolid : s.surfaceHigh,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        NpIconButton(
          icon: Icons.keyboard_arrow_up_rounded,
          semanticLabel: 'Expand the player',
          onPressed: onExpand,
          outlined: false,
        ),
      ],
    );
  }
}

class _SpeechErrorLine extends StatelessWidget {
  const _SpeechErrorLine({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    return Semantics(
      liveRegion: true,
      child: Row(
        children: [
          Icon(Icons.warning_amber_rounded, color: s.warn, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message, style: s.fonts.body(13.5, s.text)),
          ),
          NpIconButton(
            icon: Icons.close_rounded,
            semanticLabel: 'Dismiss the speech error',
            outlined: false,
            onPressed: context.read<ReaderController>().dismissSpeechError,
          ),
        ],
      ),
    );
  }
}

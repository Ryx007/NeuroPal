// The calming steps (DBT TIPP), worded as the web app's CalmView.tsx (after
// the Expo app's EmergencyScreen): body first, one step at a time; a paced
// breathing guide (it moves only when motion is allowed, otherwise a
// counted guide in words); people to call; "I’m OK for now" goes back to
// where you were.
//
// It works with no network and no session — the Sign-in screen has a way
// in too — and nothing here is sent anywhere. Without a session there is no
// drawer (it would lead past sign-in): a Back button instead.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../app_routes.dart';
import '../auth/auth_controller.dart';
import '../data/settings_controller.dart';
import '../theme/np_style.dart';
import '../widgets/now_playing_bar.dart';
import '../widgets/np_background.dart';
import '../widgets/np_buttons.dart';
import '../widgets/np_panel.dart';
import '../widgets/np_scaffold.dart';
import '../widgets/np_text.dart';
import 'help_lines.dart';

class CalmStep {
  const CalmStep(this.letter, this.title, this.time, this.body);

  final String letter;
  final String title;
  final String time;
  final String body;
}

const List<CalmStep> kCalmSteps = [
  CalmStep(
    'T',
    'Temperature',
    'About 1 minute',
    'Splash cold water on your face, or hold something cold to your eyes '
        'and cheeks. The cold slows your heart rate down.',
  ),
  CalmStep(
    'I',
    'Intense movement',
    'About 2 minutes',
    'Move hard for a short burst: jumping jacks, running on the spot, fast '
        'stairs. It uses up the extra energy in your body.',
  ),
  CalmStep(
    'P',
    'Paced breathing',
    'About 4 minutes',
    'Breathe in for 4, hold for 2, breathe out for 6. A longer out-breath '
        'tells your body it is safe. The guide is right here.',
  ),
  CalmStep(
    'P',
    'Paired relaxation',
    'About 3 minutes',
    'Tense one group of muscles as hard as you can for 5 seconds, then let '
        'go completely. Notice the tension leaving.',
  ),
];

class CalmScreen extends StatefulWidget {
  const CalmScreen({super.key});

  @override
  State<CalmScreen> createState() => _CalmScreenState();
}

class _CalmScreenState extends State<CalmScreen> {
  final _helpKey = GlobalKey();
  int _step = 0;

  void _done() {
    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      navigator.pop();
    } else {
      goToRoute(context, AppRoutes.home, from: AppRoutes.calm);
    }
  }

  void _toHelp() {
    final target = _helpKey.currentContext;
    if (target == null) return;
    final s = NpStyle.of(context);
    unawaited(
      Scrollable.ensureVisible(
        target,
        duration: s.still ? Duration.zero : const Duration(milliseconds: 350),
        alignment: 0.05,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final signedOut =
        context.select<AuthController, bool>((a) => a.needsSignIn) &&
        !context.select<SettingsController, bool>((x) => x.demoMode);
    final current = kCalmSteps[_step];
    final last = _step == kCalmSteps.length - 1;

    final body = ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // The bar above already says "Calming steps": the first
                // step and its Next button fit on a phone without scrolling.
                Text(
                  'When everything is too much, start with the body. One step '
                  'at a time. Nothing else is needed from you right now.',
                  style: s.fonts.body(16, s.text, height: 1.5),
                ),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerLeft,
                  child: NpButton(
                    label: 'Talk to someone now',
                    icon: Icons.phone_rounded,
                    kind: NpButtonKind.ghost,
                    minHeight: 48,
                    onPressed: _toHelp,
                  ),
                ),
                const SizedBox(height: 16),
                _StepCard(
                  step: _step,
                  current: current,
                  last: last,
                  onBack: _step == 0 ? null : () => setState(() => _step -= 1),
                  onNext: last ? _done : () => setState(() => _step += 1),
                ),
                const SizedBox(height: 14),
                const _Breathing(),
                const SizedBox(height: 14),
                NpPanel(
                  key: _helpKey,
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
                  child: const HelpLines(),
                ),
                const SizedBox(height: 14),
                NpPanel(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'This feeling is temporary. Your body knows the way back '
                        'to calm, and you are already helping it.',
                        style: s.fonts
                            .body(15.5, s.textMuted, height: 1.55)
                            .copyWith(fontStyle: FontStyle.italic),
                      ),
                      const SizedBox(height: 12),
                      NpButton(
                        label: 'I’m OK for now',
                        kind: NpButtonKind.ghost,
                        minHeight: 48,
                        onPressed: _done,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );

    if (!signedOut) {
      return NpScaffold(
        route: AppRoutes.calm,
        header: const NpHeader(title: NpHeaderTitle('Calming steps')),
        bottom: const NowPlayingBar(from: AppRoutes.calm),
        body: body,
      );
    }
    return _SignedOutFrame(onBack: _done, child: body);
  }
}

/// Without a session: the app's background and band, a Back button, no
/// drawer.
class _SignedOutFrame extends StatelessWidget {
  const _SignedOutFrame({required this.onBack, required this.child});

  final VoidCallback onBack;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final bandIsDark =
        ThemeData.estimateBrightnessForColor(s.statusBand) == Brightness.dark;
    final top = MediaQuery.paddingOf(context).top;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: (bandIsDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark)
          .copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: s.surface,
        body: Stack(
          children: [
            const Positioned.fill(child: NpBackground()),
            Column(
              children: [
                Container(height: top, color: s.statusBand),
                Container(
                  constraints: const BoxConstraints(minHeight: 60),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: s.panel,
                    border: Border(
                      bottom: s.isSignal
                          ? BorderSide(color: s.line, width: s.borderWidth)
                          : BorderSide(color: s.line.withValues(alpha: 0.5)),
                    ),
                  ),
                  child: Row(
                    children: [
                      NpIconButton(
                        icon: Icons.arrow_back_rounded,
                        semanticLabel: 'Back to sign-in',
                        onPressed: onBack,
                      ),
                      const SizedBox(width: 10),
                      const Expanded(child: NpHeaderTitle('Calming steps')),
                    ],
                  ),
                ),
                Expanded(child: SafeArea(top: false, child: child)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StepCard extends StatelessWidget {
  const _StepCard({
    required this.step,
    required this.current,
    required this.last,
    required this.onBack,
    required this.onNext,
  });

  final int step;
  final CalmStep current;
  final bool last;
  final VoidCallback? onBack;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final n = kCalmSteps.length;
    final letter = Container(
      width: 64,
      height: 64,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: s.accentFill,
        borderRadius: BorderRadius.circular(s.isSignal ? s.radiusMedium : 18),
        border: s.isSignal && s.borderWidth > 0
            ? Border.all(color: s.shadow, width: s.borderWidth)
            : null,
      ),
      child: Text(current.letter, style: s.fonts.display(36, s.accentInk)),
    );
    final progress = Semantics(
      label: [
        for (var i = 0; i < n; i++)
          '${kCalmSteps[i].title}${i < step ? ', done' : (i == step ? ', current' : '')}',
      ].join('; '),
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < n; i++)
            Container(
              width: 34,
              height: 6,
              margin: const EdgeInsets.only(left: 6),
              decoration: BoxDecoration(
                color: i <= step ? s.accentFill : s.text.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(99),
                border: i == step ? Border.all(color: s.text, width: 1.5) : null,
              ),
            ),
        ],
      ),
    );

    return NpPanel(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 10,
            runSpacing: 8,
            children: [NpLabel('Step ${step + 1} of $n'), progress],
          ),
          const SizedBox(height: 16),
          // Read out when the step changes; focus stays on the buttons.
          Semantics(
            liveRegion: true,
            container: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // A Wrap: at large text the title moves under the letter
                // instead of breaking inside a word.
                Wrap(
                  spacing: 14,
                  runSpacing: 10,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    ExcludeSemantics(child: letter),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Semantics(
                          header: true,
                          child: Text(
                            current.title,
                            style: s.isSignal
                                ? s.fonts.display(28, s.text)
                                : s.fonts.display(26, s.text),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(current.time, style: s.fonts.mono(14, s.textMuted)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(current.body, style: s.fonts.body(17, s.text, height: 1.5)),
                if (step <= 1) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.only(left: 12),
                    decoration: BoxDecoration(
                      border: Border(left: BorderSide(color: s.warn, width: 3)),
                    ),
                    child: Text(
                      'Skip this one if you have a heart condition or it doesn’t '
                      'feel safe. Breathing always works.',
                      style: s.fonts.body(15, s.textMuted, height: 1.5),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              NpButton(
                label: 'Back',
                icon: Icons.arrow_back_rounded,
                kind: NpButtonKind.ghost,
                semanticLabel: 'Back to the previous step',
                onPressed: onBack,
              ),
              NpButton(
                label: last ? 'I’m OK for now' : 'Next step',
                icon: last ? Icons.spa_outlined : Icons.arrow_forward_rounded,
                onPressed: onNext,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Paced breathing: in 4, hold 2, out 6. The circle moves only when motion
/// is allowed; the counted guide in words is always there.
class _Breathing extends StatefulWidget {
  const _Breathing();

  @override
  State<_Breathing> createState() => _BreathingState();
}

class _BreathingState extends State<_Breathing> {
  static const _cycle = 12;
  Timer? _timer;
  int _tick = 0;

  bool get _running => _timer != null;

  void _toggle() {
    setState(() {
      _tick = 0;
      if (_running) {
        _timer!.cancel();
        _timer = null;
      } else {
        _timer = Timer.periodic(const Duration(seconds: 1), (_) {
          if (mounted) setState(() => _tick += 1);
        });
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Motion switched off meanwhile: the moving guide stops.
    if (NpStyle.of(context).still && _running) {
      _timer!.cancel();
      _timer = null;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// The phase at second [t] of the cycle: its name and count.
  static (String, int) _phase(int t) {
    final x = t % _cycle;
    if (x < 4) return ('Breathe in', x + 1);
    if (x < 6) return ('Hold', x - 3);
    return ('Breathe out', x - 5);
  }

  /// The circle's size at second [t] (0.55 → 1 in, held, → 0.55 out).
  static double _scale(int t) {
    final x = t % _cycle;
    if (x <= 4) return 0.55 + 0.45 * (x / 4);
    if (x <= 6) return 1;
    return 1 - 0.45 * ((x - 6) / 6);
  }

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final motion = !s.still;
    final (name, count) = _phase(_tick);
    final breaths = _tick ~/ _cycle + 1;

    Widget counted(String phase, String counts) => Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '$phase  ',
              style: s.fonts.body(16, s.text, weight: FontWeight.w700),
            ),
            TextSpan(text: counts, style: s.fonts.mono(15, s.textMuted)),
          ],
        ),
      ),
    );

    return NpPanel(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(
              'Breathe with me',
              style: s.isSignal
                  ? s.fonts.display(24, s.text)
                  : s.fonts.display(22, s.text),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'In for 4, hold for 2, out for 6. Longer out than in.',
            style: s.fonts.body(15.5, s.textMuted),
          ),
          if (motion) ...[
            const SizedBox(height: 12),
            ExcludeSemantics(
              child: SizedBox(
                height: 220,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    AnimatedScale(
                      scale: _running ? _scale(_tick + 1) : 0.55,
                      duration: const Duration(seconds: 1),
                      child: Container(
                        width: 200,
                        height: 200,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: s.accentFill, width: 3),
                          gradient: RadialGradient(
                            colors: [
                              s.accentFill.withValues(alpha: 0.24),
                              s.accentFill.withValues(alpha: 0.06),
                            ],
                          ),
                        ),
                      ),
                    ),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _running ? name : 'Ready',
                          style: s.fonts.body(17, s.text, weight: FontWeight.w700),
                        ),
                        if (_running)
                          Text('$count', style: s.fonts.display(34, s.text)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            if (_running)
              Semantics(
                label:
                    'The circle grows while you breathe in, rests while you '
                    'hold, and shrinks while you breathe out.',
                child: const SizedBox(width: 1, height: 1),
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                NpButton(
                  label: _running ? 'Stop' : 'Start breathing',
                  icon: _running ? Icons.stop_rounded : Icons.play_arrow_rounded,
                  kind: _running ? NpButtonKind.ghost : NpButtonKind.primary,
                  onPressed: _toggle,
                ),
                if (_running)
                  Text('Breath $breaths', style: s.fonts.mono(14, s.textMuted)),
              ],
            ),
          ],
          const SizedBox(height: 14),
          Semantics(
            label: 'Counted guide',
            container: true,
            explicitChildNodes: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                counted('Breathe in', '1 · 2 · 3 · 4'),
                counted('Hold', '1 · 2'),
                counted('Breathe out', '1 · 2 · 3 · 4 · 5 · 6'),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Repeat for a few minutes, or for as long as it helps.',
            style: s.fonts.body(14.5, s.textMuted),
          ),
        ],
      ),
    );
  }
}

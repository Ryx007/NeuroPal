// Pal as a buddy: a small floating Pal, bottom-right on Home, the Library
// and Settings, that opens the assistant sheet (the Expo app's PalBuddy).
// Its face follows the check-in (okay → okay, a bit off → off, overwhelmed
// → over); it breathes only when motion is allowed. During "Sit with me" it
// becomes a pill with the time left, so Pal stays in sight — even when the
// bubble is hidden.
//
// Where it stays away: the Reader (its own player and text), the calming
// steps (one thing at a time there), and any screen while the keyboard is
// up (it would sit on the field being typed in). It floats over the
// screen's body, above the now-playing bar; screens leave room for it under
// their last row ([palBubbleClearance]).

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_routes.dart';
import '../day/day_models.dart';
import '../day/day_store.dart';
import '../home/home_logic.dart' show moodFor;
import '../reader/reader_controller.dart';
import '../theme/appearance_controller.dart';
import '../theme/np_style.dart';
import '../theme/pal.dart';
import '../widgets/np_panel.dart';
import '../widgets/np_pressable.dart';
import 'pal_avatar.dart';
import 'pal_controller.dart';
import 'pal_logic.dart';
import 'pal_models.dart';
import 'pal_sheet.dart';

const double kPalBubbleSize = 52;

/// Routes where the bubble never shows (the sheet still opens there from
/// the menu).
const Set<String> kPalBubbleHiddenOn = {AppRoutes.reader, AppRoutes.calm};

const double _edge = 16;

/// Whether the bubble shows on [route] right now.
bool palBubbleShows(BuildContext context, String route) {
  if (kPalBubbleHiddenOn.contains(route)) return false;
  final pal = context.watch<PalController>();
  return !pal.bubbleHidden || pal.sit != null;
}

/// True while the now-playing bar is under the body (the same rule as
/// NowPlayingBar): it already keeps clear of the system's bottom inset.
bool _nowPlaying(BuildContext context) => context.select<ReaderController, bool>(
  (r) => r.document != null && r.phase == ReaderPhase.ready,
);

/// Bottom padding a scrolling screen needs so the bubble never sits on its
/// last row: 0 where no bubble shows.
double palBubbleClearance(BuildContext context, String route) {
  if (!palBubbleShows(context, route)) return 0;
  final inset = _nowPlaying(context) ? 0.0 : MediaQuery.paddingOf(context).bottom;
  return inset + _edge + kPalBubbleSize + 12;
}

/// The bubble's place in a screen's body (a child of a Stack).
class PalBubbleSlot extends StatelessWidget {
  const PalBubbleSlot({super.key, required this.route});

  final String route;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    if (!palBubbleShows(context, route) || media.viewInsets.bottom > 0) {
      return const SizedBox.shrink();
    }
    final bottom = _edge + (_nowPlaying(context) ? 0 : media.padding.bottom);
    return Positioned(
      right: _edge + media.padding.right,
      bottom: bottom,
      child: PalBubble(onTap: () => showPalSheet(context, from: route)),
    );
  }
}

/// What the pill says during a sit: [short] on screen, [spoken] for screen
/// readers (it starts with the visible words, so voice control matches).
({String short, String spoken})? sitStatus(PalSit? sit, int now) {
  if (sit == null) return null;
  if (sit.ended) return (short: 'Nice. Note it?', spoken: 'Nice. Note it? Your session is done.');
  if (sit.checkIn == SitCheck.asked) {
    return (short: 'Still with it?', spoken: 'Still with it? Either answer is fine.');
  }
  final ms = sit.endsAt - now;
  if (ms < 60000) {
    return (short: '<1 min', spoken: '<1 min: under a minute left, sitting with you.');
  }
  final m = (ms / 60000).ceil();
  return (short: '$m min', spoken: '$m min left, sitting with you.');
}

class PalBubble extends StatelessWidget {
  const PalBubble({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<PalController>();
    final pal = context.select<AppearanceController, PalSettings>((a) => a.appearance.pal);
    final mood = moodFor(context.select<DayStore, NervousState?>((d) => d.state));
    final sit = controller.sit;
    if (sit == null || sit.ended || sit.checkIn == SitCheck.asked) {
      return _Bubble(pal: pal, mood: mood, status: sitStatus(sit, controller.nowMs()), onTap: onTap);
    }
    // A running sit: the minutes follow the clock.
    return ValueListenableBuilder<int>(
      valueListenable: controller.clock,
      builder: (context, _, _) => _Bubble(
        pal: pal,
        mood: mood,
        status: sitStatus(controller.sit, controller.nowMs()),
        onTap: onTap,
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.pal, required this.mood, required this.status, required this.onTap});

  final PalSettings pal;
  final PalMood mood;
  final ({String short, String spoken})? status;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = NpStyle.of(context);
    final shadow = s.isSignal ? (s.shadowOffset < 3 ? 3.0 : s.shadowOffset) : 0.0;
    final radius = s.isSignal ? s.radiusControl : kPalBubbleSize / 2;
    final said = status;
    final label = said == null
        ? 'Open ${pal.name}, your assistant'
        : '${said.spoken} Open ${pal.name}, your assistant.';
    return NpPressable(
      onTap: onTap,
      semanticLabel: label,
      focusRadius: radius,
      minSize: const Size(kPalBubbleSize, kPalBubbleSize),
      builder: (context, pressed, focused) {
        final sunk = pressed && shadow > 0 && !s.still;
        Widget body = Container(
          constraints: const BoxConstraints(minWidth: kPalBubbleSize, minHeight: kPalBubbleSize),
          padding: EdgeInsets.only(right: said == null ? 0 : 14),
          decoration: BoxDecoration(
            color: s.isSignal ? s.surfaceContainer : s.surfaceContainer.withValues(alpha: 0.96),
            borderRadius: BorderRadius.circular(radius),
            // An edge of at least 3:1 in every skin (WCAG 1.4.11).
            border: Border.all(
              color: s.control,
              width: s.isSignal ? (s.borderWidth < 1.5 ? 1.5 : s.borderWidth) : 1,
            ),
            boxShadow: s.isSignal
                ? null
                : [
                    BoxShadow(
                      color: s.shadow.withValues(alpha: 0.28),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: kPalBubbleSize - 4,
                height: kPalBubbleSize - 4,
                child: Center(child: PalAvatar(pal: pal, size: kPalBubbleSize - 4, mood: mood)),
              ),
              if (said != null)
                Text(
                  s.isSignal ? said.short.toUpperCase() : said.short,
                  maxLines: 1,
                  style: s.isSignal
                      ? s.fonts.label(s.text, size: 12)
                      : s.fonts.body(13.5, s.text, weight: FontWeight.w600),
                ),
            ],
          ),
        );
        if (shadow > 0) {
          body = CustomPaint(
            painter: sunk ? null : HardShadowPainter(color: s.shadow, offset: shadow, radius: radius),
            child: Transform.translate(
              offset: sunk ? Offset(shadow, shadow) : Offset.zero,
              child: body,
            ),
          );
        }
        return body;
      },
    );
  }
}

/// The drawer's line for Pal ("Sitting with you · 12 min left").
String palDrawerDetail(PalController pal) {
  final sit = pal.sit;
  if (sit == null) return 'Your assistant';
  if (sit.ended) return 'Done. Want to note it?';
  return 'Sitting with you · ${leftLabel(sit.endsAt, pal.nowMs())}';
}

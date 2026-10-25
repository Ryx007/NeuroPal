import { useMemo } from "react";

import { useTheme } from "../../theme/ThemeProvider";

// ---------------------------------------------------------------------------
// Home motion, in one place so it is easy to tune. Durations are in ms,
// distances in px. These are the values for the "Lively" motion setting;
// MOTION_SCALE below derives the other levels from them:
//
//   Still  → nothing moves; every change is instant (also when the phone's
//            "reduce motion" setting is on — ThemeProvider maps that to Still)
//   Calm   → fades only (no travel, no bounce), and slower
//   Lively → exactly these numbers
//   Wild   → a little more travel and bounce
//
// Rules every effect here follows: nothing flashes faster than ~1 Hz, no
// loops except the focus scope's slow drift, and text never moves while you
// read it (only entrances on mount and press feedback under your finger).
// ---------------------------------------------------------------------------

export const HOME_MOTION = {
  // Signal Home tiles fade in and rise into place, one after another, on mount.
  entrance: { rise: 10, stagger: 40, duration: 320 },
  // A pressed tile sinks into its hard offset shadow (Signal).
  press: { damping: 22, stiffness: 520, mass: 0.6 },
  // One soft wash of the new state colour through the check-in tile.
  statePulse: { peak: 0.16, up: 180, down: 640 },
  // …and a fainter one across the Signal backdrop behind Home.
  backdropWash: { peak: 0.09, up: 360, down: 1200 },
  // Overwhelmed (red) gets a gentler version of both: calm, not alarming.
  redSoftening: 0.5,
  // Anchor ruler: the "now" marker glides to its new spot.
  ruler: { duration: 700 },
  // Focus scope drift while a block runs, radians per second.
  scope: { speed: 0.15 },
  // Pal hops when your state changes (a small nod down for "a bit off").
  pal: { hop: 6, nod: 3, up: 140 },
  // Check-in slider knob.
  slider: {
    lift: 1.12, // knob scale while your finger is on it
    settle: { damping: 18, stiffness: 240, mass: 0.7 }, // knob gliding to a tapped spot
    calmSettle: 240, // Calm: an eased glide instead of a spring
  },
};

// How each motion level scales the numbers above.
//   travel — multiplies distances (0 = fades only)
//   time   — multiplies durations
//   bounce — multiplies spring bounciness (lower damping)
export const MOTION_SCALE = {
  Still: { on: false, travel: 0, time: 1, bounce: 0 },
  Calm: { on: true, travel: 0, time: 1.6, bounce: 0 },
  Lively: { on: true, travel: 1, time: 1, bounce: 1 },
  Wild: { on: true, travel: 1.4, time: 0.9, bounce: 1.7 },
};

function springFor(base, bounce) {
  return { damping: base.damping / Math.max(1, bounce), stiffness: base.stiffness, mass: base.mass };
}

// Resolve the constants for one motion level into concrete numbers.
export function resolveHomeMotion(level) {
  const s = MOTION_SCALE[level] || MOTION_SCALE.Lively;
  const M = HOME_MOTION;
  const t = (ms) => Math.round(ms * s.time);
  return {
    level,
    on: s.on,
    travels: s.on && s.travel > 0,
    entrance: { rise: M.entrance.rise * s.travel, stagger: t(M.entrance.stagger), duration: t(M.entrance.duration) },
    // null → instant (the press still shows, it just doesn't spring)
    press: s.on && s.travel > 0 ? springFor(M.press, s.bounce) : null,
    statePulse: { peak: M.statePulse.peak * (level === "Wild" ? 1.25 : level === "Calm" ? 0.8 : 1), up: t(M.statePulse.up), down: t(M.statePulse.down) },
    backdropWash: { peak: M.backdropWash.peak * (level === "Wild" ? 1.25 : level === "Calm" ? 0.8 : 1), up: t(M.backdropWash.up), down: t(M.backdropWash.down) },
    redSoftening: M.redSoftening,
    ruler: { duration: t(M.ruler.duration) },
    // The scope keeps the field's speed ladder (Calm drifts slower).
    scope: { speed: M.scope.speed * ({ Still: 0, Calm: 0.35, Lively: 1, Wild: 1.9 }[level] ?? 1) },
    pal: { hop: M.pal.hop * s.travel, nod: M.pal.nod * s.travel, up: t(M.pal.up), bounce: s.bounce },
    slider: {
      lift: s.on && s.travel > 0 ? 1 + (M.slider.lift - 1) * Math.min(1.25, s.travel) : 1,
      // Lively/Wild spring; Calm glides (no overshoot); Still jumps.
      settle: s.on && s.travel > 0 ? springFor(M.slider.settle, s.bounce) : null,
      calmSettle: s.on && s.travel === 0 ? t(M.slider.calmSettle) : 0,
    },
  };
}

export function useHomeMotion() {
  const { motionLevel } = useTheme();
  return useMemo(() => resolveHomeMotion(motionLevel), [motionLevel]);
}

"use client";
// "How are you feeling right now?" as a real slider (a port of the Expo app's
// StateSlider). One 0–100 track in three equal regions — Okay / Bit off /
// Overwhelmed; the region the knob rests in becomes the state, and the exact
// level is kept too.
//   pointer   drag the knob, or click anywhere on the track: saves on release
//   keyboard  arrows ±5, Page Up/Down ±10, Home/End: the knob moves at once
//             and the level saves a second after the last step (or when focus
//             leaves), so you can pass through Overwhelmed on the way to 70
//             without a check-in for every key press
// Nothing here opens a page by itself (WCAG 3.2.2): Home offers the calming
// steps when the state is Overwhelmed.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { NervousState } from "@/lib/neuropal/day";
import { STATE_INFO, STATE_ORDER, StateGlyph } from "../common/bits";
import styles from "./slider.module.css";

// ---- the scale (stateScale.js) ---------------------------------------------------------

/** Region edges at 33.5 and 66.5, so the 0–100 number always agrees with the region. */
export const REGION_EDGES = [0.335, 0.665] as const;
export const LEVEL_STEP = 5;
const MIDDLE: Record<NervousState, number> = { green: 0.17, yellow: 0.5, red: 0.83 };
const KEY_STEPS: Record<string, number> = { ArrowRight: LEVEL_STEP, ArrowUp: LEVEL_STEP, ArrowLeft: -LEVEL_STEP, ArrowDown: -LEVEL_STEP, PageUp: 10, PageDown: -10 };
const STEP_SAVE_MS = 1000;
const KNOB = 30;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const toValue = (pos: number) => Math.round(clamp01(pos) * 100);
export const regionOf = (pos: number): 0 | 1 | 2 => (pos < REGION_EDGES[0] ? 0 : pos < REGION_EDGES[1] ? 1 : 2);
export const stateForLevel = (pos: number): NervousState => STATE_ORDER[regionOf(clamp01(pos))];
export const middleOfState = (s: NervousState) => MIDDLE[s];

/** Where the knob rests for a stored check-in: the exact level when it agrees with the state, else the region's middle; null before any check-in. */
export function levelFor(state: NervousState | null, level: number | null): number | null {
  if (!state) return null;
  const i = STATE_ORDER.indexOf(state);
  if (typeof level === "number" && Number.isFinite(level) && regionOf(clamp01(level)) === i) return clamp01(level);
  return MIDDLE[state];
}

export interface CheckInSliderProps {
  state: NervousState | null;
  level: number | null;
  /** A saved check-in. `viaSteps`: made with keys, not a drag or a click. */
  onCommit: (state: NervousState, level: number, how: { viaSteps: boolean }) => void;
  /** Live position while dragging or stepping (null when it settles), e.g. for the dial. */
  onLive?: (pos: number | null) => void;
  /** Words and glyphs under the regions (large tiles). */
  legend?: boolean;
  label?: string;
  className?: string;
}

export function CheckInSlider({ state, level, onCommit, onLive, legend = false, label = "How are you feeling, 0 to 100", className }: CheckInSliderProps) {
  const id = useId();
  const committed = levelFor(state, level);
  const [drag, setDrag] = useState<number | null>(null);
  // Key steps not saved yet, tied to the check-in they started from: a
  // check-in made elsewhere meanwhile (a state button) wins.
  const [stepped, setStepped] = useState<{ v: number; from: number | null } | null>(null);
  const pending = useRef<{ v: number; from: number | null; timer: number } | null>(null);
  const committedRef = useRef(committed);
  const commitRef = useRef(onCommit);

  useEffect(() => {
    committedRef.current = committed;
    commitRef.current = onCommit;
  });

  const stepValue = stepped && stepped.from === committed ? stepped.v : null;
  const pos = drag ?? (stepValue != null ? stepValue / 100 : committed);
  const region = pos == null ? null : regionOf(pos);
  const info = region == null ? null : STATE_INFO[STATE_ORDER[region]];
  const value = pos == null ? null : toValue(pos);
  const valueText = info && value != null ? `${info.word}, ${value}` : "Not checked in yet";
  const bubble = info && value != null ? `${info.word} · ${value}` : "Drag or click to check in";

  // ---- keys -------------------------------------------------------------------------
  const flush = () => {
    const p = pending.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    setStepped(null);
    onLive?.(null);
    // Something else checked in meanwhile, or stepped away and back: nothing to save.
    if (p.from !== committedRef.current) return;
    if (committedRef.current != null && toValue(committedRef.current) === p.v) return;
    commitRef.current(stateForLevel(p.v / 100), p.v / 100, { viaSteps: true });
  };

  // Steps still waiting when the slider goes away are saved, not lost.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => flushRef.current(), []);

  const stepTo = (raw: number) => {
    const v = Math.max(0, Math.min(100, Math.round(raw)));
    const from = pending.current ? pending.current.from : committed;
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = { v, from, timer: window.setTimeout(() => flushRef.current(), STEP_SAVE_MS) };
    setStepped({ v, from });
    onLive?.(v / 100);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = stepValue ?? (committed != null ? toValue(committed) : 50);
    let next: number | null = null;
    if (e.key in KEY_STEPS) next = current + KEY_STEPS[e.key];
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 100;
    if (next == null) return;
    e.preventDefault();
    stepTo(next);
  };

  // ---- pointer ---------------------------------------------------------------------
  const posFromEvent = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const span = r.width - KNOB;
    return span > 0 ? clamp01((e.clientX - r.left - KNOB / 2) / span) : 0.5;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // A drag replaces any steps not saved yet.
    if (pending.current) {
      window.clearTimeout(pending.current.timer);
      pending.current = null;
      setStepped(null);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = posFromEvent(e);
    setDrag(p);
    onLive?.(p);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag == null || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const p = posFromEvent(e);
    setDrag(p);
    onLive?.(p);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag == null) return;
    const p = toValue(posFromEvent(e)) / 100;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
    onLive?.(null);
    commitRef.current(stateForLevel(p), p, { viaSteps: false });
  };

  const onPointerCancel = () => {
    // The browser took the gesture (a scroll): back to what is saved.
    setDrag(null);
    onLive?.(null);
  };

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? 50}
        aria-valuetext={valueText}
        aria-describedby={`${id}-hint`}
        className={`${styles.slider} ${drag != null ? styles.dragging : ""} ${pos == null ? styles.unset : ""}`}
        data-region={region ?? "none"}
        style={{ ["--pos" as string]: String(pos ?? 0.5) }}
        onKeyDown={onKeyDown}
        onBlur={flush}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={() => {
          if (drag != null) onPointerCancel();
        }}
      >
        <span className={styles.bubble} aria-hidden="true">
          {info ? <StateGlyph shape={info.shape} size={9} className={styles.bubbleGlyph} /> : null}
          {bubble}
        </span>
        <span className={styles.rail} aria-hidden="true">
          {STATE_ORDER.map((s, i) => (
            <span key={s} className={`${styles.band} ${styles[`band${i}`]} ${region === i ? styles.bandOn : ""}`} />
          ))}
          <span className={styles.rule} />
          <span className={styles.ticks} />
          <span className={`${styles.major} ${styles.major0}`} />
          <span className={`${styles.major} ${styles.major1}`} />
          <span className={`${styles.major} ${styles.major2}`} />
          <span className={`${styles.major} ${styles.major3}`} />
        </span>
        <span className={styles.knob} aria-hidden="true">
          {info ? <StateGlyph shape={info.shape} size={11} /> : <span className={styles.knobDot} />}
        </span>
      </div>
      <p id={`${id}-hint`} className="np-sr-only">
        Arrow keys move it in steps of 5. It saves a second after your last change.
      </p>
      {legend ? (
        <div className={styles.legend} aria-hidden="true">
          {STATE_ORDER.map((s, i) => (
            <span key={s} className={`${styles.legendItem} ${region === i ? styles.legendOn : ""}`} data-state={s}>
              <StateGlyph shape={STATE_INFO[s].shape} size={9} className={styles.legendGlyph} />
              {STATE_INFO[s].word}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

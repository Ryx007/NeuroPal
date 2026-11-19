"use client";
// The check-in tile: three one-click choices (the original way in), the
// slider for the exact level, a line that says what the state means, and,
// while overwhelmed, the calming steps right in the tile. Signal's large tile
// adds the S-Today dial, which follows the slider live.
import Link from "next/link";
import { useId, useState } from "react";
import type { NervousState } from "@/lib/neuropal/day";
import type { TileSize } from "@/lib/neuropal/look";
import { ROUTES } from "../common/appNav";
import { STATE_INFO, STATE_ORDER, StateGlyph } from "../common/bits";
import { LeafIcon } from "../common/icons";
import { CheckInSlider, levelFor, middleOfState } from "./CheckInSlider";
import styles from "./home.module.css";

export interface StateTileProps {
  size: TileSize;
  signal: boolean;
  state: NervousState | null;
  level: number | null;
  message: string;
  onCheckIn: (state: NervousState, level: number, how: { viaSteps: boolean; button?: boolean }) => void;
}

const SHORT: Record<NervousState, string> = { green: "Okay", yellow: "Bit off", red: "Overwhelmed" };
const LONG_SIGNAL: Record<NervousState, string> = { green: "I feel okay", yellow: "A bit off", red: "Overwhelmed" };

export function StateTile({ size, signal, state, level, message, onCheckIn }: StateTileProps) {
  const id = useId();
  const [live, setLive] = useState<number | null>(null);
  const large = size === "L";
  const pick = (s: NervousState) => onCheckIn(s, middleOfState(s), { viaSteps: false, button: true });

  const buttons = (
    <div role="group" aria-labelledby={`${id}-title`} className={large ? styles.stateList : styles.stateRow}>
      {STATE_ORDER.map((s) => (
        <button
          key={s}
          type="button"
          className={`${styles.stateButton} ${large ? "" : styles.stateButtonCompact}`}
          data-state={s}
          aria-pressed={state === s}
          onClick={() => pick(s)}
        >
          <StateGlyph shape={STATE_INFO[s].shape} size={large ? 13 : 14} className={styles.stateGlyph} />
          <span className={styles.stateWord}>{large ? (signal ? LONG_SIGNAL[s] : STATE_INFO[s].long) : SHORT[s]}</span>
          {large ? <span className={styles.stateRing} aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );

  return (
    <section className={`np-panel ${styles.tile} ${styles.stateTile}`} aria-labelledby={`${id}-title`} data-size={size} data-state={state ?? "none"}>
      <div className={styles.tileHead}>
        <h2 id={`${id}-title`} className={`np-label ${size === "S" ? "np-sr-only" : ""}`}>
          {large ? "How are you feeling right now?" : "How are you feeling?"}
        </h2>
        {signal && large ? (
          <span className={styles.channel} aria-hidden="true">
            CH·01
          </span>
        ) : null}
      </div>

      {large ? (
        <div className={styles.stateTop}>
          {signal ? <Dial state={state} pos={live} level={level} /> : null}
          {buttons}
        </div>
      ) : (
        buttons
      )}

      <CheckInSlider className={styles.stateSlider} state={state} level={level} legend={large} onLive={setLive} onCommit={(s, lv, how) => onCheckIn(s, lv, how)} />

      <p className={styles.stateMessage} role="status">
        {signal ? (
          <span className={styles.prompt} aria-hidden="true">
            {">"}
          </span>
        ) : null}
        <span>{message}</span>
      </p>

      {state === "red" ? (
        <Link href={ROUTES.calm} className={`np-btn ${styles.calmButton}`}>
          <LeafIcon />
          Open the calming steps
        </Link>
      ) : null}
    </section>
  );
}

// The S-Today dial: decorative (the slider and buttons say the state). Its
// pointer sweeps −75°…+75° with the level, resting to the left when unset.
const REST = -110;

function Dial({ state, pos, level }: { state: NervousState | null; pos: number | null; level: number | null }) {
  const size = 104;
  const c = size / 2;
  const R = c - 15;
  const pr = R - 9;
  const shown = pos ?? levelFor(state, level);
  const angle = shown == null ? REST : -75 + 150 * shown;
  const ticks = [];
  for (let i = 0; i <= 26; i += 1) {
    const a = ((-135 + i * (270 / 26)) * Math.PI) / 180;
    const r1 = c - 2;
    const r2 = c - (i % 13 === 0 ? 11 : 7);
    ticks.push(<line key={i} x1={c + r1 * Math.sin(a)} y1={c - r1 * Math.cos(a)} x2={c + r2 * Math.sin(a)} y2={c - r2 * Math.cos(a)} className={styles.dialTick} />);
  }
  return (
    <svg className={styles.dial} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="np-dial-body" cx="38%" cy="32%" r="75%">
          <stop offset="0" className={styles.dialStopHi} />
          <stop offset="1" className={styles.dialStopLo} />
        </radialGradient>
      </defs>
      {ticks}
      <circle cx={c + 3} cy={c + 3} r={R} className={styles.dialShadow} />
      <circle cx={c} cy={c} r={R} fill="url(#np-dial-body)" className={styles.dialBody} />
      <circle cx={c} cy={c} r={R - 7} className={styles.dialInner} />
      <g className={`${styles.dialPointer} ${pos != null ? styles.dialLive : ""}`} style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${c}px ${c}px` }}>
        <line x1={c} y1={c - 7} x2={c} y2={c - pr} className={styles.dialNeedle} />
      </g>
    </svg>
  );
}

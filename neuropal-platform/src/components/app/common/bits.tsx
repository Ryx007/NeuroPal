"use client";
// Small shared controls for the app screens (both skins, design-system
// classes only).
import { useId, type ReactNode } from "react";
import type { NervousState } from "@/lib/neuropal/day";
import styles from "./common.module.css";

// ---- the three states, never colour alone: a word and a shape ----------------------

export const STATE_INFO: Record<NervousState, { word: string; shape: "circle" | "triangle" | "square"; long: string }> = {
  green: { word: "Okay", shape: "circle", long: "I feel okay" },
  yellow: { word: "Bit off", shape: "triangle", long: "Feeling a bit off" },
  red: { word: "Overwhelmed", shape: "square", long: "Help, I’m overwhelmed" },
};

export const STATE_ORDER: NervousState[] = ["green", "yellow", "red"];

/** Decorative: the text next to it says the state. Colour comes from `color`. */
export function StateGlyph({ shape, size = 12, className }: { shape: "circle" | "triangle" | "square"; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {shape === "circle" ? <circle cx="6" cy="6" r="5" fill="currentColor" /> : null}
      {shape === "triangle" ? <polygon points="6,1 11.5,11 0.5,11" fill="currentColor" /> : null}
      {shape === "square" ? <rect x="1" y="1" width="10" height="10" fill="currentColor" /> : null}
    </svg>
  );
}

/** CSS class that sets `color` to a state's tint (secondary / tertiary / error). */
export const stateTintClass = (s: NervousState | null) =>
  s === "green" ? styles.tintGreen : s === "yellow" ? styles.tintYellow : s === "red" ? styles.tintRed : styles.tintNone;

// ---- keyboard hint -------------------------------------------------------------------

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={`${styles.kbd} ${className ?? ""}`}>{children}</kbd>;
}

// ---- on/off switch ------------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  labelledBy,
  describedBy,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelledBy: string;
  describedBy?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={styles.switch}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchKnob} />
      </span>
      <span className={styles.switchText} aria-hidden="true">
        {checked ? "On" : "Off"}
      </span>
    </button>
  );
}

// ---- one choice out of a few (toggle chips, like the Make it yours studio) ----------

export interface Choice<T extends string | number> {
  value: T;
  label: string;
  /** Spoken label when the visible one is short. */
  ariaLabel?: string;
  disabled?: boolean;
}

export function ChoiceChips<T extends string | number>({
  label,
  value,
  choices,
  onChange,
  hideLabel = false,
  className,
}: {
  label: string;
  value: T | null;
  choices: Choice<T>[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`${styles.choice} ${className ?? ""}`}>
      <p id={`${id}-label`} className={hideLabel ? "np-sr-only" : `np-label ${styles.choiceLabel}`}>
        {label}
      </p>
      <div role="group" aria-labelledby={`${id}-label`} className={styles.chips}>
        {choices.map((c) => (
          <button
            key={String(c.value)}
            type="button"
            className="np-chip"
            aria-pressed={value === c.value}
            aria-label={c.ariaLabel}
            aria-disabled={c.disabled || undefined}
            onClick={() => {
              if (!c.disabled) onChange(c.value);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- a status line that is always in the DOM (so changes are read) ---------------------

export function StatusLine({ children, className, tone = "info" }: { children: ReactNode; className?: string; tone?: "info" | "error" }) {
  return (
    <p role="status" className={`${styles.status} ${tone === "error" ? styles.statusError : ""} ${className ?? ""}`}>
      {children}
    </p>
  );
}

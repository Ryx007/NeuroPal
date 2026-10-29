"use client";
// "Focus": the web's focus block is Pal's "Sit with me" (body doubling). The
// tile shows a running sit calmly (minutes, not seconds) and opens it.
import Link from "next/link";
import { useId } from "react";
import type { TileSize } from "@/lib/neuropal/look";
import { leftLabel } from "@/lib/neuropal/palLogic";
import type { PalSit } from "@/lib/neuropal/palState";
import { ROUTES } from "../common/appNav";
import { ChevronRightIcon, SitIcon } from "../common/icons";
import styles from "./home.module.css";

// The S-Today scope: a still Lissajous trace (decorative).
function scopePath(phase: number) {
  let d = "";
  for (let k = 0; k <= 120; k += 1) {
    const t = (k / 120) * Math.PI * 2;
    d += `${k === 0 ? "M" : " L"}${(50 + 44 * Math.sin(3 * t + phase)).toFixed(2)},${(28 + 22 * Math.sin(2 * t)).toFixed(2)}`;
  }
  return d;
}
const TRACE = scopePath(0.6);

export function FocusTile({ size, signal, sit, now, palName }: { size: TileSize; signal: boolean; sit: PalSit | null; now: number; palName: string }) {
  const id = useId();
  const running = Boolean(sit && !sit.endedAt);
  const title = running ? "Sitting with you" : sit?.endedAt ? "Done" : "Ready";
  const sub = running && sit ? leftLabel(sit.endsAt, now) : sit?.endedAt ? "Want to note what you did?" : `Sit with ${palName}: 10, 25 or 45 min`;
  const href = `${ROUTES.pal}?tool=sit`;

  if (size === "S") {
    return (
      <section className={`np-panel ${styles.tile} ${styles.oneLine}`} aria-labelledby={`${id}-title`} data-size={size}>
        <h2 id={`${id}-title`} className="np-sr-only">
          Focus
        </h2>
        <Link href={href} className={styles.oneLineButton}>
          <span className={styles.oneLineIcon} aria-hidden="true">
            <SitIcon />
          </span>
          <span className="np-label">Focus</span>
          <span className={styles.oneLineValue}>
            {title} · {sub}
          </span>
          <ChevronRightIcon />
        </Link>
      </section>
    );
  }

  return (
    <section className={`np-panel ${styles.tile} ${styles.focusTile}`} aria-labelledby={`${id}-title`} data-size={size}>
      <div className={styles.tileHead}>
        <h2 id={`${id}-title`} className="np-label">
          Focus
        </h2>
        <span className={`${styles.focusLed} ${running ? styles.focusLedOn : ""}`} aria-hidden="true" />
      </div>
      {signal ? (
        <div className={styles.scope} aria-hidden="true">
          <svg viewBox="0 0 100 56" preserveAspectRatio="none" focusable="false">
            {[14, 28, 42].map((y) => (
              <line key={`h${y}`} x1={0} y1={y} x2={100} y2={y} className={styles.scopeGrid} />
            ))}
            {[25, 50, 75].map((x) => (
              <line key={`v${x}`} x1={x} y1={0} x2={x} y2={56} className={styles.scopeGrid} />
            ))}
            <path d={TRACE} className={styles.scopeTrace} />
          </svg>
        </div>
      ) : null}
      <Link href={href} className={styles.focusLink}>
        <span className={styles.readingText}>
          <span className={styles.tileTitle}>{title}</span>
          <span className={styles.mono}>{running && sit?.label ? `${sub} · ${sit.label}` : sub}</span>
        </span>
        <span className={styles.roundIcon} aria-hidden="true">
          <SitIcon />
        </span>
        <span className="np-sr-only">. Open Sit with me</span>
      </Link>
    </section>
  );
}

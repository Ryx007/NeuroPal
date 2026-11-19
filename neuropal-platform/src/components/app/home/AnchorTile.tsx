"use client";
// "Next anchor": the next timed point in the day, counting down calmly
// (minutes, not seconds), with its window. Signal shows the S-Today
// countdown and a ±2 h ruler; Classic keeps the original card. Done marks it
// for today; Edit and the anchors list open the anchors dialog.
import { useId } from "react";
import { hhmm, minutesUntil, time12, type Anchor } from "@/lib/neuropal/day";
import type { TileSize } from "@/lib/neuropal/look";
import { CheckIcon, ChevronRightIcon, ClockIcon, EditIcon, PlusIcon } from "../common/icons";
import { CategoryIcon, countdown, windowLabel } from "./anchorBits";
import styles from "./home.module.css";

export interface AnchorTileProps {
  size: TileSize;
  signal: boolean;
  anchor: Anchor | null;
  /** Number of anchors set (for the list button). */
  count: number;
  now: Date;
  onOpen: (target: { edit: string } | { add: true } | null) => void;
  onDone: (id: string) => void;
}

export function AnchorTile({ size, signal, anchor, count, now, onOpen, onDone }: AnchorTileProps) {
  const id = useId();
  const clock = (a: Anchor) => (signal ? hhmm(a.time) : time12(a.time));

  if (!anchor) {
    return (
      <section className={`np-panel ${styles.tile} ${styles.anchorTile}`} aria-labelledby={`${id}-title`} data-size={size}>
        <div className={styles.tileHead}>
          <h2 id={`${id}-title`} className="np-label">
            Next anchor
          </h2>
        </div>
        <p className={styles.tileTitle}>{count ? "Nothing else today" : "Nothing set yet"}</p>
        <p className={styles.tileText}>{count ? "Every anchor for today is done." : "Meds, a break, a study block…"}</p>
        <div className={styles.tileActions}>
          <button type="button" className="np-btn np-btn--small" onClick={() => onOpen({ add: true })}>
            <PlusIcon />
            Add anchor
          </button>
          {count ? (
            <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => onOpen(null)}>
              All anchors
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const mins = minutesUntil(anchor, now);
  const cd = countdown(mins);

  if (size === "S") {
    return (
      <section className={`np-panel ${styles.tile} ${styles.oneLine}`} aria-labelledby={`${id}-title`} data-size={size}>
        <h2 id={`${id}-title`} className="np-sr-only">
          Next anchor
        </h2>
        <button type="button" className={styles.oneLineButton} onClick={() => onOpen({ edit: anchor.id })}>
          <span className={styles.oneLineIcon} aria-hidden="true">
            <CategoryIcon category={anchor.category} />
          </span>
          <span className="np-label">Next</span>
          <span className={styles.oneLineValue}>
            {anchor.title} · {clock(anchor)}
            <span className="np-sr-only">, {cd.words}. Edit</span>
          </span>
          <ChevronRightIcon />
        </button>
      </section>
    );
  }

  const flex = anchor.flexMinutes;
  return (
    <section className={`np-panel ${styles.tile} ${styles.anchorTile}`} aria-labelledby={`${id}-title`} data-size={size}>
      <div className={styles.tileHead}>
        <h2 id={`${id}-title`} className="np-label">
          Next anchor
        </h2>
        <span className={styles.anchorKind} aria-hidden="true">
          <CategoryIcon category={anchor.category} />
        </span>
      </div>
      {signal ? (
        <div className={styles.countdown}>
          <p className={styles.countBig} aria-hidden="true">
            {cd.big}
            {cd.unit ? <span className={styles.countUnit}>{cd.unit}</span> : null}
          </p>
          <p className={styles.tileTitle}>
            {anchor.title}
            <span className="np-sr-only">, {cd.words}, at {clock(anchor)}</span>
          </p>
          <p className={styles.mono} aria-hidden="true">
            {clock(anchor)} · window {windowLabel(anchor)}
          </p>
          <Ruler mins={mins} flex={flex} />
        </div>
      ) : (
        <div className={styles.countdown}>
          <p className={styles.tileTitle}>
            {anchor.title} at {clock(anchor)}
          </p>
          <p className={styles.untilLine}>
            <ClockIcon />
            <span>
              {cd.words.charAt(0).toUpperCase() + cd.words.slice(1)} · window {windowLabel(anchor)}
            </span>
          </p>
        </div>
      )}
      {anchor.subtitle && size === "L" ? <p className={styles.tileText}>{anchor.subtitle}</p> : null}
      <div className={styles.tileActions}>
        <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => onDone(anchor.id)}>
          <CheckIcon />
          Done
          <span className="np-sr-only"> with {anchor.title}</span>
        </button>
        <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => onOpen({ edit: anchor.id })}>
          <EditIcon />
          Edit
          <span className="np-sr-only"> {anchor.title}</span>
        </button>
        <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => onOpen(null)}>
          All anchors
          <span className={styles.countTag} aria-hidden="true">
            {count}
          </span>
          <span className="np-sr-only">, {count} set</span>
        </button>
      </div>
    </section>
  );
}

// ±2 h around the anchor; the window is drawn in the accent; the "now" mark
// sits at the exact minute. Decorative: the words above say it all.
function Ruler({ mins, flex }: { mins: number; flex: number }) {
  const N = 25;
  const span = 120;
  const frac = (span - mins) / (2 * span);
  const inRange = frac >= 0 && frac <= 1;
  return (
    <div className={styles.ruler} aria-hidden="true">
      {Array.from({ length: N }, (_, i) => {
        const offset = (i - (N - 1) / 2) * ((2 * span) / (N - 1));
        return <span key={i} className={`${styles.rulerTick} ${Math.abs(offset) <= flex ? styles.rulerIn : ""}`} />;
      })}
      {inRange ? <span className={styles.rulerNow} style={{ ["--frac" as string]: String(frac) }} /> : null}
    </div>
  );
}

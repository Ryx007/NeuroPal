"use client";
// "Resume reading": the document read most recently, straight back to the
// reader. Quiet when there is nothing yet or the server can't be reached.
import Link from "next/link";
import { useId } from "react";
import type { TileSize } from "@/lib/neuropal/look";
import { docId, type NPDocument } from "@/lib/neuropal/types";
import { readerHref, ROUTES } from "../common/appNav";
import { BookIcon, ChevronRightIcon } from "../common/icons";
import styles from "./home.module.css";

export type ReadingState = { status: "loading" } | { status: "ready"; doc: NPDocument | null } | { status: "error"; message: string };

export function ReadingTile({ size, signal, reading }: { size: TileSize; signal: boolean; reading: ReadingState }) {
  const id = useId();
  const doc = reading.status === "ready" ? reading.doc : null;

  if (!doc) {
    return (
      <section className={`np-panel ${styles.tile} ${styles.readingTile}`} aria-labelledby={`${id}-title`} data-size={size}>
        <div className={styles.tileHead}>
          <h2 id={`${id}-title`} className="np-label">
            Resume reading
          </h2>
        </div>
        <p className={styles.tileText} role="status">
          {reading.status === "loading"
            ? "Looking for where you left off…"
            : reading.status === "error"
              ? "Can’t load your library right now."
              : "Nothing open yet. Pick something from your library."}
        </p>
        <div className={styles.tileActions}>
          <Link href={ROUTES.library} className="np-btn np-btn--ghost np-btn--small">
            Open the library
          </Link>
        </div>
      </section>
    );
  }

  const pct = Math.max(0, Math.min(1, Number(doc.readingProgress ?? 0)));
  const percent = Math.round(pct * 100);
  const where = doc.pageCount ? `p. ${Math.max(1, Math.round(pct * doc.pageCount))} / ${doc.pageCount}` : `${percent}%`;
  const href = readerHref(docId(doc));
  const segs = 12;
  const filled = Math.round(pct * segs);

  if (size === "S") {
    return (
      <section className={`np-panel ${styles.tile} ${styles.oneLine}`} aria-labelledby={`${id}-title`} data-size={size}>
        <h2 id={`${id}-title`} className="np-sr-only">
          Resume reading
        </h2>
        <Link href={href} className={styles.oneLineButton}>
          <span className={styles.oneLineIcon} aria-hidden="true">
            <BookIcon />
          </span>
          <span className="np-label">Resume</span>
          <span className={styles.oneLineValue}>
            {doc.title}
            <span className="np-sr-only">, {percent} percent read</span>
          </span>
          <ChevronRightIcon />
        </Link>
      </section>
    );
  }

  return (
    <section className={`np-panel ${styles.tile} ${styles.readingTile}`} aria-labelledby={`${id}-title`} data-size={size}>
      <div className={styles.tileHead}>
        <h2 id={`${id}-title`} className="np-label">
          Resume reading
        </h2>
      </div>
      <Link href={href} className={styles.readingLink}>
        <span className={styles.bookBadge} aria-hidden="true">
          <BookIcon />
        </span>
        <span className={styles.readingText}>
          <span className={styles.readingTitle}>{doc.title}</span>
          {doc.subtitle && size === "L" ? <span className={styles.readingSub}>{doc.subtitle}</span> : null}
          <span className={styles.readingMeta}>
            {signal ? (
              <span className={styles.segments} aria-hidden="true">
                {Array.from({ length: segs }, (_, k) => (
                  <span key={k} className={k < filled ? styles.segOn : styles.seg} />
                ))}
              </span>
            ) : (
              <span className={styles.bar} aria-hidden="true">
                <span className={styles.barFill} style={{ width: `${percent}%` }} />
              </span>
            )}
            <span className={styles.mono}>{where}</span>
            <span className="np-sr-only">, {percent} percent read. Resume reading</span>
          </span>
        </span>
        <ChevronRightIcon />
      </Link>
    </section>
  );
}

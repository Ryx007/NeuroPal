"use client";
// One document in the library: type, title, where you are in it, or what the
// server is doing with it — and Ask, rename, delete. The whole card opens it.
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { ChatIcon, EditIcon, RefreshIcon, TrashIcon } from "@/components/app/common/icons";
import { failureWords, minutesLabel, percent, relativeTime, stageWords, typeLabel } from "@/lib/neuropal/reader/format";
import { docId, PROCESSING, type DocumentStatus, type NPDocument } from "@/lib/neuropal/types";
import { usePopover } from "../reader/hooks";
import { MoreIcon, WarnIcon } from "../reader/icons";
import styles from "./library.module.css";

export const readHref = (d: NPDocument, ask = false) => `/app/read/?doc=${encodeURIComponent(docId(d))}${ask ? "&ask=1" : ""}`;

interface Props {
  doc: NPDocument & { ingestStage?: string; mathUpgrade?: string | null };
  wpm: number;
  now: number;
  onRename: () => void;
  onDelete: () => void;
  onRetry: () => Promise<void>;
}

export function DocCard({ doc, wpm, now, onRename, onDelete, onRetry }: Props) {
  const id = useId();
  const processing = PROCESSING.includes(doc.status as DocumentStatus);
  const failed = doc.status === "failed";
  const reading = Math.max(0, Math.min(1, doc.readingProgress ?? 0));
  const ingest = Math.max(0, Math.min(1, doc.progress ?? 0));
  const words = doc.wordCount ?? 0;
  const lastRead = relativeTime(doc.lastReadAt, now || undefined);
  const [retrying, setRetrying] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = usePopover(menuRef, triggerRef);
  const fail = failed ? failureWords(doc) : null;

  const meta = doc.pageCount ? `${doc.pageCount} ${doc.pageCount === 1 ? "page" : "pages"}` : "";

  let main: string;
  let side = "";
  if (processing) {
    main = `${stageWords(doc.status)}${ingest > 0 ? ` · ${percent(ingest)}` : ""}`;
    side = doc.type === "epub" ? "Readable now" : "Opens when it’s ready";
  } else if (failed) {
    main = "Couldn’t be processed";
  } else if (reading >= 0.995) {
    main = "Finished";
    side = lastRead ? `Last read ${lastRead}` : "";
  } else if (reading > 0) {
    main = `${percent(reading)} read`;
    side = words ? `${minutesLabel(words * (1 - reading), wpm)} left` : lastRead ? `Last read ${lastRead}` : "";
  } else {
    main = "Not started";
    const m = minutesLabel(words, wpm);
    side = words ? (m === "under a minute" ? "Under a minute to listen" : `About ${m} to listen`) : "";
  }

  return (
    <li className={`np-panel ${styles.card}`} aria-labelledby={`${id}-t`}>
      <div className={styles.cardTop}>
        <span className="np-tag">{typeLabel(doc.type)}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
      <h2 id={`${id}-t`} className={styles.cardTitle}>
        <Link href={readHref(doc)} className={styles.cardLink}>
          {doc.title || "Untitled"}
        </Link>
      </h2>
      {doc.subtitle ? <p className={styles.sub}>{doc.subtitle}</p> : null}

      <div className={styles.status}>
        {failed && fail ? (
          <>
            <p className={styles.failed}>
              <WarnIcon />
              <span>{fail.summary}</span>
            </p>
            {fail.detail ? (
              <details className={styles.detail}>
                <summary>What the server said</summary>
                <code>{fail.detail}</code>
              </details>
            ) : null}
          </>
        ) : (
          <>
            <p className={styles.statusLine}>
              <span className={styles.statusMain}>{main}</span>
              {side ? <span className={styles.statusSide}>{side}</span> : null}
            </p>
            <div className={styles.bar} aria-hidden="true">
              <div
                className={styles.barFill}
                data-kind={processing ? "processing" : undefined}
                style={{ width: `${Math.round((processing ? Math.max(0.04, ingest) : reading) * 100)}%` }}
              />
            </div>
          </>
        )}
        {doc.mathUpgrade === "queued" || doc.mathUpgrade === "running" ? <p className={styles.statusSide}>Improving the equations in the background</p> : null}
      </div>

      <div className={styles.actions}>
        {failed ? (
          <button
            type="button"
            className="np-btn np-btn--small"
            aria-disabled={retrying || undefined}
            onClick={() => {
              if (retrying) return;
              setRetrying(true);
              void onRetry().finally(() => setRetrying(false));
            }}
            aria-describedby={`${id}-t`}
          >
            <RefreshIcon />
            {retrying ? "Starting…" : "Try again"}
          </button>
        ) : (
          <Link href={readHref(doc, true)} className="np-btn np-btn--ghost np-btn--small" aria-describedby={`${id}-t`}>
            <ChatIcon />
            Ask about this
          </Link>
        )}
        <div className={styles.menuWrap}>
          <button
            ref={triggerRef}
            type="button"
            className="np-btn np-btn--ghost np-btn--small"
            aria-expanded={menuOpen}
            aria-controls={`${id}-menu`}
            aria-label={`More for “${doc.title}”`}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MoreIcon />
          </button>
          {menuOpen ? (
            <div ref={menuRef} id={`${id}-menu`} className={styles.menu}>
              <button
                type="button"
                onClick={() => {
                  // The dialog hands focus back to what had it: the "More" button.
                  triggerRef.current?.focus();
                  setMenuOpen(false);
                  onRename();
                }}
              >
                <EditIcon />
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerRef.current?.focus();
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                <TrashIcon />
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

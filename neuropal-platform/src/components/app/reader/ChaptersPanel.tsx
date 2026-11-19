"use client";
// The chapter list: docked beside the text on wide screens, a sheet on
// narrow ones. The current chapter is marked (word + border, not colour
// alone) and scrolled into view when the list opens.
import { useEffect, useRef } from "react";
import { CloseIcon } from "@/components/app/common/icons";
import styles from "./reader.module.css";

export interface ChapterItem {
  key: string | number;
  title: string;
  depth?: number;
  /** e.g. listening time, or a page. */
  meta?: string;
  current: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function ChaptersPanel({ titleId, items, onClose, note }: { titleId: string; items: ChapterItem[]; onClose: () => void; note?: string }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-current="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <>
      <div className={styles.panelHead}>
        <h2 id={titleId} className={styles.panelTitle}>
          Chapters
        </h2>
        <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={onClose} aria-label="Close chapters" data-autofocus>
          <CloseIcon />
        </button>
      </div>
      <nav className={styles.panelScroll} aria-labelledby={titleId}>
        {note ? <p className="np-help">{note}</p> : null}
        <ol ref={list} className={styles.chapterList}>
          {items.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                className={`${styles.chapterBtn} ${it.depth === 1 ? styles.depth1 : it.depth === 2 ? styles.depth2 : (it.depth ?? 0) >= 3 ? styles.depth3 : ""}`}
                aria-current={it.current ? "true" : undefined}
                disabled={it.disabled}
                onClick={it.onSelect}
              >
                <span className={styles.chapterName}>
                  {it.title}
                  {it.current ? <span className="np-sr-only"> (you are here)</span> : null}
                </span>
                {it.meta ? <span className={styles.chapterMeta}>{it.meta}</span> : null}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}

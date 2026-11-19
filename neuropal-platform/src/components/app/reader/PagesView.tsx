"use client";
// "Original pages": the PDF's own pages as images (true typesetting, every
// equation as printed). Images load lazily with a document ticket in the URL
// (an <img> can't send the session header). The page in view is reported
// back so the reader can show "Page 4 of 12" and switch back at that page.
import { useEffect, useRef, useState } from "react";
import { RefreshIcon } from "@/components/app/common/icons";
import { errorText } from "@/lib/neuropal/client";
import { pageImageUrl, ticketFor } from "@/lib/neuropal/documents";
import styles from "./reader.module.css";

interface Props {
  docId: string;
  pageCount: number;
  /** Page to open at. */
  startPage: number;
  /** Page being read aloud (kept in view while following the voice). */
  followPage: number | null;
  onPageInView: (page: number) => void;
}

export function PagesView({ docId, pageCount, startPage, followPage, onPageInView }: Props) {
  // undefined = still asking for a ticket; null = this server needs none.
  const [ticket, setTicket] = useState<string | null | undefined>(undefined);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Pages whose image didn't load, and a counter per page to load it afresh. */
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const [bust, setBust] = useState<Record<number, number>>({});
  const [inView, setInView] = useState(startPage);
  const listRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const onPageRef = useRef(onPageInView);
  useEffect(() => {
    onPageRef.current = onPageInView;
  }, [onPageInView]);

  useEffect(() => {
    let alive = true;
    ticketFor(docId, attempt > 0)
      .then((t) => {
        if (alive) setTicket(t);
      })
      .catch((e) => {
        if (alive) setTicketError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [docId, attempt]);

  // Open at the reading position (once, when the pages first appear).
  useEffect(() => {
    if (ticket === undefined || opened.current) return;
    opened.current = true;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-page="${startPage}"]`);
    el?.scrollIntoView({ block: "start" });
  }, [ticket, startPage]);

  // Which page is in view.
  useEffect(() => {
    const root = listRef.current;
    if (!root || ticket === undefined || typeof IntersectionObserver === "undefined") return;
    const ratios = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio);
        let best = 0;
        let page = 0;
        for (const [p, r] of ratios) {
          if (r > best) {
            best = r;
            page = p;
          }
        }
        if (page) {
          setInView(page);
          onPageRef.current(page);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    root.querySelectorAll("[data-page]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ticket, pageCount]);

  // Reading aloud: keep the spoken page in view.
  useEffect(() => {
    if (!followPage || ticket === undefined) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-page="${followPage}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [followPage, ticket]);

  if (ticketError) {
    return (
      <div className="np-hazard" role="alert">
        <p>
          <b>Problem: </b>The pages couldn’t be opened. {ticketError}{" "}
          <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => {
            setTicketError(null);
            setAttempt((a) => a + 1);
          }}>
            Try again
          </button>
        </p>
      </div>
    );
  }
  if (ticket === undefined) {
    return <p className="np-muted">Opening the pages…</p>;
  }

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  return (
    <div ref={listRef} className={styles.pages}>
      {pages.map((n) => {
        const again = bust[n] ?? 0;
        const src = `${pageImageUrl(docId, n, ticket)}${again ? `${ticket ? "&" : "?"}again=${again}` : ""}`;
        return (
          <figure key={n} className={styles.pageFigure} data-page={n} data-current={n === inView || undefined}>
            <div className={styles.pageImgBox}>
              {broken[n] ? (
                <div className={styles.pageError}>
                  <p>Page {n} couldn’t be shown.</p>
                  <button
                    type="button"
                    className="np-btn np-btn--ghost np-btn--small"
                    onClick={() => {
                      // A fresh ticket too: the old one may have run out.
                      setAttempt((a) => a + 1);
                      setBust((b) => ({ ...b, [n]: (b[n] ?? 0) + 1 }));
                      setBroken((b) => ({ ...b, [n]: false }));
                    }}
                  >
                    <RefreshIcon />
                    Try again
                  </button>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={styles.pageImg}
                  src={src}
                  alt={`Page ${n} of ${pageCount}`}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setBroken((b) => ({ ...b, [n]: true }))}
                />
              )}
            </div>
            <figcaption className={styles.pageCaption}>
              Page {n} of {pageCount}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

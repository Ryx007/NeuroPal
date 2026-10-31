"use client";
// The text reader (every type but EPUB): the document's text with chapter
// headings and page marks, read aloud with the spoken word highlighted,
// chapters, original pages (pdf/arXiv), and Ask beside it.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { announce } from "@/components/app/common/announce";
import { AskPanel } from "@/components/app/ask/AskPanel";
import { usePrefs, readerSurface } from "@/lib/neuropal/prefs";
import { createCursor, useCursorValue, type Cursor } from "@/lib/neuropal/reader/cursor";
import { shortMinutes } from "@/lib/neuropal/reader/format";
import { buildTextIndex, findExcerpt } from "@/lib/neuropal/reader/locate";
import {
  buildReaderModel,
  nextParagraphStart,
  nextSentence,
  pageOfParagraph,
  paragraphOfPage,
  previousParagraphStart,
  previousSentence,
  sectionOfWord,
  sentenceText,
  type ReaderModel,
} from "@/lib/neuropal/reader/sections";
import type { Citation, DocumentText, NPDocument, ReadingProgress } from "@/lib/neuropal/types";
import { ChaptersPanel, type ChapterItem } from "./ChaptersPanel";
import { keysBelongTo, typingIn, useProgressSaver, useReadAloud } from "./hooks";
import { PagesView } from "./PagesView";
import { PlayerBar, type PlayerChapters } from "./PlayerBar";
import { ReaderFrame, usePanels } from "./ReaderFrame";
import { ReaderText } from "./ReaderText";
import styles from "./reader.module.css";

const reduceMotion = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "Still");

interface Props {
  doc: NPDocument;
  docId: string;
  data: DocumentText;
  progress: ReadingProgress | null;
  initialAsk: boolean;
  askUnavailable: string | null;
}

export function TextReader({ doc, docId, data, progress, initialAsk, askUnavailable }: Props) {
  const prefs = usePrefs();
  const ids = useId();
  const titleId = `${ids}-title`;
  const askTitleId = `${ids}-ask`;
  const chaptersTitleId = `${ids}-chapters`;
  const model = useMemo(() => buildReaderModel({ ...data, title: data.title || doc.title }), [data, doc.title]);
  const total = model.totalWords;
  const startWord = Math.max(0, Math.min(total - 1, Math.floor(progress?.lastWordIndex ?? 0)));
  const [cursor] = useState(() => createCursor(startWord));
  const stream = useMemo(() => (total ? { speech: model.speech, sentenceEnd: model.sentenceEnd, paraOf: model.paraOf } : null), [model, total]);
  const lang = typeof navigator !== "undefined" ? navigator.language || "en" : "en";
  const ended = useRef(false);
  const flushRef = useRef<() => void>(() => undefined);
  const onEnded = useCallback(() => {
    ended.current = true;
    flushRef.current();
  }, []);
  const reader = useReadAloud(stream, cursor, prefs, lang, onEnded);

  const rootRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const panels = usePanels(rootRef, initialAsk, model.sections.length > 1);

  const canPages = (doc.type === "pdf" || doc.type === "arxiv") && (data.pageCount || doc.pageCount || 0) > 0;
  const pageCount = data.pageCount || doc.pageCount || 0;
  const [pages, setPages] = useState(false);
  const pageInView = useRef<number | null>(null);
  const [pagesStart, setPagesStart] = useState(1);

  // ---- resume point ------------------------------------------------------------
  const getPoint = useCallback(() => {
    if (!total) return null;
    const i = cursor.get();
    const page = pageOfParagraph(model, model.paraOf[i]);
    return { lastWordIndex: i, progress: ended.current ? 1 : i / total, ...(page !== null ? { lastPage: page } : {}) };
  }, [cursor, model, total]);
  const { touch, flush } = useProgressSaver(docId, getPoint, total > 0);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(
    () =>
      cursor.subscribe(() => {
        if (cursor.get() < total - 1) ended.current = false;
        touch();
      }),
    [cursor, touch, total],
  );
  // Opening counts as reading (it moves the document up "Recently read").
  useEffect(() => {
    const t = window.setTimeout(() => flush(), 4000);
    return () => window.clearTimeout(t);
  }, [flush]);

  // ---- scrolling -----------------------------------------------------------------
  const holdUntil = useRef(0);
  const programmaticUntil = useRef(0);
  const [offscreen, setOffscreen] = useState(false);
  const stateRef = useRef(reader.state);
  useEffect(() => {
    stateRef.current = reader.state;
  }, [reader.state]);
  const followRef = useRef(prefs.followAlong);
  useEffect(() => {
    followRef.current = prefs.followAlong;
  }, [prefs.followAlong]);

  const band = useCallback(() => {
    const root = rootRef.current;
    const barH = root ? parseFloat(getComputedStyle(root).getPropertyValue("--bar-h")) || 64 : 64;
    const topInset = root ? parseFloat(getComputedStyle(root).getPropertyValue("--reader-top")) || 0 : 0;
    const top = topInset + barH + 24;
    const playerTop = playerRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    const bottom = Math.min(window.innerHeight, playerTop) - 24;
    return { top, bottom: Math.max(top + 80, bottom) };
  }, []);

  const wordEl = useCallback((i: number) => {
    const art = articleRef.current;
    if (!art) return null;
    return art.querySelector<HTMLElement>(`[data-w="${i}"]`) ?? art.querySelector<HTMLElement>(`[data-p="${model.paraOf[i]}"]`);
  }, [model]);

  const scrollToWord = useCallback(
    (i: number, how: "auto" | "smooth" = "smooth", where: "band" | "center" = "band") => {
      const el = wordEl(i);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const { top, bottom } = band();
      if (where === "band" && r.top >= top && r.bottom <= bottom) return;
      const target = where === "center" ? top + (bottom - top) * 0.4 : top + (bottom - top) * 0.28;
      programmaticUntil.current = performance.now() + 900;
      window.scrollBy({ top: r.top - target, behavior: how === "smooth" && !reduceMotion() ? "smooth" : "auto" });
    },
    [band, wordEl],
  );

  // Open where you left off.
  useEffect(() => {
    if (!total) return;
    const f = window.requestAnimationFrame(() => scrollToWord(cursor.get(), "auto", "center"));
    return () => window.cancelAnimationFrame(f);
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the voice; show "back to the reading position" when it's out of view.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const playing = stateRef.current === "playing";
      const el = wordEl(cursor.get());
      if (!el) return;
      const r = el.getBoundingClientRect();
      const { top, bottom } = band();
      const out = r.bottom < top - 4 || r.top > bottom + 4;
      if (playing && followRef.current && performance.now() > holdUntil.current) {
        if (r.top < top || r.bottom > bottom) {
          scrollToWord(cursor.get(), "smooth", "band");
          setOffscreen(false);
          return;
        }
      }
      setOffscreen(playing && out);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };
    const hold = () => {
      holdUntil.current = performance.now() + 4000;
      schedule();
    };
    const onScroll = () => {
      if (performance.now() > programmaticUntil.current) holdUntil.current = performance.now() + 4000;
      schedule();
    };
    const onKey = (e: KeyboardEvent) => {
      if (typingIn(e.target)) return;
      if (["PageUp", "PageDown", "Home", "End"].includes(e.key) || ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey)) hold();
    };
    const unsub = cursor.subscribe(schedule);
    window.addEventListener("wheel", hold, { passive: true });
    window.addEventListener("touchmove", hold, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      unsub();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("wheel", hold);
      window.removeEventListener("touchmove", hold);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [cursor, band, wordEl, scrollToWord]);

  // Re-check when playback starts or stops.
  useEffect(() => {
    const f = window.requestAnimationFrame(() => {
      if (reader.state !== "playing") setOffscreen(false);
      else if (followRef.current) scrollToWord(cursor.get(), "smooth", "band");
    });
    return () => window.cancelAnimationFrame(f);
  }, [reader.state, cursor, scrollToWord]);

  // ---- moving the cursor -------------------------------------------------------------
  const go = useCallback(
    (i: number) => {
      if (!total) return;
      const at = Math.max(0, Math.min(total - 1, i));
      reader.seek(at);
      holdUntil.current = 0;
      window.requestAnimationFrame(() => scrollToWord(at, "smooth", "band"));
    },
    [reader, total, scrollToWord],
  );
  const prevSentence = useCallback(() => go(previousSentence(model, cursor.get())), [go, model, cursor]);
  const nextSentenceFn = useCallback(() => go(nextSentence(model, cursor.get())), [go, model, cursor]);
  const prevParagraph = useCallback(() => go(previousParagraphStart(model, cursor.get())), [go, model, cursor]);
  const nextParagraph = useCallback(() => go(nextParagraphStart(model, cursor.get())), [go, model, cursor]);

  const locate = useCallback(() => {
    if (pages) setPages(false);
    window.requestAnimationFrame(() => {
      const i = cursor.get();
      holdUntil.current = 0;
      scrollToWord(i, "smooth", "center");
      const p = articleRef.current?.querySelector<HTMLElement>(`[data-p="${model.paraOf[i]}"]`);
      p?.focus({ preventScroll: true });
      announce(`Reading position: ${sentenceText(model, i)}`);
    });
  }, [cursor, model, pages, scrollToWord]);

  const startAt = useCallback(
    (i: number) => {
      holdUntil.current = 0;
      reader.play(i);
    },
    [reader],
  );

  // Pausing tells screen readers where it stopped (never word by word).
  const prevState = useRef(reader.state);
  useEffect(() => {
    if (prevState.current === "playing" && reader.state === "paused") announce(`Paused at: ${sentenceText(model, cursor.get())}`);
    else if (reader.state === "playing" && prevState.current !== "playing") announce("Reading aloud.");
    else if (reader.state === "error" && reader.message) announce(reader.message);
    prevState.current = reader.state;
  }, [reader.state, reader.message, model, cursor]);

  // ---- keyboard ------------------------------------------------------------------
  useEffect(() => {
    if (!prefs.shortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (document.querySelector("dialog[open]") || typingIn(e.target)) return;
      if (e.key === " " && !e.shiftKey) {
        if (keysBelongTo(e.target)) return;
        e.preventDefault();
        reader.toggle();
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.shiftKey) {
        if (arrowsBelongTo(e.target)) return;
        e.preventDefault();
        if (e.key === "ArrowLeft") prevSentence();
        else nextSentenceFn();
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.shiftKey) {
        if (arrowsBelongTo(e.target)) return;
        e.preventDefault();
        if (e.key === "ArrowUp") prevParagraph();
        else nextParagraph();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs.shortcuts, reader, prevSentence, nextSentenceFn, prevParagraph, nextParagraph]);

  // ---- chapters ------------------------------------------------------------------
  const chaptersAdapter: PlayerChapters = useMemo(
    () => ({
      count: model.sections.length,
      of: (w: number) => sectionOfWord(model, w),
      get: (k: number) => {
        const s = model.sections[Math.max(0, Math.min(model.sections.length - 1, k))];
        return s ? { title: s.synthetic && model.sections.length === 1 ? "" : s.title, start: s.start, end: s.end } : { title: "", start: 0, end: 1 };
      },
    }),
    [model],
  );

  const jumpToSection = useCallback(
    (k: number) => {
      const s = model.sections[k];
      if (!s) return;
      if (pages) setPages(false);
      reader.seek(s.start);
      holdUntil.current = performance.now() + 1500;
      window.requestAnimationFrame(() => {
        const head =
          articleRef.current?.querySelector<HTMLElement>(`[data-section-head="${k}"]`) ??
          articleRef.current?.querySelector<HTMLElement>(`[data-p="${s.first}"]`);
        programmaticUntil.current = performance.now() + 900;
        head?.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
        articleRef.current?.querySelector<HTMLElement>(`[data-p="${s.first}"]`)?.focus({ preventScroll: true });
      });
      if (panels.chaptersSheet) panels.closeChapters();
    },
    [model, pages, reader, panels],
  );

  // ---- original pages ---------------------------------------------------------------
  const pageAtCursor = useCallback(() => {
    const p = model.paraOf[cursor.get()] ?? 0;
    const real = pageOfParagraph(model, p);
    if (real !== null) return real;
    return pageCount ? Math.max(1, Math.min(pageCount, 1 + Math.floor((p / Math.max(1, model.paragraphs.length)) * pageCount))) : 1;
  }, [model, cursor, pageCount]);

  const setView = useCallback(
    (toPages: boolean) => {
      if (toPages === pages) return;
      if (toPages) {
        setPagesStart(pageAtCursor());
        pageInView.current = null;
        setPages(true);
        return;
      }
      setPages(false);
      const seen = pageInView.current;
      window.requestAnimationFrame(() => {
        if (seen && seen !== pageAtCursor()) {
          const para = model.paragraphs[paragraphOfPage(model, seen)];
          if (para) {
            reader.seek(para.start);
            window.requestAnimationFrame(() => scrollToWord(para.start, "auto", "center"));
            return;
          }
        }
        scrollToWord(cursor.get(), "auto", "center");
      });
    },
    [pages, pageAtCursor, model, reader, cursor, scrollToWord],
  );

  // ---- citations ------------------------------------------------------------------------
  const index = useMemo(() => buildTextIndex(model.paragraphs.map((p) => p.text)), [model]);
  const locateCitation = useCallback(
    (c: Citation): number | null => {
      const hit = findExcerpt(index, c.excerpt);
      if (hit !== null) return hit;
      if (typeof c.page === "number" && (model.pageAnchors.length || model.pageCount)) return paragraphOfPage(model, c.page);
      return null;
    },
    [index, model],
  );

  const citeLabel = useCallback(
    (c: Citation, n: number) => {
      const p = locateCitation(c);
      const section = p !== null ? model.sections[model.paragraphs[p]?.section ?? -1] : undefined;
      const heading = c.sectionHeading || (section && !section.synthetic ? section.title : "");
      return [typeof c.page === "number" ? `p. ${c.page}` : `Source ${n}`, heading].filter(Boolean).join(" · ");
    },
    [locateCitation, model],
  );

  const onCite = useCallback(
    (c: Citation) => {
      const p = locateCitation(c);
      if (p === null) return false;
      if (pages) setPages(false);
      if (panels.askSheet) panels.setAskOpen(false);
      holdUntil.current = performance.now() + 9000;
      window.setTimeout(
        () => {
          const el = articleRef.current?.querySelector<HTMLElement>(`[data-p="${p}"]`);
          if (!el) return;
          programmaticUntil.current = performance.now() + 900;
          el.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
          el.classList.remove(styles.flash);
          void el.offsetWidth;
          el.classList.add(styles.flash);
          window.setTimeout(() => el.classList.remove(styles.flash), 2600);
          el.focus({ preventScroll: true });
        },
        panels.askSheet ? 120 : 0,
      );
      return true;
    },
    [locateCitation, pages, panels],
  );

  // ---- look ----------------------------------------------------------------------------
  const surface = readerSurface(prefs.readerBackground);
  const pageStyle = {
    "--reader-font": prefs.readerFont ?? undefined,
    "--reader-size": `${prefs.readerFontSize}px`,
    "--reader-lh": String(prefs.readerLineHeight),
    ...(surface ? { "--reader-bg": surface.background, "--reader-fg": surface.color, "--reader-muted": surface.muted } : {}),
  } as CSSProperties;

  const chapters = (
    <ChapterList model={model} cursor={cursor} wpm={prefs.wordsPerMinute} titleId={chaptersTitleId} onJump={jumpToSection} onClose={panels.closeChapters} />
  );

  const ask = (
    <AskPanel
      docId={docId}
      titleId={askTitleId}
      unavailable={askUnavailable}
      onClose={() => panels.setAskOpen(false)}
      onCite={onCite}
      citeLabel={citeLabel}
    />
  );

  return (
    <ReaderFrame
      rootRef={rootRef}
      titleId={titleId}
      title={doc.title}
      subtitle={<Subtitle model={model} cursor={cursor} pages={pages} pageCount={pageCount} fallback={doc.subtitle || ""} />}
      panels={panels}
      hasChapters={model.sections.length > 1}
      chaptersTitleId={chaptersTitleId}
      chapters={chapters}
      askTitleId={askTitleId}
      ask={ask}
      view={canPages ? { pages, onChange: setView } : null}
      pageStyle={pageStyle}
      customSurface={!!surface}
      page={
        total === 0 ? (
          <p className="np-muted">This document has no text to show yet.</p>
        ) : pages ? (
          <PagesFollow
            docId={docId}
            pageCount={pageCount}
            startPage={pagesStart}
            cursor={cursor}
            model={model}
            following={reader.state === "playing" && prefs.followAlong}
            onPageInView={(n) => {
              pageInView.current = n;
            }}
          />
        ) : (
          <ReaderText model={model} cursor={cursor} articleRef={articleRef} onWord={startAt} labelledBy={titleId} playing={reader.state === "playing"} />
        )
      }
      playerRef={playerRef}
      player={
        <PlayerBar
          reader={reader}
          cursor={cursor}
          total={total}
          chapters={chaptersAdapter}
          lang={lang}
          note={progress?.lastWordIndex ? "Picked up where you left off." : null}
          playerRef={playerRef}
          onSeek={go}
          onPrevSentence={prevSentence}
          onNextSentence={nextSentenceFn}
          onPrevParagraph={prevParagraph}
          onNextParagraph={nextParagraph}
          onOpenChapters={panels.toggleChapters}
          onLocate={locate}
          returnButton={
            offscreen && !pages ? (
              <button type="button" className={`np-btn np-btn--small ${styles.returnBtn}`} onClick={locate}>
                Back to the reading position
              </button>
            ) : null
          }
        />
      }
    />
  );
}

/** Arrow keys belong to sliders, fields and composite widgets — not to plain buttons. */
function arrowsBelongTo(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  if (!t) return false;
  if (typingIn(t)) return true;
  return !!t.closest('input, select, textarea, [role="slider"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], [role="listbox"], [role="grid"], [role="tree"], audio, video');
}

function Subtitle({ model, cursor, pages, pageCount, fallback }: { model: ReaderModel; cursor: Cursor; pages: boolean; pageCount: number; fallback: string }) {
  const sectionIndex = useCursorValue(cursor, (i) => sectionOfWord(model, i));
  const page = useCursorValue(cursor, (i) => pageOfParagraph(model, model.paraOf[i] ?? 0));
  const s = model.sections[sectionIndex];
  const chapter = s && !(s.synthetic && model.sections.length === 1) ? s.title : "";
  const pageText = page !== null && pageCount ? `Page ${page} of ${pageCount}` : "";
  const text = [pages ? "Original pages" : "", pageText, chapter].filter(Boolean).join(" · ") || fallback;
  return <>{text}</>;
}

function ChapterList({
  model,
  cursor,
  wpm,
  titleId,
  onJump,
  onClose,
}: {
  model: ReaderModel;
  cursor: Cursor;
  wpm: number;
  titleId: string;
  onJump: (k: number) => void;
  onClose: () => void;
}) {
  const current = useCursorValue(cursor, (i) => sectionOfWord(model, i));
  const items: ChapterItem[] = model.sections.map((s) => ({
    key: s.index,
    title: s.title,
    meta: shortMinutes(s.end - s.start, wpm),
    current: s.index === current,
    onSelect: () => onJump(s.index),
  }));
  return <ChaptersPanel titleId={titleId} items={items} onClose={onClose} />;
}

function PagesFollow({
  docId,
  pageCount,
  startPage,
  cursor,
  model,
  following,
  onPageInView,
}: {
  docId: string;
  pageCount: number;
  startPage: number;
  cursor: Cursor;
  model: ReaderModel;
  following: boolean;
  onPageInView: (n: number) => void;
}) {
  const page = useCursorValue(cursor, (i) => pageOfParagraph(model, model.paraOf[i] ?? 0));
  return <PagesView docId={docId} pageCount={pageCount} startPage={startPage} followPage={following ? page : null} onPageInView={onPageInView} />;
}

"use client";
// The frame both readers share: the sticky bar (back, title, chapters,
// view, display, Study, Ask), the body with docked side panels on wide screens and
// sheets on narrow ones, and the docked player slot.
import Link from "next/link";
import { useCallback, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ROUTES } from "@/components/app/common/appNav";
import { ArrowLeftIcon, ChatIcon } from "@/components/app/common/icons";
import { prefsStore, setPrefs, usePrefs } from "@/lib/neuropal/prefs";
import { DisplayMenu } from "./DisplayMenu";
import { useHeightVar, useShellInsets, useWidth } from "./hooks";
import { ListIcon, PagesIcon, TextLinesIcon } from "./icons";
import { Sheet } from "./Sheet";
import styles from "./reader.module.css";

// Whether the chapter list stays open on wide screens (an app preference).
const chaptersPref = {
  get: () => prefsStore.get().readerChaptersOpen,
  set: (open: boolean) => setPrefs({ readerChaptersOpen: open }),
};

/** Open/closed state of the side panels, and whether each is docked. Ask and Study share the right-hand side: one at a time. */
export function usePanels(rootRef: RefObject<HTMLElement | null>, initialAsk: boolean, hasChapters: boolean) {
  const width = useWidth(rootRef);
  const storedChapters = usePrefs().readerChaptersOpen;
  const [side, setSide] = useState<"ask" | "study" | null>(initialAsk ? "ask" : null);
  const askOpen = side === "ask";
  const studyOpen = side === "study";
  // On narrow screens the chapter list starts closed whatever is remembered.
  const [chaptersSheet, setChaptersSheet] = useState(false);
  const measured = width > 0;
  const sideDocked = measured && side !== null && width >= 880;
  const askDocked = sideDocked && askOpen;
  const studyDocked = sideDocked && studyOpen;
  const chaptersWanted = hasChapters && measured && width >= 760 ? storedChapters : chaptersSheet;
  const chaptersDocked = hasChapters && measured && width >= 760 && storedChapters && (!sideDocked || width >= 1180);

  // The chapter list makes room on mid-width screens. Outside the state
  // updater: updaters run while rendering, and the preference store would
  // update other components then.
  const showSide = useCallback(
    (which: "ask" | "study", open: boolean | "toggle") => {
      const next = open === "toggle" ? (side === which ? null : which) : open ? which : side === which ? null : side;
      if (next && next !== side && width >= 880 && width < 1180 && chaptersPref.get()) chaptersPref.set(false);
      setSide(next);
    },
    [side, width],
  );
  const setAskOpen = useCallback((open: boolean) => showSide("ask", open), [showSide]);
  const toggleAsk = useCallback(() => showSide("ask", "toggle"), [showSide]);
  const setStudyOpen = useCallback((open: boolean) => showSide("study", open), [showSide]);
  const openStudy = useCallback(() => showSide("study", true), [showSide]);

  const toggleChapters = useCallback(() => {
    if (width >= 760) {
      const next = !chaptersPref.get();
      chaptersPref.set(next);
      if (next && width < 1180) setSide(null);
    } else {
      setChaptersSheet((v) => !v);
    }
  }, [width]);

  const closeChapters = useCallback(() => {
    if (width >= 760) chaptersPref.set(false);
    setChaptersSheet(false);
  }, [width]);

  return {
    width,
    measured,
    askOpen,
    askDocked,
    askSheet: measured && askOpen && !askDocked,
    setAskOpen,
    toggleAsk,
    studyOpen,
    studyDocked,
    studySheet: measured && studyOpen && !studyDocked,
    setStudyOpen,
    openStudy,
    chaptersOpen: chaptersWanted && hasChapters,
    chaptersDocked,
    chaptersSheet: measured && hasChapters && width < 760 && chaptersSheet,
    toggleChapters,
    closeChapters,
  };
}

export interface ReaderFrameProps {
  rootRef: RefObject<HTMLDivElement | null>;
  titleId: string;
  title: string;
  subtitle: ReactNode;
  panels: ReturnType<typeof usePanels>;
  chaptersTitleId: string;
  chapters: ReactNode;
  ask: ReactNode;
  askTitleId: string;
  /** Study (study/useStudyTools): its bar button, and the panel docked or in a sheet like Ask. */
  study?: { button: ReactNode; panel: ReactNode; titleId: string } | null;
  /** Text ⇄ original pages (pdf/arXiv only). */
  view?: { pages: boolean; onChange: (pages: boolean) => void } | null;
  page: ReactNode;
  pageStyle?: CSSProperties;
  customSurface?: boolean;
  player: ReactNode;
  playerRef: RefObject<HTMLDivElement | null>;
  hasChapters: boolean;
}

export function ReaderFrame({
  rootRef,
  playerRef,
  titleId,
  title,
  subtitle,
  panels,
  chaptersTitleId,
  chapters,
  ask,
  askTitleId,
  study,
  view,
  page,
  pageStyle,
  customSurface,
  player,
  hasChapters,
}: ReaderFrameProps) {
  const barRef = useRef<HTMLElement>(null);
  useShellInsets(rootRef);
  useHeightVar(barRef, rootRef, "--bar-h");
  useHeightVar(playerRef, rootRef, "--player-h");
  const narrow = panels.measured && panels.width < 840;

  return (
    <div ref={rootRef} className={styles.reader}>
      <header ref={barRef} className={`np-panel ${styles.bar}`}>
        <Link href={ROUTES.library} className={`np-btn np-btn--ghost np-btn--small ${styles.back}`} aria-label="Back to the library" title="Back to the library">
          <ArrowLeftIcon />
          <span className={styles.btnText}>Library</span>
        </Link>
        <div className={styles.titleBlock}>
          <h1 id={titleId} className={styles.title}>
            {title}
          </h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <div className={styles.barActions}>
          {hasChapters ? (
            <button
              type="button"
              className="np-btn np-btn--ghost np-btn--small"
              aria-expanded={panels.chaptersOpen}
              onClick={panels.toggleChapters}
              title="Chapters"
            >
              <ListIcon />
              <span className={styles.btnText}>Chapters</span>
            </button>
          ) : null}
          {view && !narrow ? (
            <div className={styles.segmented} role="group" aria-label="Show">
              <button type="button" aria-pressed={!view.pages} onClick={() => view?.onChange(false)}>
                <TextLinesIcon />
                Text
              </button>
              <button type="button" aria-pressed={view.pages} onClick={() => view?.onChange(true)}>
                <PagesIcon />
                Pages
              </button>
            </div>
          ) : null}
          <DisplayMenu pagesToggle={narrow ? view : null} />
          {study?.button}
          <button
            type="button"
            className={`np-btn ${panels.askOpen ? "" : "np-btn--ghost"} np-btn--small`}
            aria-expanded={panels.askOpen}
            onClick={panels.toggleAsk}
            title="Ask about this document"
          >
            <ChatIcon />
            <span className={styles.btnText}>Ask</span>
          </button>
        </div>
      </header>

      <div className={styles.body} data-chapters={panels.chaptersDocked || undefined} data-ask={panels.askDocked || (!!study && panels.studyDocked) || undefined}>
        {panels.chaptersDocked ? <div className={`np-panel ${styles.side}`}>{chapters}</div> : null}
        <div className={styles.page} data-surface={customSurface ? "custom" : undefined} style={pageStyle}>
          {page}
        </div>
        {panels.askDocked ? <div className={`np-panel ${styles.side}`}>{ask}</div> : null}
        {study && panels.studyDocked ? <div className={`np-panel ${styles.side}`}>{study.panel}</div> : null}
      </div>

      {player}

      <Sheet open={panels.askSheet} onClose={() => panels.setAskOpen(false)} labelledBy={askTitleId}>
        {panels.askSheet ? ask : null}
      </Sheet>
      {study ? (
        <Sheet open={panels.studySheet} onClose={() => panels.setStudyOpen(false)} labelledBy={study.titleId}>
          {panels.studySheet ? study.panel : null}
        </Sheet>
      ) : null}
      <Sheet open={panels.chaptersSheet} onClose={panels.closeChapters} labelledBy={chaptersTitleId}>
        {panels.chaptersSheet ? chapters : null}
      </Sheet>
    </div>
  );
}

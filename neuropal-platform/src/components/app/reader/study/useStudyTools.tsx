"use client";
// Study in a reader (text or EPUB): the bar's Study button and its shortcut
// (S), the panel for ReaderFrame to dock or show as a sheet, and `explain`
// for a passage picked in the text. Closing gives focus back to the button.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Kbd } from "@/components/app/common/bits";
import { usePrefs } from "@/lib/neuropal/prefs";
import type { Citation } from "@/lib/neuropal/types";
import { typingIn } from "../hooks";
import type { usePanels } from "../ReaderFrame";
import readerStyles from "../reader.module.css";
import { StudyIcon } from "./icons";
import { explainNow, markViewing, useStudyBusy } from "./state";
import { StudyPanel } from "./StudyPanel";
import styles from "./study.module.css";

/** The app's "go to" keys start with g (g then s is Settings): an s right after a g is theirs. */
const GO_CHORD_MS = 1500;

export interface StudyTools {
  titleId: string;
  /** For the reader's bar, next to Ask. */
  button: ReactNode;
  /** For ReaderFrame: docked beside the text, or in a sheet. */
  panel: ReactNode;
  /** Explain a passage picked in the text: opens Study on Explain. */
  explain: (passage: string) => void;
}

export function useStudyTools({
  docId,
  docTitle,
  docStatus,
  panels,
  onCite,
  citeLabel,
  sentenceAtCursor,
  canSelect,
}: {
  docId: string;
  docTitle: string;
  /** The document's processing status: the tools need it "ready" (an EPUB opens before). */
  docStatus: string;
  panels: ReturnType<typeof usePanels>;
  onCite: (c: Citation) => boolean | Promise<boolean>;
  citeLabel: (c: Citation, n: number) => string;
  sentenceAtCursor: () => string;
  canSelect: boolean;
}): StudyTools {
  const ids = useId();
  const titleId = `${ids}-study`;
  const { shortcuts } = usePrefs();
  const busy = useStudyBusy(docId);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wantFocus = useRef(false);
  const [focusTick, setFocusTick] = useState(0);
  const { studyOpen, studySheet, studyDocked, openStudy, setStudyOpen } = panels;
  const unavailable =
    docStatus === "ready"
      ? null
      : docStatus === "failed"
        ? "Study tools need the text to be processed first. Try processing it again from the library."
        : "Study tools are available when processing completes.";

  useEffect(() => markViewing(docId), [docId]);

  const takeFocus = useCallback(() => {
    const want = wantFocus.current;
    wantFocus.current = false;
    return want;
  }, []);

  const open = useCallback(() => {
    // The sheet gives focus back to whatever had it when it opened: the button.
    buttonRef.current?.focus({ preventScroll: true });
    wantFocus.current = true;
    setFocusTick((t) => t + 1);
    openStudy();
  }, [openStudy]);

  // Focus moves to the button before the panel goes (no frame later: a quick
  // reopen must not have its focus taken back). In the sheet the button is
  // behind the modal; the sheet gives focus back to it as it closes.
  const close = useCallback(() => {
    buttonRef.current?.focus({ preventScroll: true });
    setStudyOpen(false);
  }, [setStudyOpen]);

  const toggle = useCallback(() => (studyOpen ? close() : open()), [studyOpen, open, close]);

  // S opens and closes Study: never while typing, with a modifier, in a dialog,
  // or as the second key of the app's "g then s".
  useEffect(() => {
    if (!shortcuts) return;
    // performance.now() starts at the page load: "never" must be -Infinity, not 0.
    let lastG = Number.NEGATIVE_INFINITY;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.repeat || typingIn(e.target)) return;
      const k = e.key.toLowerCase();
      if (k !== "s" || e.shiftKey) {
        lastG = k === "g" && !e.shiftKey ? performance.now() : Number.NEGATIVE_INFINITY;
        return;
      }
      if (performance.now() - lastG < GO_CHORD_MS || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, toggle]);

  // A source chip in the sheet: the sheet closes first, then the reader scrolls.
  const cite = useCallback(
    async (c: Citation) => {
      if (studySheet) {
        setStudyOpen(false);
        await new Promise((r) => window.setTimeout(r, 160));
      }
      return onCite(c);
    },
    [studySheet, setStudyOpen, onCite],
  );

  const explain = useCallback(
    (passage: string) => {
      explainNow(docId, passage, docTitle);
      if (!studyOpen) open();
      else {
        wantFocus.current = true;
        setFocusTick((t) => t + 1);
      }
    },
    [docId, docTitle, studyOpen, open],
  );

  const button = (
    <button
      ref={buttonRef}
      type="button"
      className={`np-btn ${studyOpen ? "" : "np-btn--ghost"} np-btn--small ${styles.barBtn}`}
      aria-expanded={studyOpen}
      aria-keyshortcuts={shortcuts ? "S" : undefined}
      onClick={toggle}
      title={shortcuts ? "Study tools (S)" : "Study tools"}
    >
      <StudyIcon />
      <span className={readerStyles.btnText}>
        Study
        {shortcuts ? (
          <span aria-hidden="true" className={styles.barKey}>
            <Kbd>S</Kbd>
          </span>
        ) : null}
      </span>
      {busy ? (
        <>
          <span className={styles.busyDot} aria-hidden="true" />
          <span className="np-sr-only">, working</span>
        </>
      ) : null}
    </button>
  );

  const panel = (
    <StudyPanel
      docId={docId}
      docTitle={docTitle}
      titleId={titleId}
      unavailable={unavailable}
      docked={studyDocked}
      focusTick={focusTick}
      onClose={close}
      onCite={cite}
      citeLabel={citeLabel}
      sentenceAtCursor={sentenceAtCursor}
      canSelect={canSelect}
      takeFocus={takeFocus}
    />
  );

  return { titleId, button, panel, explain };
}

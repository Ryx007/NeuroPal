"use client";
// Study: make study material from the open document — a summary, a quiz, a
// cheat sheet, flashcards, or an explanation of a passage (Expo's StudySheet,
// desktop-first). Docked beside the text on wide screens, a full-height sheet
// on narrow ones. What the server writes is untrusted text: rendered through
// the safe Markdown renderer. Results stay per document when the panel
// closes (state.ts), and a request keeps going meanwhile.
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { announce } from "@/components/app/common/announce";
import { ChoiceChips } from "@/components/app/common/bits";
import { CloseIcon } from "@/components/app/common/icons";
import { Markdown } from "@/lib/neuropal/reader/markdown";
import { PASSAGE_MAX, QUIZ_COUNTS } from "@/lib/neuropal/study";
import type { Citation, QuizDifficulty, StudyDepth } from "@/lib/neuropal/types";
import { LocateIcon } from "../icons";
import { FlashcardsView } from "./FlashcardsView";
import { CardsIcon, CheatSheetIcon, ExplainIcon, QuizIcon, StudyIcon, SummaryIcon } from "./icons";
import { CopyButton, Failure, Made, Sources, Working } from "./parts";
import { QuizView } from "./QuizView";
import {
  cancel,
  DEPTH_LABELS,
  DIFFICULTY_LABELS,
  explainNow,
  run,
  selectTool,
  setOptions,
  setRevealed,
  TOOLS,
  useStudy,
  type DocStudy,
  type StudyTool,
} from "./state";
import styles from "./study.module.css";

const TOOL_ICONS: Record<StudyTool, typeof SummaryIcon> = {
  summary: SummaryIcon,
  quiz: QuizIcon,
  cheatsheet: CheatSheetIcon,
  flashcards: CardsIcon,
  explain: ExplainIcon,
};

const DEPTHS = (["quick", "intuitive", "comprehensive"] as StudyDepth[]).map((d) => ({ value: d, label: DEPTH_LABELS[d] }));
const DIFFICULTIES = (["mixed", "easy", "hard"] as QuizDifficulty[]).map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }));
const QUIZ_CHOICES = QUIZ_COUNTS.map((n) => ({ value: n as number, label: String(n), ariaLabel: `${n} questions` }));

const INTRO: Record<Exclude<StudyTool, "flashcards" | "explain">, string> = {
  summary: "A summary of the whole document. Quick gives the main points, intuitive builds understanding in plain words, comprehensive goes section by section.",
  quiz: "Practice questions for active recall. Each answer stays hidden until you ask for it.",
  cheatsheet: "One page for last-minute review: key definitions, results, pitfalls and the shape of the argument.",
};

const FIRST_LABEL: Record<Exclude<StudyTool, "flashcards">, string> = {
  summary: "Make a summary",
  quiz: "Make a quiz",
  cheatsheet: "Make a cheat sheet",
  explain: "Explain",
};

const WORKING: Record<Exclude<StudyTool, "flashcards">, string> = {
  summary: "Reading the document and writing your summary…",
  quiz: "Reading the document and writing your quiz…",
  cheatsheet: "Reading the document and writing your cheat sheet…",
  explain: "Reading around the passage and writing an explanation…",
};

export interface StudyPanelProps {
  docId: string;
  docTitle: string;
  titleId: string;
  /** null when the tools can be used; else why not, in plain words. */
  unavailable: string | null;
  /** Docked beside the text: Escape closes it here (the sheet closes itself). */
  docked: boolean;
  onClose: () => void;
  /** Scroll the reader to a cited passage; false when it can't be found. */
  onCite: (c: Citation) => boolean | Promise<boolean>;
  citeLabel: (c: Citation, n: number) => string;
  /** The sentence at the reading position, for "Explain the sentence being read". */
  sentenceAtCursor: () => string;
  /** Text in the reader can be selected (not inside an EPUB's frame). */
  canSelect: boolean;
  /** True once after a person opened the panel: focus goes to the open tool's tab. */
  takeFocus: () => boolean;
  /** Changes with each such request (so an open panel takes focus too). */
  focusTick: number;
}

export function StudyPanel({
  docId,
  docTitle,
  titleId,
  unavailable,
  docked,
  focusTick,
  onClose,
  onCite,
  citeLabel,
  sentenceAtCursor,
  canSelect,
  takeFocus,
}: StudyPanelProps) {
  const base = useId();
  const study = useStudy(docId);
  const tool = study.tool;
  const tabId = (t: StudyTool) => `${base}-tab-${t}`;

  // Opened (or pointed at a passage) by a person: focus goes to the open
  // tool's tab. The sheet focuses it itself (data-autofocus); docked, here.
  // A resize that moves the panel between sheet and dock never takes focus.
  useEffect(() => {
    if (takeFocus() && docked) document.getElementById(`${base}-tab-${tool}`)?.focus();
  }, [focusTick, takeFocus, docked, base, tool]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = TOOLS.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    selectTool(docId, TOOLS[next].id);
    document.getElementById(tabId(TOOLS[next].id))?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape" || !docked || e.defaultPrevented) return;
    e.preventDefault();
    onClose();
  };

  return (
    <section className={styles.panel} aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className={styles.head}>
        <span className={styles.headIcon} aria-hidden="true">
          <StudyIcon />
        </span>
        <div className={styles.headText}>
          <h2 id={titleId} className={styles.title}>
            Study
          </h2>
          {docked ? null : <p className={styles.docName}>{docTitle}</p>}
        </div>
        <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={onClose} aria-label="Close Study" title={docked ? "Close (Esc)" : "Close"}>
          <CloseIcon />
        </button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Study tools">
        {TOOLS.map((t, i) => {
          const selected = t.id === tool;
          const state = study.tools[t.id];
          const Icon = TOOL_ICONS[t.id];
          return (
            <button
              key={t.id}
              id={tabId(t.id)}
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              data-autofocus={selected || undefined}
              onClick={() => selectTool(docId, t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              <Icon />
              <span>{t.label}</span>
              {state.running ? (
                <>
                  <span className={styles.tabBusy} aria-hidden="true" />
                  <span className="np-sr-only">, working</span>
                </>
              ) : state.error ? (
                <span className="np-sr-only">, not made</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={tabId(tool)} className={styles.scroll} tabIndex={0}>
        {unavailable ? <p className={styles.unavailable}>{unavailable}</p> : null}
        {tool === "flashcards" ? (
          <FlashcardsView docId={docId} docTitle={docTitle} study={study} unavailable={unavailable} />
        ) : (
          <TextTool
            key={tool}
            tool={tool}
            docId={docId}
            docTitle={docTitle}
            study={study}
            unavailable={unavailable}
            onCite={onCite}
            citeLabel={citeLabel}
            sentenceAtCursor={sentenceAtCursor}
            canSelect={canSelect}
          />
        )}
      </div>
    </section>
  );
}

// ---- summary, quiz, cheat sheet, explain ----------------------------------------------------

function TextTool({
  tool,
  docId,
  docTitle,
  study,
  unavailable,
  onCite,
  citeLabel,
  sentenceAtCursor,
  canSelect,
}: {
  tool: Exclude<StudyTool, "flashcards">;
  docId: string;
  docTitle: string;
  study: DocStudy;
  unavailable: string | null;
  onCite: (c: Citation) => boolean | Promise<boolean>;
  citeLabel: (c: Citation, n: number) => string;
  sentenceAtCursor: () => string;
  canSelect: boolean;
}) {
  const slot = study.tools[tool];
  const o = study.options;
  const busy = slot.running;
  const result = slot.result;
  const needsPassage = tool === "explain" && !study.passage;
  const blocked = !!unavailable || needsPassage;
  const label = busy ? "Working…" : result ? "Generate again" : slot.error?.retry ? "Try again" : FIRST_LABEL[tool];
  const Icon = TOOL_ICONS[tool];

  const go = () => {
    if (busy || blocked) return;
    run(docId, tool, docTitle);
  };

  return (
    <>
      {tool === "explain" ? (
        <Passage docId={docId} docTitle={docTitle} passage={study.passage} canSelect={canSelect} sentenceAtCursor={sentenceAtCursor} blocked={!!unavailable} />
      ) : result ? null : (
        <p className={styles.lead}>{INTRO[tool]}</p>
      )}

      {tool === "summary" ? <ChoiceChips label="Depth" value={o.depth} choices={DEPTHS} onChange={(v) => setOptions(docId, { depth: v })} /> : null}
      {tool === "explain" ? <ChoiceChips label="Depth" value={o.explainDepth} choices={DEPTHS} onChange={(v) => setOptions(docId, { explainDepth: v })} /> : null}
      {tool === "quiz" ? (
        <div className={styles.optionRow}>
          <ChoiceChips label="Questions" value={o.quizCount} choices={QUIZ_CHOICES} onChange={(v) => setOptions(docId, { quizCount: v })} />
          <ChoiceChips label="Difficulty" value={o.quizDifficulty} choices={DIFFICULTIES} onChange={(v) => setOptions(docId, { quizDifficulty: v })} />
        </div>
      ) : null}

      {needsPassage ? null : (
        <div className={styles.actions}>
          <button type="button" className="np-btn np-btn--small" onClick={go} aria-disabled={busy || blocked ? true : undefined}>
            <Icon />
            {label}
          </button>
          {result && !busy ? <CopyButton text={result.markdown} what={result.label} /> : null}
        </div>
      )}

      {busy ? <Working title={WORKING[tool]} startedAt={busy.startedAt} onCancel={() => cancel(docId, tool)} /> : null}
      {slot.error && !busy ? <Failure failure={slot.error} /> : null}

      {result ? (
        <div className={styles.result} data-stale={busy ? true : undefined}>
          {busy ? <p className={styles.note}>Your earlier one stays here until the new one is ready.</p> : null}
          <Made label={result.label} at={result.at} />
          {tool === "quiz" && result.quiz ? (
            <QuizView quiz={result.quiz} revealed={study.revealed} onRevealed={(next) => setRevealed(docId, next)} />
          ) : (
            <Markdown
              text={result.markdown}
              className={styles.md}
              mathClassName={styles.mathInline}
              citeClassName={styles.cite}
              citationCount={result.citations.length}
              citationLabel={(n) => citeLabel(result.citations[n - 1], n)}
              onCitation={(n) => {
                const c = result.citations[n - 1];
                if (c) void onCite(c);
              }}
            />
          )}
          <Sources citations={result.citations} citeLabel={citeLabel} onCite={onCite} />
        </div>
      ) : null}
    </>
  );
}

// ---- the passage to explain -----------------------------------------------------------------

const SHORT = 360;

function Passage({
  docId,
  docTitle,
  passage,
  canSelect,
  sentenceAtCursor,
  blocked,
}: {
  docId: string;
  docTitle: string;
  passage: string | null;
  canSelect: boolean;
  sentenceAtCursor: () => string;
  blocked: boolean;
}) {
  const [full, setFull] = useState(false);
  const long = !!passage && passage.length > SHORT;
  const shown = passage && long && !full ? `${passage.slice(0, SHORT).trimEnd()}…` : passage;

  const explainSentence = () => {
    if (blocked) return;
    const s = sentenceAtCursor().trim();
    if (!s) {
      announce("There’s no sentence at the reading position yet.");
      return;
    }
    explainNow(docId, s, docTitle);
  };

  return (
    <div className={styles.passageBlock}>
      {passage ? (
        <figure className={styles.passage}>
          <figcaption className={styles.faceLabel}>Passage{passage.length > PASSAGE_MAX ? ` (the first ${PASSAGE_MAX.toLocaleString()} characters are explained)` : ""}</figcaption>
          <blockquote className={styles.quote}>{shown}</blockquote>
          {long ? (
            <button type="button" className={styles.textBtn} aria-expanded={full} onClick={() => setFull((v) => !v)}>
              {full ? "Show less" : "Show the whole passage"}
            </button>
          ) : null}
        </figure>
      ) : (
        <p className={styles.lead}>
          {canSelect
            ? "Select a passage in the text, then choose “Explain this”. Or explain the sentence being read."
            : "Explain the sentence being read: move the reading position to it with the player, then choose below."}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={explainSentence} aria-disabled={blocked || undefined}>
          <LocateIcon />
          Explain the sentence being read
        </button>
      </div>
    </div>
  );
}

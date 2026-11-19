"use client";
// The study panel's working state for this tab, per document: the open tool,
// the options picked, what each tool made, and the requests still running.
// It lives outside the panel, so closing and reopening the panel keeps a
// result and a request keeps going while the panel is closed; it is keyed by
// document, so one document's summary never shows on another; and it is the
// account's, so it goes (requests stopped) when the session ends.
import { useCallback, useSyncExternalStore } from "react";
import { announce } from "@/components/app/common/announce";
import { onForget } from "@/lib/neuropal/localData";
import { currentAccount } from "@/lib/neuropal/owner";
import { markdownToPlain } from "@/lib/neuropal/reader/markdown";
import {
  explainPassage,
  makeCheatSheet,
  makeFlashcards,
  makeQuiz,
  saveDeck,
  studyFailure,
  summarize,
  type Deck,
  type StudyFailure,
} from "@/lib/neuropal/study";
import type { Citation, QuizDifficulty, StudyAnswer, StudyDepth } from "@/lib/neuropal/types";
import { parseQuiz, type ParsedQuiz } from "./quizParse";

export type StudyTool = "summary" | "quiz" | "cheatsheet" | "flashcards" | "explain";

export const TOOLS: { id: StudyTool; label: string; noun: string }[] = [
  { id: "summary", label: "Summary", noun: "summary" },
  { id: "quiz", label: "Quiz", noun: "quiz" },
  { id: "cheatsheet", label: "Cheat sheet", noun: "cheat sheet" },
  { id: "flashcards", label: "Flashcards", noun: "flashcards" },
  { id: "explain", label: "Explain", noun: "explanation" },
];

export const nounOf = (t: StudyTool) => TOOLS.find((x) => x.id === t)?.noun ?? "study notes";

export const DEPTH_LABELS: Record<StudyDepth, string> = { quick: "Quick", intuitive: "Intuitive", comprehensive: "Comprehensive" };
export const DIFFICULTY_LABELS: Record<QuizDifficulty, string> = { mixed: "Mixed", easy: "Easy", hard: "Hard" };

export interface StudyOptions {
  depth: StudyDepth;
  quizCount: number;
  quizDifficulty: QuizDifficulty;
  cardCount: number;
  explainDepth: StudyDepth;
}

export interface TextResult {
  markdown: string;
  citations: Citation[];
  /** ISO time it arrived. */
  at: string;
  /** What it was made with, in words ("Intuitive summary", "10 questions · Mixed"). */
  label: string;
  /** Explain: the passage it explains. */
  passage?: string;
  /** Quiz: the questions, when the text has that shape. */
  quiz?: ParsedQuiz | null;
}

export interface ToolState {
  running: { id: number; startedAt: number; label: string } | null;
  result: TextResult | null;
  error: StudyFailure | null;
}

export interface DocStudy {
  tool: StudyTool;
  options: StudyOptions;
  tools: Record<StudyTool, ToolState>;
  /** Explain: the passage picked in the reader. */
  passage: string | null;
  /** Quiz: the questions whose answer is showing. */
  revealed: number[];
  /** A deck this device couldn't keep (storage refused): studied from memory instead. */
  deck: Deck | null;
  /** Flashcards: the current card's answer is showing. */
  flipped: boolean;
}

const IDLE: ToolState = { running: null, result: null, error: null };

export const DEFAULT_STUDY: DocStudy = {
  tool: "summary",
  options: { depth: "intuitive", quizCount: 10, quizDifficulty: "mixed", cardCount: 15, explainDepth: "intuitive" },
  tools: { summary: IDLE, quiz: IDLE, cheatsheet: IDLE, flashcards: IDLE, explain: IDLE },
  passage: null,
  revealed: [],
  deck: null,
  flipped: false,
};

// ---- the store ---------------------------------------------------------------------

const docs = new Map<string, DocStudy>();
const running = new Map<string, AbortController>();
/** Documents open in a reader in this tab (for how a finished request is announced). */
const viewing = new Map<string, number>();
const listeners = new Set<() => void>();
let seq = 0;

const emit = () => listeners.forEach((l) => l());
const keyOf = (docId: string, tool: StudyTool) => `${docId}|${tool}`;

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const getStudy = (docId: string): DocStudy => docs.get(docId) ?? DEFAULT_STUDY;

function update(docId: string, fn: (d: DocStudy) => DocStudy) {
  docs.set(docId, fn(getStudy(docId)));
  emit();
}

const withTool = (d: DocStudy, tool: StudyTool, patch: Partial<ToolState>): DocStudy => ({
  ...d,
  tools: { ...d.tools, [tool]: { ...d.tools[tool], ...patch } },
});

/** One document's study state (stable until it changes). */
export function useStudy(docId: string): DocStudy {
  const get = useCallback(() => getStudy(docId), [docId]);
  return useSyncExternalStore(subscribe, get, () => DEFAULT_STUDY);
}

/** Something is being made for this document right now. */
export function useStudyBusy(docId: string): boolean {
  const get = useCallback(() => TOOLS.some((t) => running.has(keyOf(docId, t.id))), [docId]);
  return useSyncExternalStore(subscribe, get, () => false);
}

/** A reader shows this document (returns the undo). */
export function markViewing(docId: string): () => void {
  viewing.set(docId, (viewing.get(docId) ?? 0) + 1);
  return () => {
    const n = (viewing.get(docId) ?? 1) - 1;
    if (n > 0) viewing.set(docId, n);
    else viewing.delete(docId);
  };
}

// ---- small edits ---------------------------------------------------------------------

export const selectTool = (docId: string, tool: StudyTool) => update(docId, (d) => (d.tool === tool ? d : { ...d, tool }));

export const setOptions = (docId: string, patch: Partial<StudyOptions>) => update(docId, (d) => ({ ...d, options: { ...d.options, ...patch } }));

export const setRevealed = (docId: string, revealed: number[]) => update(docId, (d) => ({ ...d, revealed }));

export const setFlipped = (docId: string, flipped: boolean) => update(docId, (d) => (d.flipped === flipped ? d : { ...d, flipped }));

/** Progress in a deck kept in memory only (see `deck`). */
export const setMemoryDeck = (docId: string, deck: Deck | null) => update(docId, (d) => ({ ...d, deck }));

// ---- making things --------------------------------------------------------------------

function labelFor(tool: StudyTool, o: StudyOptions): string {
  switch (tool) {
    case "summary":
      return `${DEPTH_LABELS[o.depth]} summary`;
    case "quiz":
      return `${o.quizCount} questions · ${DIFFICULTY_LABELS[o.quizDifficulty]}`;
    case "cheatsheet":
      return "Cheat sheet";
    case "flashcards":
      return `${o.cardCount} cards`;
    case "explain":
      return `${DEPTH_LABELS[o.explainDepth]} explanation`;
  }
}

const preview = (md: string) => {
  const plain = markdownToPlain(md).replace(/\s+/g, " ").trim();
  return plain.length > 160 ? `${plain.slice(0, 160)}…` : plain;
};

/**
 * Make `tool`'s thing for this document with the options picked. One request
 * per tool and document at a time; it keeps going when the panel closes.
 * `title` names the document when the result lands after you left it.
 */
export function run(docId: string, tool: StudyTool, title: string) {
  const d = getStudy(docId);
  if (d.tools[tool].running) return;
  const passage = d.passage;
  if (tool === "explain" && !passage) return;
  const key = keyOf(docId, tool);
  const ctrl = new AbortController();
  const account = currentAccount();
  const id = ++seq;
  const opts = d.options;
  const label = labelFor(tool, opts);
  const noun = nounOf(tool);
  running.set(key, ctrl);
  update(docId, (x) => withTool(x, tool, { running: { id, startedAt: Date.now(), label }, error: null }));
  announce(tool === "explain" ? "Explaining the passage. You can keep reading." : `Making your ${noun}. You can keep reading.`);

  /** Still this request, for this account? (Cancel and sign-out make it not.) */
  const current = () => running.get(key) === ctrl && currentAccount() === account;
  const away = () => !viewing.has(docId);

  const work = async (): Promise<{ result?: TextResult; deck?: Deck | null; words: string }> => {
    if (tool === "flashcards") {
      const cards = await makeFlashcards(docId, opts.cardCount, ctrl.signal);
      if (!current()) return { words: "" };
      const kept = saveDeck(docId, cards, account);
      const deck: Deck | null = kept ? null : { cards, generatedAt: new Date().toISOString(), queue: cards.map((_, i) => i), recalled: 0 };
      return { deck, words: `${cards.length} flashcards ready. The first card is waiting.` };
    }
    let r: StudyAnswer;
    if (tool === "summary") r = await summarize(docId, opts.depth, ctrl.signal);
    else if (tool === "quiz") r = await makeQuiz(docId, opts.quizCount, opts.quizDifficulty, ctrl.signal);
    else if (tool === "cheatsheet") r = await makeCheatSheet(docId, ctrl.signal);
    else r = await explainPassage(docId, passage ?? "", opts.explainDepth, ctrl.signal);
    const quiz = tool === "quiz" ? parseQuiz(r.answer) : undefined;
    const result: TextResult = {
      markdown: r.answer,
      citations: r.citations,
      at: new Date().toISOString(),
      label,
      ...(tool === "explain" ? { passage: passage ?? "" } : {}),
      ...(tool === "quiz" ? { quiz } : {}),
    };
    const words =
      tool === "quiz"
        ? quiz
          ? `Quiz ready: ${quiz.items.length} questions. Each answer is hidden until you ask for it.`
          : "Quiz ready."
        : tool === "cheatsheet"
          ? "Cheat sheet ready."
          : `${tool === "explain" ? "Explanation" : "Summary"} ready. ${preview(r.answer)}`;
    return { result, words };
  };

  void work()
    .then((out) => {
      if (!current()) return;
      running.delete(key);
      update(docId, (x) => {
        const next = withTool(x, tool, { running: null, error: null, ...(out.result ? { result: out.result } : {}) });
        if (tool === "quiz") return { ...next, revealed: [] };
        if (tool === "flashcards") return { ...next, deck: out.deck ?? null, flipped: false };
        return next;
      });
      announce(away() ? `Your ${noun} for “${title}” is ready. It’s in Study when you open that document again.` : out.words);
    })
    .catch((e: unknown) => {
      if (ctrl.signal.aborted || !current()) return;
      running.delete(key);
      const failure = studyFailure(e, noun);
      update(docId, (x) => withTool(x, tool, { running: null, error: failure }));
      announce(away() ? `Your ${noun} for “${title}” wasn’t made. ${failure.text}` : `Your ${noun} wasn’t made. ${failure.text}`);
    });
}

/** Stop waiting for `tool` (the server may still finish; nothing of it is kept). */
export function cancel(docId: string, tool: StudyTool) {
  const key = keyOf(docId, tool);
  const ctrl = running.get(key);
  if (!ctrl) return;
  running.delete(key);
  ctrl.abort();
  update(docId, (x) => withTool(x, tool, { running: null }));
  announce(`Stopped. Your ${nounOf(tool)} wasn’t made.`);
}

/** Explain a passage picked in the reader: it replaces any passage being explained. */
export function explainNow(docId: string, passage: string, title: string) {
  const text = passage.replace(/\s+/g, " ").trim();
  if (!text) return;
  const key = keyOf(docId, "explain");
  const ctrl = running.get(key);
  if (ctrl) {
    running.delete(key);
    ctrl.abort();
  }
  update(docId, (x) => ({ ...withTool(x, "explain", { running: null, result: null, error: null }), passage: text, tool: "explain" }));
  run(docId, "explain", title);
}

// The session ended: requests stop and nothing of this account stays in memory.
onForget(() => {
  running.forEach((c) => c.abort());
  running.clear();
  docs.clear();
  emit();
});

// Study tools for one document (docs/BRAIN.md §4): a summary, a quiz, a cheat
// sheet, flashcards and "explain this passage", all written by the server's
// AI from the document. The four text tools answer in Ask's envelope
// (Markdown + citations); flashcards come back as {front, back} pairs and are
// kept on this device per document. The decks belong to the signed-in
// account like everything else in localData.ts: written only while it is
// signed in, and cleared when its session ends.
//
// Only these five calls leave the browser; nothing else is sent anywhere.
import { createStoredValue, useStored } from "@/lib/store";
import { ApiError, request, seg } from "./client";
import { onForget, STUDY_DECKS_KEY } from "./localData";
import { personalOpen } from "./owner";
import type { Citation, Flashcard, FlashcardsReply, QuizDifficulty, StudyAnswer, StudyDepth } from "./types";

/** A cloud model takes 5–40 s and a local one minutes: never give up before the server does. */
export const STUDY_TIMEOUT_MS = 5 * 60 * 1000;
/** The server explains at most this much of a passage. */
export const PASSAGE_MAX = 2000;
export const QUIZ_COUNTS = [5, 10, 15] as const;
export const CARD_COUNTS = [10, 15, 25] as const;

// ---- the calls ---------------------------------------------------------------------

function isCitation(c: unknown): c is Citation {
  return !!c && typeof c === "object";
}

/** The text tools' reply, checked: an empty answer is the model failing, said as such. */
function checked(r: StudyAnswer | null): StudyAnswer {
  const answer = typeof r?.answer === "string" ? r.answer.trim() : "";
  if (!r || !answer) throw new ApiError("The model returned an empty answer.", 502);
  return { ...r, answer, citations: Array.isArray(r.citations) ? r.citations.filter(isCitation) : [] };
}

const post = <T>(path: string, json: Record<string, unknown>, signal?: AbortSignal) =>
  request<T>(path, { method: "POST", body: { json }, signal, timeoutMs: STUDY_TIMEOUT_MS });

export const summarize = (id: string, depth: StudyDepth, signal?: AbortSignal) =>
  post<StudyAnswer>(`/documents/${seg(id)}/summarize`, { depth }, signal).then(checked);

export const makeQuiz = (id: string, count: number, difficulty: QuizDifficulty, signal?: AbortSignal) =>
  post<StudyAnswer>(`/documents/${seg(id)}/quiz`, { count, difficulty }, signal).then(checked);

export const makeCheatSheet = (id: string, signal?: AbortSignal) => post<StudyAnswer>(`/documents/${seg(id)}/cheatsheet`, {}, signal).then(checked);

export const explainPassage = (id: string, passage: string, depth: StudyDepth, signal?: AbortSignal) =>
  post<StudyAnswer>(`/documents/${seg(id)}/explain`, { passage: passage.slice(0, PASSAGE_MAX), depth }, signal).then(checked);

/** Cards as text: trimmed, both sides present, at most 40 (the server's own cap). */
export function cleanCards(list: unknown): Flashcard[] {
  if (!Array.isArray(list)) return [];
  const out: Flashcard[] = [];
  for (const c of list) {
    if (!c || typeof c !== "object") continue;
    const o = c as Partial<Flashcard>;
    const front = typeof o.front === "string" ? o.front.trim().slice(0, 1200) : "";
    const back = typeof o.back === "string" ? o.back.trim().slice(0, 2400) : "";
    if (front && back) out.push({ front, back });
    if (out.length >= 40) break;
  }
  return out;
}

export async function makeFlashcards(id: string, count: number, signal?: AbortSignal): Promise<Flashcard[]> {
  const r = await post<FlashcardsReply>(`/documents/${seg(id)}/flashcards`, { count }, signal);
  const cards = cleanCards(r?.cards);
  if (!cards.length) throw new ApiError("The model didn’t return usable flashcards.", 502);
  return cards;
}

// ---- failures, in words a person can act on --------------------------------------------

export interface StudyFailure {
  text: string;
  /** Trying again straight away can help (not for today's limit or a document that's gone). */
  retry: boolean;
}

/** Plain words for a failed study call; `what` names the thing ("summary", "flashcards"). */
export function studyFailure(e: unknown, what: string): StudyFailure {
  if (e instanceof ApiError) {
    if (e.offline) {
      if (/too long/i.test(e.message)) return { retry: true, text: `Your ${what} took too long, so it was stopped. Try again, or pick a shorter option.` };
      if (/offline/i.test(e.message)) return { retry: true, text: "You’re offline right now. Connect again, then try again." };
      if (/connect to your/i.test(e.message)) return { retry: false, text: "Connect to your NeuroPal server first (Settings)." };
      return { retry: true, text: "Can’t reach your NeuroPal server right now. Check your connection, then try again." };
    }
    if (e.status === 409) {
      return /status:\s*failed/i.test(e.message)
        ? { retry: false, text: "This document couldn’t be processed, so there’s no text to study yet. Try processing it again from the library." }
        : { retry: true, text: "This document is still being processed. Study tools work once it’s ready — try again in a minute." };
    }
    if (e.status === 429) {
      return e.retryAfter
        ? { retry: true, text: `Too many at once. Wait ${e.retryAfter} s, then try again.` }
        : { retry: false, text: "You’ve reached today’s limit for AI answers. It resets at midnight (UTC). Reading and listening still work." };
    }
    if (e.status === 503) return { retry: true, text: "The AI service is busy or out of quota right now. Try again in a little while." };
    if (e.status === 404) return { retry: false, text: "This document isn’t in your library any more." };
    if (e.status === 401) return { retry: false, text: "Your session ended. Sign in again to keep studying." };
    if (e.status >= 500) return { retry: true, text: `The model couldn’t make your ${what} this time. Try again — it often works the second time.` };
  }
  return { retry: true, text: "Something went wrong. Try again." };
}

// ---- flashcard decks, kept on this device per document --------------------------------------

export interface Deck {
  cards: Flashcard[];
  /** ISO time it was made. */
  generatedAt: string;
  /** Cards still to go, by index, in order ("Again" puts one at the end). */
  queue: number[];
  /** Cards put away with "Got it". */
  recalled: number;
}

type Decks = Record<string, Deck>;

/** The newest decks kept (one per document). */
const MAX_DECKS = 30;
const EMPTY_DECKS: Decks = {};

function parseDeck(v: unknown): Deck | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<Deck>;
  const cards = cleanCards(o.cards);
  if (!cards.length) return null;
  const seen = new Set<number>();
  const queue = (Array.isArray(o.queue) ? (o.queue as unknown[]) : cards.map((_, i) => i)).filter((i): i is number => {
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= cards.length || seen.has(i)) return false;
    seen.add(i);
    return true;
  });
  const recalled = typeof o.recalled === "number" && Number.isInteger(o.recalled) ? Math.max(0, Math.min(cards.length, o.recalled)) : 0;
  return { cards, generatedAt: String(o.generatedAt || ""), queue, recalled };
}

function parseDecks(raw: string): Decks {
  const o = JSON.parse(raw) as unknown;
  if (!o || typeof o !== "object" || Array.isArray(o)) return EMPTY_DECKS;
  const out: Decks = {};
  for (const [id, v] of Object.entries(o as Record<string, unknown>)) {
    const d = parseDeck(v);
    if (d && id) out[id] = d;
  }
  return out;
}

const decksStore = createStoredValue<Decks>({ key: STUDY_DECKS_KEY, area: "local", fallback: EMPTY_DECKS, parse: parseDecks });

// localData.ts clears the stored decks by key; this drops the copy in memory.
onForget(() => decksStore.clear());

/** This document's deck on this device, or null. */
export function useDeck(docId: string): Deck | null {
  return useStored(decksStore)[docId] ?? null;
}

/**
 * Keep a new deck for this document (replacing the old one). False when it
 * can't be kept: nobody is signed in any more, or another account is now
 * (`account`: who asked for it).
 */
export function saveDeck(docId: string, cards: Flashcard[], account?: string | null): boolean {
  if (!personalOpen(account) || !cards.length) return false;
  const next: Decks = { ...decksStore.get(), [docId]: { cards, generatedAt: new Date().toISOString(), queue: cards.map((_, i) => i), recalled: 0 } };
  const ids = Object.keys(next);
  if (ids.length > MAX_DECKS) {
    ids
      .sort((a, b) => Date.parse(next[a].generatedAt || "0") - Date.parse(next[b].generatedAt || "0"))
      .slice(0, ids.length - MAX_DECKS)
      .forEach((id) => delete next[id]);
  }
  decksStore.set(next);
  return true;
}

/** Where you are in the deck (after "Again", "Got it", or a fresh shuffle). */
export function saveDeckProgress(docId: string, queue: number[], recalled: number) {
  const all = decksStore.get();
  const d = all[docId];
  if (!d || !personalOpen()) return;
  decksStore.set({ ...all, [docId]: { ...d, queue: [...queue], recalled } });
}

"use client";
// What Pal remembers on this device:
//   chat  the last 30 Talk messages. Stored where the session is stored: this
//         tab only by default, or this device when "Keep me signed in" is on;
//         signing out clears it. (The server keeps its own copy until
//         "Clear chat".)
//   sit   the running "Sit with me" session and the last notes (localStorage,
//         so a reload never loses the timer).
// Both belong to the signed-in account (owner.ts): written only while it is
// signed in, and cleared when its session ends (localData.ts).
import { useSyncExternalStore } from "react";
import { sessionKept, sessionStore } from "@/lib/api";
import { createStoredValue, useStored } from "@/lib/store";
import { freshId } from "./day";
import { personalOpen } from "./owner";

// ---- chat ---------------------------------------------------------------------------

export const CHAT_KEEP = 30;
export const CHAT_SHOWN = 10;

export interface PalChatItem {
  id: string;
  role: "user" | "pal";
  text: string;
  at: string;
  /** Pal's careful crisis reply (from this browser or the server). */
  crisis?: boolean;
  /** Written in this browser (no server reply). */
  local?: boolean;
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function parseChat(raw: string): PalChatItem[] {
  const list = JSON.parse(raw) as unknown;
  if (!Array.isArray(list)) return [];
  const out: PalChatItem[] = [];
  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    const o = m as Partial<PalChatItem>;
    const t = clean(o.text, 4000);
    if (!t || (o.role !== "user" && o.role !== "pal")) continue;
    out.push({ id: String(o.id || freshId("m")), role: o.role, text: t, at: String(o.at || ""), crisis: Boolean(o.crisis), local: Boolean(o.local) });
  }
  return out.slice(-CHAT_KEEP);
}

const EMPTY_CHAT: PalChatItem[] = [];
const CHAT_KEY = "np.app.palchat.v1";
const tabChat = createStoredValue<PalChatItem[]>({ key: CHAT_KEY, area: "session", fallback: EMPTY_CHAT, parse: parseChat });
const keptChat = createStoredValue<PalChatItem[]>({ key: CHAT_KEY, area: "local", fallback: EMPTY_CHAT, parse: parseChat });

const chatArea = () => (sessionKept() ? keptChat : tabChat);

export const chatStore = {
  subscribe(listener: () => void) {
    const a = tabChat.subscribe(listener);
    const b = keptChat.subscribe(listener);
    const c = sessionStore.subscribe(listener);
    return () => {
      a();
      b();
      c();
    };
  },
  get: () => chatArea().get(),
  getServer: () => EMPTY_CHAT,
};

export function useChat(): PalChatItem[] {
  return useSyncExternalStore(chatStore.subscribe, chatStore.get, chatStore.getServer);
}

/**
 * Add a message. `account` (owner.ts `currentAccount()` when the message was
 * sent): a reply that comes back after that account signed out is dropped.
 */
export function pushChat(item: { role: "user" | "pal"; text: string; crisis?: boolean; local?: boolean }, account?: string | null) {
  const t = clean(item.text, 4000);
  if (!t || !personalOpen(account)) return;
  const area = chatArea();
  const entry: PalChatItem = { id: freshId("m"), role: item.role, text: t, at: new Date().toISOString(), crisis: Boolean(item.crisis), local: Boolean(item.local) };
  area.set([...area.get(), entry].slice(-CHAT_KEEP));
}

/** The session moved (Keep me signed in on/off): the chat moves with it. */
export function moveChat(toKept: boolean) {
  const from = toKept ? tabChat : keptChat;
  const to = toKept ? keptChat : tabChat;
  const list = from.get();
  if (list.length) to.set(list);
  from.clear();
}

/** Forget the chat in this browser (both places). */
export function clearLocalChat() {
  tabChat.clear();
  keptChat.clear();
}

// ---- sit with me ------------------------------------------------------------------------

export const SIT_NOTES_KEEP = 30;
/** An unanswered "Want to note what you did?" goes away quietly after this long. */
const FORGET_ENDED_MS = 30 * 60 * 1000;

export interface PalSit {
  id: string;
  minutes: number;
  label: string;
  taskId: string | null;
  anchorId: string | null;
  startedAt: number;
  endsAt: number;
  /** The halfway check-in: asked, then answered. */
  checkIn: null | "asked" | "yes" | "no";
  endedAt: number | null;
  /** time = the block ran out; done = the person finished or stopped. */
  endReason: null | "time" | "done";
}

export interface PalSitNote {
  id: string;
  minutes: number;
  label: string;
  note: string;
  at: string;
}

interface SitData {
  sit: PalSit | null;
  notes: PalSitNote[];
}

const EMPTY_SIT: SitData = { sit: null, notes: [] };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseSit(raw: string): SitData {
  const o = (JSON.parse(raw) ?? {}) as Partial<SitData>;
  const s = o.sit as Partial<PalSit> | null | undefined;
  const sit: PalSit | null =
    s && finite(s.startedAt) && finite(s.endsAt) && s.endsAt > s.startedAt
      ? {
          id: String(s.id || freshId("s")),
          minutes: finite(s.minutes) ? Math.max(1, Math.round(s.minutes)) : Math.round((s.endsAt - s.startedAt) / 60000),
          label: clean(s.label, 120),
          taskId: s.taskId ? String(s.taskId) : null,
          anchorId: s.anchorId ? String(s.anchorId) : null,
          startedAt: s.startedAt,
          endsAt: s.endsAt,
          checkIn: s.checkIn === "asked" || s.checkIn === "yes" || s.checkIn === "no" ? s.checkIn : null,
          endedAt: finite(s.endedAt) ? s.endedAt : null,
          endReason: s.endReason === "done" ? "done" : finite(s.endedAt) ? "time" : null,
        }
      : null;
  const notes = (Array.isArray(o.notes) ? o.notes : [])
    .filter((n) => n && typeof n === "object" && clean((n as PalSitNote).note, 500))
    .map((n) => {
      const x = n as Partial<PalSitNote>;
      return {
        id: String(x.id || freshId("n")),
        minutes: finite(x.minutes) ? Math.max(0, Math.round(x.minutes)) : 0,
        label: clean(x.label, 120),
        note: clean(x.note, 500),
        at: String(x.at || ""),
      };
    })
    .slice(0, SIT_NOTES_KEEP);
  return { sit, notes };
}

export const sitStore = createStoredValue<SitData>({ key: "np.app.palsit.v1", area: "local", fallback: EMPTY_SIT, parse: parseSit });

export const useSit = () => useStored(sitStore);

export function startSit({ minutes, label = "", taskId = null, anchorId = null }: { minutes: number; label?: string; taskId?: string | null; anchorId?: string | null }) {
  if (!personalOpen()) return;
  const startedAt = Date.now();
  const m = Math.max(1, Math.round(minutes));
  sitStore.set({
    ...sitStore.get(),
    sit: { id: freshId("s"), minutes: m, label: clean(label, 120), taskId, anchorId, startedAt, endsAt: startedAt + m * 60000, checkIn: null, endedAt: null, endReason: null },
  });
}

function patchSit(patch: Partial<PalSit>) {
  const d = sitStore.get();
  if (d.sit && personalOpen()) sitStore.set({ ...d, sit: { ...d.sit, ...patch } });
}

export const answerSitCheck = (v: "yes" | "no") => patchSit({ checkIn: v });

/** "I'm done" / "Stop": the session ends kindly either way. */
export function endSit() {
  const d = sitStore.get();
  if (d.sit && !d.sit.endedAt) patchSit({ endedAt: Date.now(), endReason: "done" });
}

/** Session over without a note. */
export function clearSit() {
  sitStore.set({ ...sitStore.get(), sit: null });
}

export function saveSitNote(note: string) {
  const d = sitStore.get();
  const s = d.sit;
  if (!s || !personalOpen()) return;
  const n = clean(note, 500);
  const end = s.endedAt || s.endsAt;
  const notes = n
    ? [{ id: freshId("n"), minutes: Math.max(1, Math.round((end - s.startedAt) / 60000)), label: s.label, note: n, at: new Date().toISOString() }, ...d.notes].slice(0, SIT_NOTES_KEEP)
    : d.notes;
  sitStore.set({ sit: null, notes });
}

/**
 * One tick of the watcher (the shell runs it every second while a sit
 * exists): the halfway check-in, the natural end, and forgetting an old
 * unanswered end prompt. Returns what happened, for Pal to say.
 */
export function tickSit(now: number): "asked" | "ended" | null {
  const s = sitStore.get().sit;
  if (!s) return null;
  if (s.endedAt) {
    if (now - s.endedAt > FORGET_ENDED_MS) clearSit();
    return null;
  }
  if (now >= s.endsAt) {
    patchSit({ endedAt: s.endsAt, endReason: "time" });
    return "ended";
  }
  const half = s.startedAt + (s.endsAt - s.startedAt) / 2;
  if (!s.checkIn && now >= half && s.endsAt - now > 60000) {
    patchSit({ checkIn: "asked" });
    return "asked";
  }
  return null;
}

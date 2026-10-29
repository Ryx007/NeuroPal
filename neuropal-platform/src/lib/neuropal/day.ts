"use client";
// Today, on this device: the check-ins from Home's slider, the timed anchors,
// the minimum viable day and the brain dump. Same rules as the Expo app's
// homeSlice:
//   - check-ins: newest last, capped at 200; a change within a minute of the
//     last check-in refines it instead of adding one (one check-in = one
//     settled feeling, not every key press); an older check-in joins the
//     history in time order and leaves the current state alone
//   - a new day un-ticks the minimum day and sets every anchor back to upcoming
// Stored in localStorage; nothing here needs the server.
import { useEffect } from "react";
import { createStoredValue, useStored } from "@/lib/store";

export type NervousState = "green" | "yellow" | "red";

export const CHECKIN_CAP = 200;
export const CHECKIN_MERGE_MS = 60 * 1000;
export const DUMP_CAP = 1000;
export const TITLE_MAX = 120;

export interface Checkin {
  state: NervousState;
  /** Exact slider level 0–1 (null when it came from a button without one). */
  level: number | null;
  /** ISO time */
  at: string;
}

export type AnchorCategory = "medication" | "break" | "study" | "move" | "other";

export const ANCHOR_CATEGORIES: { id: AnchorCategory; label: string }[] = [
  { id: "medication", label: "Meds" },
  { id: "break", label: "Break" },
  { id: "study", label: "Study" },
  { id: "move", label: "Move" },
  { id: "other", label: "Other" },
];

/** The ± window (minutes) an anchor can move in: ADHD-friendly, never to the minute. */
export const FLEX_CHOICES = [0, 10, 15, 30, 45, 60];
export const DEFAULT_FLEX = 30;

export interface AnchorTime {
  hour: number;
  minute: number;
}

export interface Anchor {
  id: string;
  title: string;
  subtitle: string;
  time: AnchorTime;
  flexMinutes: number;
  category: AnchorCategory;
  status: "upcoming" | "done";
}

export interface DayTask {
  id: string;
  title: string;
  subtitle: string;
  done: boolean;
}

export interface DumpItem {
  id: string;
  text: string;
  at: string;
}

export interface DayData {
  v: 1;
  /** Local date YYYY-MM-DD the ticks belong to. */
  dayStamp: string;
  /** The current check-in (null = not checked in yet). */
  state: NervousState | null;
  level: number | null;
  checkins: Checkin[];
  tasks: DayTask[];
  anchors: Anchor[];
  dump: DumpItem[];
}

// ---- helpers -------------------------------------------------------------------

const STATES = new Set<NervousState>(["green", "yellow", "red"]);
const CATEGORIES = new Set<AnchorCategory>(ANCHOR_CATEGORIES.map((c) => c.id));
const pad2 = (n: number) => String(n).padStart(2, "0");

export function stampOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const text = (v: unknown, max = TITLE_MAX) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function cleanLevel(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
}

const int = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;

let idCounter = 0;
export function freshId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const minutesOfDay = (t: AnchorTime) => t.hour * 60 + t.minute;

/** "14:05" */
export const hhmm = (t: AnchorTime) => `${pad2(t.hour)}:${pad2(t.minute)}`;

/** "2:05 PM" (Classic's clock, as in the Expo app). */
export function time12(t: AnchorTime): string {
  const h = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${h}:${pad2(t.minute)} ${t.hour >= 12 ? "PM" : "AM"}`;
}

export function minutesUntil(anchor: Anchor, now: Date): number {
  return minutesOfDay(anchor.time) - (now.getHours() * 60 + now.getMinutes());
}

const byTime = (a: Anchor, b: Anchor) => minutesOfDay(a.time) - minutesOfDay(b.time);

// ---- normalising (old or hand-edited saves never throw) ------------------------------

function cleanCheckins(list: unknown): Checkin[] {
  if (!Array.isArray(list)) return [];
  const out: Checkin[] = [];
  for (const c of list) {
    if (!c || typeof c !== "object") continue;
    const o = c as Partial<Checkin>;
    if (!STATES.has(o.state as NervousState) || typeof o.at !== "string" || Number.isNaN(Date.parse(o.at))) continue;
    out.push({ state: o.state as NervousState, level: cleanLevel(o.level), at: o.at });
  }
  return out.slice(-CHECKIN_CAP);
}

function cleanTasks(list: unknown): DayTask[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && typeof t === "object" && text((t as DayTask).title))
    .map((t) => {
      const o = t as Partial<DayTask>;
      return { id: String(o.id || freshId("t")), title: text(o.title), subtitle: text(o.subtitle), done: Boolean(o.done) };
    });
}

function cleanAnchors(list: unknown): Anchor[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && typeof a === "object" && text((a as Anchor).title))
    .map((a) => {
      const o = a as Partial<Anchor> & { time?: Partial<AnchorTime> };
      return {
        id: String(o.id || freshId("a")),
        title: text(o.title),
        subtitle: text(o.subtitle, 200),
        time: { hour: int(o.time?.hour, 0, 23, 9), minute: int(o.time?.minute, 0, 59, 0) },
        flexMinutes: int(o.flexMinutes, 0, 120, DEFAULT_FLEX),
        category: CATEGORIES.has(o.category as AnchorCategory) ? (o.category as AnchorCategory) : "other",
        status: o.status === "done" ? ("done" as const) : ("upcoming" as const),
      };
    })
    .sort(byTime);
}

function cleanDump(list: unknown): DumpItem[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((d) => d && typeof d === "object" && text((d as DumpItem).text, 2000))
    .map((d) => {
      const o = d as Partial<DumpItem>;
      return { id: String(o.id || freshId("d")), text: text(o.text, 2000), at: typeof o.at === "string" ? o.at : new Date(0).toISOString() };
    })
    .slice(0, DUMP_CAP);
}

/** A new day: yesterday's ticks don't count any more. */
function rollover(d: DayData, now: Date): DayData {
  const today = stampOf(now);
  if (d.dayStamp === today) return d;
  return {
    ...d,
    dayStamp: today,
    tasks: d.tasks.map((t) => (t.done ? { ...t, done: false } : t)),
    anchors: d.anchors.map((a) => (a.status === "upcoming" ? a : { ...a, status: "upcoming" as const })),
  };
}

// The Expo app's starter minimum day: small, physical, kind.
const starterTasks = (): DayTask[] => [
  { id: "mvd-1", title: "Stay hydrated", subtitle: "2 glasses left", done: false },
  { id: "mvd-2", title: "Take meds", subtitle: "Morning dosage", done: false },
  { id: "mvd-3", title: "Walk", subtitle: "10 minutes outside", done: false },
];

export function normalizeDay(input: unknown, now = new Date()): DayData {
  const o = (input && typeof input === "object" ? input : {}) as Partial<DayData>;
  const checkins = cleanCheckins(o.checkins);
  const state = STATES.has(o.state as NervousState) ? (o.state as NervousState) : null;
  const d: DayData = {
    v: 1,
    dayStamp: typeof o.dayStamp === "string" ? o.dayStamp : stampOf(now),
    state,
    level: state ? cleanLevel(o.level) : null,
    checkins,
    tasks: Array.isArray(o.tasks) ? cleanTasks(o.tasks) : starterTasks(),
    anchors: cleanAnchors(o.anchors),
    dump: cleanDump(o.dump),
  };
  return rollover(d, now);
}

const EMPTY_DAY: DayData = normalizeDay({});

export const dayStore = createStoredValue<DayData>({
  key: "np.app.day.v1",
  area: "local",
  fallback: EMPTY_DAY,
  parse: (raw) => normalizeDay(JSON.parse(raw)),
});

function update(fn: (d: DayData) => DayData) {
  const now = new Date();
  dayStore.set(fn(rollover(dayStore.get(), now)));
}

/** Applies the day rollover if the date changed while the page was open. */
export function ensureToday(now = new Date()) {
  const d = dayStore.get();
  if (d.dayStamp !== stampOf(now)) dayStore.set(rollover(d, now));
}

/** Today's data; re-checks the date when the tab comes back into view. */
export function useDay(): DayData {
  const day = useStored(dayStore);
  useEffect(() => {
    ensureToday();
    const onVisible = () => {
      if (document.visibilityState === "visible") ensureToday();
    };
    document.addEventListener("visibilitychange", onVisible);
    const t = window.setInterval(() => ensureToday(), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(t);
    };
  }, []);
  return day;
}

// ---- check-ins ---------------------------------------------------------------------

/** One check-in (slider or a state button). `atMs` defaults to now; never in the future. */
export function recordCheckin(mood: NervousState, level: number | null, atMs?: number) {
  if (!STATES.has(mood)) return;
  update((d) => {
    const nowMs = Date.now();
    const t = typeof atMs === "number" && Number.isFinite(atMs) && atMs <= nowMs ? atMs : nowMs;
    const entry: Checkin = { state: mood, level: cleanLevel(level), at: new Date(t).toISOString() };
    const list = d.checkins.slice();
    const last = list[list.length - 1];
    let state = d.state;
    let lv = d.level;
    if (last && t < Date.parse(last.at)) {
      let i = list.length;
      while (i > 0 && Date.parse(list[i - 1].at) > t) i -= 1;
      list.splice(i, 0, entry);
    } else {
      state = mood;
      lv = entry.level;
      if (last && t - Date.parse(last.at) < CHECKIN_MERGE_MS) list[list.length - 1] = entry;
      else list.push(entry);
    }
    return { ...d, state, level: lv, checkins: list.slice(-CHECKIN_CAP) };
  });
}

/** The latest check-in entry, if any. */
export const lastCheckin = (d: DayData): Checkin | null => d.checkins[d.checkins.length - 1] ?? null;

// ---- minimum viable day --------------------------------------------------------------

export function toggleTask(id: string) {
  update((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
}

export function addTask(title: string, subtitle = ""): boolean {
  const t = text(title);
  if (!t) return false;
  update((d) => ({ ...d, tasks: [...d.tasks, { id: freshId("t"), title: t, subtitle: text(subtitle), done: false }] }));
  return true;
}

/** Removes a task; returns it with its position, for Undo. */
export function removeTask(id: string): { task: DayTask; index: number } | null {
  const d = dayStore.get();
  const index = d.tasks.findIndex((t) => t.id === id);
  if (index < 0) return null;
  const task = d.tasks[index];
  update((x) => ({ ...x, tasks: x.tasks.filter((t) => t.id !== id) }));
  return { task, index };
}

export function restoreTask(task: DayTask, index: number) {
  update((d) => {
    if (d.tasks.some((t) => t.id === task.id)) return d;
    const tasks = d.tasks.slice();
    tasks.splice(Math.min(Math.max(0, index), tasks.length), 0, task);
    return { ...d, tasks };
  });
}

export const remainingTasks = (d: DayData) => d.tasks.filter((t) => !t.done).length;

// ---- anchors ---------------------------------------------------------------------------

export interface AnchorInput {
  title: string;
  subtitle?: string;
  hour: number;
  minute: number;
  flexMinutes?: number;
  category?: AnchorCategory;
}

export function addAnchor(input: AnchorInput): string | null {
  const title = text(input.title);
  if (!title) return null;
  const id = freshId("a");
  update((d) => ({
    ...d,
    anchors: cleanAnchors([
      ...d.anchors,
      {
        id,
        title,
        subtitle: input.subtitle ?? "",
        time: { hour: input.hour, minute: input.minute },
        flexMinutes: input.flexMinutes ?? DEFAULT_FLEX,
        category: input.category ?? "other",
        status: "upcoming",
      },
    ]),
  }));
  return id;
}

export function updateAnchor(id: string, input: AnchorInput) {
  const title = text(input.title);
  if (!title) return;
  update((d) => ({
    ...d,
    anchors: cleanAnchors(
      d.anchors.map((a) =>
        a.id === id
          ? {
              ...a,
              title,
              subtitle: input.subtitle ?? a.subtitle,
              time: { hour: input.hour, minute: input.minute },
              flexMinutes: input.flexMinutes ?? a.flexMinutes,
              category: input.category ?? a.category,
            }
          : a,
      ),
    ),
  }));
}

/** Removes an anchor; returns it, for Undo. */
export function removeAnchor(id: string): Anchor | null {
  const found = dayStore.get().anchors.find((a) => a.id === id) ?? null;
  if (found) update((d) => ({ ...d, anchors: d.anchors.filter((a) => a.id !== id) }));
  return found;
}

export function restoreAnchor(anchor: Anchor) {
  update((d) => (d.anchors.some((a) => a.id === anchor.id) ? d : { ...d, anchors: cleanAnchors([...d.anchors, anchor]) }));
}

export function setAnchorStatus(id: string, status: Anchor["status"]) {
  update((d) => ({ ...d, anchors: d.anchors.map((a) => (a.id === id ? { ...a, status } : a)) }));
}

/**
 * Home's "Next anchor" (as in the Expo app): the first not-done anchor still
 * ahead today; else the last not-done one (it is happening now or overdue).
 */
export function nextAnchor(anchors: Anchor[], now: Date): Anchor | null {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const pending = anchors.filter((a) => a.status !== "done");
  return pending.find((a) => minutesOfDay(a.time) >= nowMin) || pending[pending.length - 1] || null;
}

// ---- brain dump --------------------------------------------------------------------------

export function addDump(value: string): boolean {
  const t = text(value, 2000);
  if (!t) return false;
  update((d) => ({ ...d, dump: [{ id: freshId("d"), text: t, at: new Date().toISOString() }, ...d.dump].slice(0, DUMP_CAP) }));
  return true;
}

export function removeDump(id: string): DumpItem | null {
  const found = dayStore.get().dump.find((x) => x.id === id) ?? null;
  if (found) update((d) => ({ ...d, dump: d.dump.filter((x) => x.id !== id) }));
  return found;
}

export function restoreDump(item: DumpItem) {
  update((d) =>
    d.dump.some((x) => x.id === item.id)
      ? d
      : { ...d, dump: [...d.dump, item].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, DUMP_CAP) },
  );
}

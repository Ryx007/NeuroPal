"use client";
// Today: the check-ins from Home's slider, the timed anchors, the minimum
// viable day and the brain dump. Same rules as the Expo app's homeSlice:
//   - check-ins: newest last, capped at 200; a change within a minute of the
//     last check-in refines it instead of adding one (one check-in = one
//     settled feeling, not every key press); an older check-in joins the
//     history in time order and leaves the current state alone
//   - "done today" is doneOn === today's local date, so a new day un-ticks
//     the minimum day and sets every anchor back to upcoming by itself
// Kept in localStorage (the key predates sync; the value says v: 2) and, with
// "Keep my day in sync" on, merged through the server by daySync.ts
// (docs/DAY-SYNC.md). The pure rules live in dayModel.ts; this file is the
// store: it stamps every change and remembers what Undo needs.
// It belongs to the signed-in account (owner.ts): written only while that
// account is signed in, and cleared when its session ends (localData.ts).
import { useEffect } from "react";
import { createStoredValue, useStored } from "@/lib/store";
import * as model from "./dayModel";
import type { Anchor, AnchorCategory, AnchorInput, Clock, DayData, DayTask, DumpItem, NervousState, StoredAnchor, StoredDay, StoredDump, StoredTask } from "./dayModel";
import { personalOpen } from "./owner";

export type { Anchor, AnchorCategory, AnchorInput, AnchorTime, Checkin, DayData, DayTask, DumpItem, NervousState, StoredDay } from "./dayModel";
export { CHECKIN_CAP, CHECKIN_MERGE_MS, DEFAULT_FLEX, DUMP_CAP, TITLE_MAX } from "./dayModel";

export const ANCHOR_CATEGORIES: { id: AnchorCategory; label: string }[] = [
  { id: "medication", label: "Meds" },
  { id: "break", label: "Break" },
  { id: "study", label: "Study" },
  { id: "move", label: "Move" },
  { id: "other", label: "Other" },
];

/** The ± window (minutes) an anchor can move in: ADHD-friendly, never to the minute. */
export const FLEX_CHOICES = [0, 10, 15, 30, 45, 60];

// ---- helpers -------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The local date YYYY-MM-DD. */
export const stampOf = (d: Date): string => model.localDate(d);

let idCounter = 0;
export function freshId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const minutesOfDay = (t: { hour: number; minute: number }) => t.hour * 60 + t.minute;

/** "14:05" */
export const hhmm = (t: { hour: number; minute: number }) => `${pad2(t.hour)}:${pad2(t.minute)}`;

/** "2:05 PM" (Classic's clock, as in the Expo app). */
export function time12(t: { hour: number; minute: number }): string {
  const h = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${h}:${pad2(t.minute)} ${t.hour >= 12 ? "PM" : "AM"}`;
}

export function minutesUntil(anchor: Anchor, now: Date): number {
  return minutesOfDay(anchor.time) - (now.getHours() * 60 + now.getMinutes());
}

// ---- the store -----------------------------------------------------------------

/** Read back from a save that still needs writing (an old save given its stamps). */
const unsaved = new WeakSet<StoredDay>();

export const dayStore = createStoredValue<StoredDay>({
  key: "np.app.day.v1",
  area: "local",
  fallback: model.newDay(model.clockOf(new Date())),
  parse: (raw) => {
    const r = model.readSave(JSON.parse(raw), model.clockOf(new Date()));
    if (r.changed) unsaved.add(r.day);
    return r.day;
  },
});

// Kept subscribed for the life of the page, so this tab always holds what
// other tabs wrote (the store drops its `storage` listener when nothing
// listens). The sync builds requests from this copy and writes answers over
// it: a stale copy would undo another tab's change.
if (typeof window !== "undefined") dayStore.subscribe(() => {});

const views = new WeakMap<StoredDay, DayData>();

/** What the screens read: live items, done/status derived (dayModel.dayView), the same object for the same stored day. */
export function dayView(day: StoredDay = dayStore.get()): DayData {
  let v = views.get(day);
  if (!v) {
    v = model.dayView(day);
    views.set(day, v);
  }
  return v;
}

// A change made in THIS tab (daySync.ts sends it 2–3 s later; other tabs
// see it through storage and leave the sending to this one).
const editListeners = new Set<() => void>();

export function onDayEdit(listener: () => void): () => void {
  editListeners.add(listener);
  return () => {
    editListeners.delete(listener);
  };
}

function edit(fn: (day: StoredDay, clock: Clock) => StoredDay): boolean {
  // A write after the session ended (a slider saving as Home closes) is dropped.
  if (!personalOpen()) return false;
  const clock = model.clockOf(new Date());
  const current = dayStore.get();
  const next = fn(current, clock);
  if (next === current) return false;
  dayStore.set(model.markEdited(next, clock.today, freshId("e")));
  editListeners.forEach((l) => l());
  return true;
}

/**
 * The sync's own writes (an adopted answer, the switch, how the last try
 * went): not edits, so they never trigger a sync in this tab or another.
 * Only while `account` (when given) owns the day.
 */
export function updateDay(fn: (day: StoredDay, clock: Clock) => StoredDay, account?: string): boolean {
  if (!personalOpen(account)) return false;
  const current = dayStore.get();
  const next = fn(current, model.clockOf(new Date()));
  if (next !== current) dayStore.set(next);
  return true;
}

/**
 * The day goes when a session ends (localData.ts), with the sync's own state
 * (gen, deletions not sent yet). "Keep my day in sync" is this browser's
 * choice and stays: switched off, it isn't quietly switched on again by the
 * next sign-in.
 */
export function forgetDay() {
  if (dayStore.get().sync.enabled === false) dayStore.set(model.newDay(model.clockOf(new Date()), false));
  else dayStore.clear();
}

/** Re-derives the ticks when the date changed while the page was open, and saves an old save once it has its stamps. */
export function ensureToday(now = new Date()) {
  if (!personalOpen()) return;
  const d = dayStore.get();
  const today = stampOf(now);
  if (d.dayStamp !== today || unsaved.has(d)) dayStore.set({ ...d, dayStamp: today });
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
  return dayView(day);
}

// Undo needs the whole stored item — fields this app doesn't use included,
// and its content after the deletion has synced (a tombstone has none, §8
// "Undo") — keyed by the object the screen keeps in its Undo state.
const undoItems = new WeakMap<object, StoredTask | StoredAnchor | StoredDump>();

// ---- check-ins ---------------------------------------------------------------------

/** One check-in (slider or a state button). `atMs` defaults to now; never in the future. */
export function recordCheckin(mood: NervousState, level: number | null, atMs?: number) {
  if (!model.STATES.has(mood)) return;
  edit((d, c) => model.recordCheckin(d, mood, level, atMs, c));
}

/** The latest check-in entry, if any. */
export const lastCheckin = (d: DayData) => d.checkins[d.checkins.length - 1] ?? null;

// ---- minimum viable day --------------------------------------------------------------

export function toggleTask(id: string) {
  edit((d, c) => model.toggleTask(d, id, c));
}

export function addTask(title: string, subtitle = ""): boolean {
  if (!model.cleanText(title, model.TITLE_MAX)) return false;
  edit((d, c) => model.addTask(d, freshId("t"), title, subtitle, c));
  return true;
}

/** Removes a task; returns it with its position, for Undo. */
export function removeTask(id: string): { task: DayTask; index: number } | null {
  const view = dayView();
  const index = view.tasks.findIndex((t) => t.id === id);
  if (index < 0) return null;
  const task = view.tasks[index];
  const got: { removed: StoredTask | null } = { removed: null };
  edit((d, c) => {
    const r = model.removeTask(d, id, c);
    got.removed = r.removed;
    return r.day;
  });
  if (got.removed) undoItems.set(task, got.removed);
  return { task, index };
}

/** Undo: the task comes back as it was (an edit, §8). Tasks are ordered by when they were made, so `index` isn't needed any more. */
export function restoreTask(task: DayTask, index?: number) {
  void index;
  const item = (undoItems.get(task) as StoredTask | undefined) ?? storedTask(task);
  edit((d, c) => model.restoreTask(d, item, c));
}

export const remainingTasks = (d: DayData) => d.tasks.filter((t) => !t.done).length;

/** For an Undo whose stored item went missing: the screen's copy without what was derived for it. */
function storedTask(task: DayTask): StoredTask {
  const { done, ...rest } = task;
  void done;
  return rest;
}

// ---- anchors ---------------------------------------------------------------------------

export function addAnchor(input: AnchorInput): string | null {
  if (!model.cleanText(input.title, model.TITLE_MAX)) return null;
  const id = freshId("a");
  edit((d, c) => model.addAnchor(d, id, input, c));
  return id;
}

export function updateAnchor(id: string, input: AnchorInput) {
  edit((d, c) => model.updateAnchor(d, id, input, c));
}

/** Removes an anchor; returns it, for Undo. */
export function removeAnchor(id: string): Anchor | null {
  const found = dayView().anchors.find((a) => a.id === id) ?? null;
  if (!found) return null;
  const got: { removed: StoredAnchor | null } = { removed: null };
  edit((d, c) => {
    const r = model.removeAnchor(d, id, c);
    got.removed = r.removed;
    return r.day;
  });
  if (got.removed) undoItems.set(found, got.removed);
  return found;
}

export function restoreAnchor(anchor: Anchor) {
  const item = (undoItems.get(anchor) as StoredAnchor | undefined) ?? storedAnchor(anchor);
  edit((d, c) => model.restoreAnchor(d, item, c));
}

export function setAnchorStatus(id: string, status: Anchor["status"]) {
  edit((d, c) => model.setAnchorDone(d, id, status === "done", c));
}

function storedAnchor(anchor: Anchor): StoredAnchor {
  const { status, ...rest } = anchor;
  void status;
  return rest;
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
  if (!model.cleanText(value, model.DUMP_TEXT_MAX)) return false;
  edit((d, c) => model.addDump(d, freshId("d"), value, c));
  return true;
}

export function removeDump(id: string): DumpItem | null {
  const found = dayView().dump.find((x) => x.id === id) ?? null;
  if (!found) return null;
  const got: { removed: StoredDump | null } = { removed: null };
  edit((d, c) => {
    const r = model.removeDump(d, id, c);
    got.removed = r.removed;
    return r.day;
  });
  if (got.removed) undoItems.set(found, got.removed);
  return found;
}

/** Undo writes the text again under a new id (a deleted dump line never comes back, §5). */
export function restoreDump(item: DumpItem) {
  const stored = (undoItems.get(item) as StoredDump | undefined) ?? { ...item };
  edit((d, c) => model.restoreDump(d, stored, freshId("d"), c));
}

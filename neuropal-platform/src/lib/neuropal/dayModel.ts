// Day sync, the pure half (docs/DAY-SYNC.md, contract v1): the stored day,
// stamping every change, the old-save migration, "done" derived from doneOn,
// building a sync request, adopting the server's answer, and the line under
// the Settings switch. No React, no storage and no clock of its own (every
// function is handed one), so day.ts (the store), daySync.ts (the loop) and
// scripts/qa/day-model.mjs all run exactly this code.
// No imports: Node loads this file directly in the check script (type
// stripping), so only erasable TypeScript here.
//
// What the screens read doesn't change: dayView() gives lists of LIVE items
// with task.done and anchor.status, every anchor field the screens expect (a
// missing flexMinutes or category shows as the default), and no tombstones.
// The stored items are the wire items: a field this app doesn't use (Expo's
// `icon` and `location`, anything added later) is kept and sent back as it
// came, and an optional field that came without a value stays absent.

export type NervousState = "green" | "yellow" | "red";
export type AnchorCategory = "medication" | "break" | "study" | "move" | "other";

export interface AnchorTime {
  hour: number;
  minute: number;
}

export interface Checkin {
  state: NervousState;
  /** Exact slider level 0–1 (null when it came from a button without one). */
  level: number | null;
  /** ISO time, UTC with milliseconds. A check-in's identity. */
  at: string;
}

/** Fields this app doesn't use ride along untouched (§8 "Fields you don't use"). */
type Extra = { [field: string]: unknown };

export interface StoredTask extends Extra {
  id: string;
  title: string;
  subtitle?: string;
  createdAt: string;
  updatedAt: string;
  /** The local date (YYYY-MM-DD) of the tick: done means doneOn is today. */
  doneOn: string | null;
  tickAt: string | null;
}

export interface StoredAnchor extends Extra {
  id: string;
  title: string;
  subtitle?: string;
  time: AnchorTime;
  flexMinutes?: number;
  category?: AnchorCategory;
  createdAt: string;
  updatedAt: string;
  doneOn: string | null;
  tickAt: string | null;
}

export interface StoredDump extends Extra {
  id: string;
  text: string;
  at: string;
}

/** A deleted anchor or task: no content, like the server's (§5). */
export interface Tombstone {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
}

export interface DumpTombstone {
  id: string;
  deletedAt: string;
}

/** How the last try went. "ended": a 401 for the session held now (signing in again resumes sync); "stopped": the server refused the day (another 4xx). */
export type SyncResult = "ok" | "offline" | "error" | "unsupported" | "ended" | "stopped";

export interface SyncMeta {
  /** "Keep my day in sync" (Settings), on unless switched off. */
  enabled: boolean;
  /**
   * The account (owner.ts accountKey) whose answer this day last took; null
   * until its first sync. A day labelled with another account than this
   * browser's owner is never shown or sent (day.ts reads it as empty).
   */
  account: string | null;
  /** The server's generation from the last answer; 0 = never synced (§7). */
  gen: number;
  /** The server's rev from the last answer (orders two tabs' answers). */
  rev: number;
  /** Changes with every local edit, in any tab. */
  edit: string;
  /** The edit the last adopted answer included. */
  syncedEdit: string;
  /** Deletions, kept until the server has them and as long as it reports them. */
  gone: { anchors: Tombstone[]; tasks: Tombstone[]; dump: DumpTombstone[] };
  /** When this browser last adopted an answer. */
  syncedAt: string | null;
  /** How the last try went, in any tab. */
  last: { at: string; result: SyncResult } | null;
}

export interface StoredDay {
  v: 2;
  /** The local date the derived ticks belong to. */
  dayStamp: string;
  /** The current check-in (null = not checked in yet). */
  state: NervousState | null;
  level: number | null;
  checkins: Checkin[];
  tasks: StoredTask[];
  anchors: StoredAnchor[];
  dump: StoredDump[];
  sync: SyncMeta;
}

// ---- what the screens read ----------------------------------------------------------

export interface DayTask {
  id: string;
  title: string;
  subtitle: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  doneOn: string | null;
  tickAt: string | null;
}

export interface Anchor {
  id: string;
  title: string;
  subtitle: string;
  time: AnchorTime;
  flexMinutes: number;
  category: AnchorCategory;
  status: "upcoming" | "done";
  createdAt: string;
  updatedAt: string;
  doneOn: string | null;
  tickAt: string | null;
}

export interface DumpItem {
  id: string;
  text: string;
  at: string;
}

export interface DayData {
  /** The local date the ticks belong to. */
  dayStamp: string;
  state: NervousState | null;
  level: number | null;
  checkins: Checkin[];
  tasks: DayTask[];
  anchors: Anchor[];
  dump: DumpItem[];
}

/** The moment an action happens: read once, handed to every function here. */
export interface Clock {
  ms: number;
  /** ISO, UTC with milliseconds. */
  now: string;
  /** The device's local date, YYYY-MM-DD. */
  today: string;
}

// ---- limits ---------------------------------------------------------------------------

export const EPOCH = "1970-01-01T00:00:00.000Z";
/**
 * A starter deleted before tombstones existed (§8 "Old saves"): a millisecond
 * after the starter's stamps beats every untouched copy of it but never a
 * real edit, whichever device migrated first.
 */
export const STARTER_GONE = "1970-01-01T00:00:00.001Z";
export const CHECKIN_CAP = 200;
export const CHECKIN_MERGE_MS = 60 * 1000;
export const DUMP_CAP = 1000;
/** Per section, like the server: a browser that keeps fewer than it can delete between two syncs brings the rest back. */
export const TOMBSTONE_CAP = 3000;
export const TITLE_MAX = 120;
export const ANCHOR_SUBTITLE_MAX = 200;
export const TASK_SUBTITLE_MAX = 120;
export const DUMP_TEXT_MAX = 2000;
export const FLEX_MAX = 120;
/** The ± window an anchor shows when it came without one. */
export const DEFAULT_FLEX = 30;

export const STATES: ReadonlySet<string> = new Set(["green", "yellow", "red"]);
export const CATEGORIES: ReadonlySet<string> = new Set(["medication", "break", "study", "move", "other"]);

/** The Expo app's starter minimum day; the same ids and words in every client. */
export const STARTER_TASKS: readonly { id: string; title: string; subtitle: string }[] = [
  { id: "mvd-1", title: "Stay hydrated", subtitle: "2 glasses left" },
  { id: "mvd-2", title: "Take meds", subtitle: "Morning dosage" },
  { id: "mvd-3", title: "Walk", subtitle: "10 minutes outside" },
];

// ---- small helpers ------------------------------------------------------------------------

const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const STAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/;
// Keys never copied out of a save or an answer: assigning them would reach
// the prototype.
const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export const isId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);
export const isDay = (v: unknown): v is string => typeof v === "string" && DAY_RE.test(v);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const pad2 = (n: number) => String(n).padStart(2, "0");

/** The device's local calendar date. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function clockOf(d: Date): Clock {
  return { ms: d.getTime(), now: d.toISOString(), today: localDate(d) };
}

/** A timestamp the way the contract sends it (UTC, milliseconds), or null when it isn't one. */
export function stampOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !STAMP_RE.test(v)) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  const iso = new Date(t).toISOString();
  // Years 0000–9999 only, so stamps compare as strings.
  return iso.length === 24 ? iso : null;
}

/**
 * `now`, but always after every stamp given: an edit, tick or delete made
 * here has to win over the version on screen, even when another device's
 * clock ran ahead and its stamp lies in our future.
 */
export function later(now: string, ...previous: (string | null | undefined)[]): string {
  let t = Date.parse(now);
  for (const p of previous) {
    const v = typeof p === "string" ? Date.parse(p) : NaN;
    if (Number.isFinite(v) && v + 1 > t) t = v + 1;
  }
  return new Date(t).toISOString();
}

function copySafe(raw: Obj): Obj {
  const out: Obj = {};
  for (const key of Object.keys(raw)) if (!UNSAFE.has(key)) out[key] = raw[key];
  return out;
}

/** Sorted-key JSON: the same content gives the same string whatever the key order. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isObj(v)) {
    const keys = Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  }
  return v === undefined ? "null" : JSON.stringify(v);
}

// The definition is every field but the stamps, the tick and the derived
// flags (§5.1). A field with no value counts as missing, and so does an
// empty subtitle (the server's default).
const NOT_DEFINITION = new Set(["id", "createdAt", "updatedAt", "deletedAt", "doneOn", "tickAt", "done", "status"]);

function definitionOf(item: Obj): string {
  const out: Obj = {};
  for (const key of Object.keys(item)) {
    const v = item[key];
    if (NOT_DEFINITION.has(key) || v === undefined || v === null || (key === "subtitle" && v === "")) continue;
    out[key] = v;
  }
  return canonical(out);
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * The server's text rule (§4): trim, inner whitespace to one space, cut to
 * the limit without splitting a surrogate pair, so a cleaned text comes back
 * from the server unchanged.
 */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  let s = String(value).replace(LONE_SURROGATE, "�").replace(/\s+/g, " ").trim();
  if (s.length > max) {
    s = s.slice(0, max);
    const last = s.charCodeAt(s.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) s = s.slice(0, -1);
    s = s.trimEnd();
  }
  return s;
}

/**
 * A longer text as a title of at most `max`: whole words, ending in "…", so it
 * reads as the start of something longer (the brain dump keeps the whole line
 * when one is moved). A text that fits comes back cleaned, uncut.
 */
export function shortTitle(value: unknown, max: number): string {
  const full = cleanText(value, Infinity);
  if (full.length <= max) return full;
  let s = cleanText(full, max - 1);
  // Inside a word: back to the space before it (unless that loses too much).
  const space = s.lastIndexOf(" ");
  if (full[s.length] !== " " && space >= max * 0.6) s = s.slice(0, space);
  return `${s.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

export function cleanLevel(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
}

const int = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;

export const clampFlex = (v: unknown) => int(v, 0, FLEX_MAX, DEFAULT_FLEX);

const minuteOf = (a: { time: AnchorTime }) => a.time.hour * 60 + a.time.minute;

// The server's order (§5), so adopting an answer never reshuffles a list.
const anchorOrder = (a: StoredAnchor, b: StoredAnchor) => minuteOf(a) - minuteOf(b) || cmp(a.id, b.id);
const taskOrder = (a: StoredTask, b: StoredTask) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);
const dumpOrder = (a: StoredDump, b: StoredDump) => cmp(b.at, a.at) || cmp(a.id, b.id);

function uniqueById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/** The newest TOMBSTONE_CAP (the server keeps as many, oldest go first). */
function capGone<T extends { deletedAt: string }>(list: T[]): T[] {
  if (list.length <= TOMBSTONE_CAP) return list;
  return list
    .slice()
    .sort((a, b) => cmp(b.deletedAt, a.deletedAt))
    .slice(0, TOMBSTONE_CAP);
}

function withGone<T extends { id: string; deletedAt: string }>(list: T[], tomb: T): T[] {
  return capGone([...list.filter((t) => t.id !== tomb.id), tomb]);
}

function newestMs(list: Checkin[]): number {
  let best = -Infinity;
  for (const c of list) {
    const t = Date.parse(c.at);
    if (t > best) best = t;
  }
  return best;
}

// ---- a new day, and reading a save -----------------------------------------------------------

export function emptySync(enabled = true): SyncMeta {
  return { enabled, account: null, gen: 0, rev: 0, edit: "", syncedEdit: "", gone: { anchors: [], tasks: [], dump: [] }, syncedAt: null, last: null };
}

/** New installs start with the starters, stamped 1970 so every device's copy merges into one (§8). */
export function starterTasks(): StoredTask[] {
  return STARTER_TASKS.map((s) => ({ ...s, createdAt: EPOCH, updatedAt: EPOCH, doneOn: null, tickAt: null }));
}

export function newDay(clock: Clock, enabled = true): StoredDay {
  return { v: 2, dayStamp: clock.today, state: null, level: null, checkins: [], tasks: starterTasks(), anchors: [], dump: [], sync: emptySync(enabled) };
}

/** Check-ins as the clients keep them: valid ones only, in time order, one per moment, the newest 200. */
export function cleanCheckins(list: unknown): Checkin[] {
  if (!Array.isArray(list)) return [];
  const byAt = new Map<string, Checkin>();
  for (const c of list) {
    if (!isObj(c) || typeof c.state !== "string" || !STATES.has(c.state)) continue;
    const at = stampOrNull(c.at);
    if (!at) continue;
    byAt.set(at, { state: c.state as NervousState, level: cleanLevel(c.level), at });
  }
  return [...byAt.values()].sort((a, b) => cmp(a.at, b.at)).slice(-CHECKIN_CAP);
}

interface ReadCtx {
  clock: Clock;
  /** The old save's ticks belong to today (its dayStamp is today). */
  ticked: boolean;
  /** Items stamped so far by the migration: each next one is a millisecond later. */
  stamped: number;
  /** Ids given so far (to items saved with an id the server would refuse). */
  ids: number;
  /** Something was given stamps or an id: worth saving once. */
  changed: boolean;
}

function freshMigrationId(ctx: ReadCtx): string {
  ctx.changed = true;
  ctx.ids += 1;
  return `m-${ctx.clock.ms.toString(36)}-${ctx.ids}`;
}

/** A tick is doneOn + tickAt together; doneOn without its moment counts as no tick (the server's rule). */
function cleanTick(item: Obj) {
  const tickAt = stampOrNull(item.tickAt);
  item.tickAt = tickAt;
  item.doneOn = tickAt && isDay(item.doneOn) ? item.doneOn : null;
}

const isStarter = (item: Obj) => STARTER_TASKS.some((s) => s.id === item.id && s.title === item.title);

/**
 * One stored task or anchor. Items saved before sync have no stamps; the
 * contract's "Old saves": an untouched starter gets the 1970 stamps, anything
 * else "now", each next item a millisecond later (tasks are ordered by
 * createdAt, so the order on screen holds), and a tick made today keeps
 * counting. Items that already have stamps pass through.
 */
function readItem(kind: "tasks" | "anchors", raw: unknown, ctx: ReadCtx): Obj | null {
  if (!isObj(raw)) return null;
  const item = copySafe(raw);
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  if (!isId(item.id)) item.id = freshMigrationId(ctx);
  if (item.subtitle !== undefined && typeof item.subtitle !== "string") delete item.subtitle;
  if (kind === "anchors") {
    const t = isObj(item.time) ? item.time : {};
    item.time = { hour: int(t.hour, 0, 23, 9), minute: int(t.minute, 0, 59, 0) };
    if (item.flexMinutes !== undefined) {
      if (typeof item.flexMinutes === "number" && Number.isFinite(item.flexMinutes)) item.flexMinutes = clampFlex(item.flexMinutes);
      else delete item.flexMinutes;
    }
    if (item.category !== undefined && !(typeof item.category === "string" && CATEGORIES.has(item.category))) delete item.category;
  }
  const createdAt = stampOrNull(item.createdAt);
  const updatedAt = stampOrNull(item.updatedAt);
  if (!createdAt && !updatedAt) {
    ctx.changed = true;
    if (kind === "tasks" && isStarter(item)) {
      item.createdAt = EPOCH;
      item.updatedAt = EPOCH;
    } else {
      const t = new Date(ctx.clock.ms + ctx.stamped).toISOString();
      ctx.stamped += 1;
      item.createdAt = t;
      item.updatedAt = t;
    }
    const wasDone = kind === "tasks" ? item.done === true : item.status === "done";
    item.doneOn = ctx.ticked && wasDone ? ctx.clock.today : null;
    item.tickAt = item.doneOn ? ctx.clock.now : null;
  } else {
    item.createdAt = createdAt ?? updatedAt;
    item.updatedAt = updatedAt ?? createdAt;
    cleanTick(item);
  }
  // Derived on every read (dayView); a live item has no deletedAt here.
  delete item.done;
  delete item.status;
  delete item.deletedAt;
  return item;
}

function readDumpItem(raw: unknown, ctx: ReadCtx): StoredDump | null {
  if (!isObj(raw)) return null;
  const item = copySafe(raw);
  if (typeof item.text !== "string" || !item.text.trim()) return null;
  if (!isId(item.id)) item.id = freshMigrationId(ctx);
  item.at = stampOrNull(item.at) ?? EPOCH;
  delete item.deletedAt;
  return item as StoredDump;
}

function readTombs(list: unknown): Tombstone[] {
  if (!Array.isArray(list)) return [];
  const byId = new Map<string, Tombstone>();
  for (const t of list) {
    if (!isObj(t) || !isId(t.id)) continue;
    const deletedAt = stampOrNull(t.deletedAt);
    if (!deletedAt) continue;
    byId.set(t.id, { id: t.id, createdAt: stampOrNull(t.createdAt) ?? EPOCH, updatedAt: stampOrNull(t.updatedAt) ?? EPOCH, deletedAt });
  }
  return capGone([...byId.values()]);
}

function readDumpTombs(list: unknown): DumpTombstone[] {
  if (!Array.isArray(list)) return [];
  const byId = new Map<string, DumpTombstone>();
  for (const t of list) {
    if (!isObj(t) || !isId(t.id)) continue;
    const deletedAt = stampOrNull(t.deletedAt);
    if (deletedAt) byId.set(t.id, { id: t.id, deletedAt });
  }
  return capGone([...byId.values()]);
}

const RESULTS = new Set(["ok", "offline", "error", "unsupported", "ended", "stopped"]);

function readSync(raw: unknown): SyncMeta {
  const s = isObj(raw) ? raw : {};
  const g = isObj(s.gone) ? s.gone : {};
  const last = isObj(s.last) && stampOrNull(s.last.at) && typeof s.last.result === "string" && RESULTS.has(s.last.result)
    ? { at: stampOrNull(s.last.at) as string, result: s.last.result as SyncResult }
    : null;
  return {
    enabled: s.enabled !== false,
    account: typeof s.account === "string" && s.account ? s.account : null,
    gen: Number.isSafeInteger(s.gen) && (s.gen as number) > 0 ? (s.gen as number) : 0,
    rev: Number.isSafeInteger(s.rev) && (s.rev as number) >= 0 ? (s.rev as number) : 0,
    edit: typeof s.edit === "string" ? s.edit : "",
    syncedEdit: typeof s.syncedEdit === "string" ? s.syncedEdit : "",
    gone: { anchors: readTombs(g.anchors), tasks: readTombs(g.tasks), dump: readDumpTombs(g.dump) },
    syncedAt: stampOrNull(s.syncedAt),
    last,
  };
}

export interface SaveRead {
  day: StoredDay;
  /** The save needed stamps, ids or a newer shape: write it back once. */
  changed: boolean;
}

/**
 * Whatever is stored (this version, a save from before sync, a hand-edited
 * one) as today's day. Never throws; anything unusable is dropped.
 */
export function readSave(input: unknown, clock: Clock): SaveRead {
  const o = isObj(input) ? input : {};
  const old = o.v !== 2;
  const ctx: ReadCtx = { clock, ticked: old && o.dayStamp === clock.today, stamped: 0, ids: 0, changed: old };
  const tasks = Array.isArray(o.tasks)
    ? uniqueById(o.tasks.map((t) => readItem("tasks", t, ctx)).filter((t): t is Obj => t !== null) as StoredTask[]).sort(taskOrder)
    : starterTasks();
  const anchors = Array.isArray(o.anchors)
    ? uniqueById(o.anchors.map((a) => readItem("anchors", a, ctx)).filter((a): a is Obj => a !== null) as StoredAnchor[]).sort(anchorOrder)
    : [];
  const dump = Array.isArray(o.dump)
    ? uniqueById(o.dump.map((d) => readDumpItem(d, ctx)).filter((d): d is StoredDump => d !== null))
        .sort(dumpOrder)
        .slice(0, DUMP_CAP)
    : [];
  const sync = old ? emptySync(true) : readSync(o.sync);
  // An id is live or gone, never both.
  const live = (list: { id: string }[]) => new Set(list.map((x) => x.id));
  const liveTasks = live(tasks);
  const liveAnchors = live(anchors);
  const liveDump = live(dump);
  sync.gone = {
    tasks: sync.gone.tasks.filter((t) => !liveTasks.has(t.id)),
    anchors: sync.gone.anchors.filter((t) => !liveAnchors.has(t.id)),
    dump: sync.gone.dump.filter((t) => !liveDump.has(t.id)),
  };
  // A starter missing from a save made before sync was deleted by the
  // person. Saying so keeps another device's 1970 starter from bringing it
  // back (the deletion predates tombstones).
  if (old && Array.isArray(o.tasks)) {
    for (const s of STARTER_TASKS) {
      if (!liveTasks.has(s.id)) sync.gone.tasks.push({ id: s.id, createdAt: EPOCH, updatedAt: EPOCH, deletedAt: STARTER_GONE });
    }
  }
  const state = typeof o.state === "string" && STATES.has(o.state) ? (o.state as NervousState) : null;
  const day: StoredDay = {
    v: 2,
    dayStamp: clock.today,
    state,
    level: state ? cleanLevel(o.level) : null,
    checkins: cleanCheckins(o.checkins),
    tasks,
    anchors,
    dump,
    sync,
  };
  return { day, changed: ctx.changed };
}

// ---- the view (done and status derived from doneOn) ------------------------------------------

export function taskView(t: StoredTask, today: string): DayTask {
  return { ...t, subtitle: typeof t.subtitle === "string" ? t.subtitle : "", done: t.doneOn === today };
}

export function anchorView(a: StoredAnchor, today: string): Anchor {
  return {
    ...a,
    subtitle: typeof a.subtitle === "string" ? a.subtitle : "",
    flexMinutes: typeof a.flexMinutes === "number" ? a.flexMinutes : DEFAULT_FLEX,
    category: typeof a.category === "string" && CATEGORIES.has(a.category) ? a.category : "other",
    status: a.doneOn === today ? "done" : "upcoming",
  };
}

/**
 * What the screens read. The one place "done" is decided: doneOn equals the
 * day's local date (set on every read, adopt and edit, and when the date
 * changes while the page is open). There is no rollover job.
 */
export function dayView(day: StoredDay): DayData {
  const today = day.dayStamp;
  return {
    dayStamp: today,
    state: day.state,
    level: day.level,
    checkins: day.checkins,
    tasks: day.tasks.map((t) => taskView(t, today)),
    anchors: day.anchors.map((a) => anchorView(a, today)),
    dump: day.dump,
  };
}

// ---- edits: every one stamps what it changes (§8 "Local model") ----------------------------

/** After an edit: the date it belongs to, and a new edit mark (the loop's "changed while in flight"). */
export function markEdited(day: StoredDay, today: string, mark: string): StoredDay {
  return { ...day, dayStamp: today, sync: { ...day.sync, edit: mark } };
}

function replaceAt<T>(list: T[], i: number, item: T): T[] {
  const out = list.slice();
  out[i] = item;
  return out;
}

/** One check-in (slider or a state button). `atMs` defaults to now and is never in the future. */
export function recordCheckin(day: StoredDay, mood: NervousState, level: number | null, atMs: number | undefined, clock: Clock): StoredDay {
  if (!STATES.has(mood)) return day;
  const t = typeof atMs === "number" && Number.isFinite(atMs) && atMs <= clock.ms ? atMs : clock.ms;
  const entry: Checkin = { state: mood, level: cleanLevel(level), at: new Date(t).toISOString() };
  const list = day.checkins.slice();
  const last = list[list.length - 1];
  let state = day.state;
  let lv = day.level;
  if (last && t < Date.parse(last.at)) {
    // An older check-in joins the history in time order and leaves the current state alone.
    let i = list.length;
    while (i > 0 && Date.parse(list[i - 1].at) > t) i -= 1;
    if (list[i - 1]?.at === entry.at) list[i - 1] = entry;
    else list.splice(i, 0, entry);
  } else {
    state = mood;
    lv = entry.level;
    // Within a minute of the last one it refines it (one settled feeling, not every key press).
    if (last && t - Date.parse(last.at) < CHECKIN_MERGE_MS) list[list.length - 1] = entry;
    else list.push(entry);
  }
  return { ...day, state, level: lv, checkins: list.slice(-CHECKIN_CAP) };
}

export function toggleTask(day: StoredDay, id: string, clock: Clock): StoredDay {
  const i = day.tasks.findIndex((t) => t.id === id);
  if (i < 0) return day;
  const t = day.tasks[i];
  const done = t.doneOn === clock.today;
  // Un-ticking is a tick with doneOn null (§5.2).
  return { ...day, tasks: replaceAt(day.tasks, i, { ...t, doneOn: done ? null : clock.today, tickAt: later(clock.now, t.tickAt) }) };
}

export function addTask(day: StoredDay, id: string, title: string, subtitle: string, clock: Clock): StoredDay {
  const t = cleanText(title, TITLE_MAX);
  if (!t || !isId(id) || day.tasks.some((x) => x.id === id)) return day;
  // Never before the list's last createdAt, so it lands at the bottom.
  const createdAt = later(clock.now, ...day.tasks.map((x) => x.createdAt));
  const task: StoredTask = { id, title: t, subtitle: cleanText(subtitle, TASK_SUBTITLE_MAX), createdAt, updatedAt: createdAt, doneOn: null, tickAt: null };
  return { ...day, tasks: [...day.tasks, task].sort(taskOrder) };
}

/** Deleting = a tombstone (no content) and the item hidden; deletedAt is never before updatedAt, or it wouldn't hold (§5.3). */
export function removeTask(day: StoredDay, id: string, clock: Clock): { day: StoredDay; removed: StoredTask | null } {
  const t = day.tasks.find((x) => x.id === id);
  if (!t) return { day, removed: null };
  const tomb: Tombstone = { id, createdAt: t.createdAt, updatedAt: t.updatedAt, deletedAt: later(clock.now, t.updatedAt) };
  const gone = { ...day.sync.gone, tasks: withGone(day.sync.gone.tasks, tomb) };
  return { day: { ...day, tasks: day.tasks.filter((x) => x.id !== id), sync: { ...day.sync, gone } }, removed: t };
}

/** Undo is an edit (§8): the whole item again, updatedAt now. The tick it had comes back with it. */
export function restoreTask(day: StoredDay, item: StoredTask, clock: Clock): StoredDay {
  if (!item || !isId(item.id) || day.tasks.some((t) => t.id === item.id)) return day;
  const tomb = day.sync.gone.tasks.find((t) => t.id === item.id);
  const restored: StoredTask = { ...item, updatedAt: later(clock.now, item.updatedAt, tomb?.updatedAt, tomb?.deletedAt) };
  delete restored.deletedAt;
  delete restored.done;
  const gone = { ...day.sync.gone, tasks: day.sync.gone.tasks.filter((t) => t.id !== item.id) };
  return { ...day, tasks: [...day.tasks, restored].sort(taskOrder), sync: { ...day.sync, gone } };
}

export interface AnchorInput {
  title: string;
  subtitle?: string;
  hour: number;
  minute: number;
  flexMinutes?: number;
  category?: AnchorCategory;
}

const timeOf = (input: AnchorInput): AnchorTime => ({ hour: int(input.hour, 0, 23, 9), minute: int(input.minute, 0, 59, 0) });
const categoryOf = (c: unknown): AnchorCategory | null => (typeof c === "string" && CATEGORIES.has(c) ? (c as AnchorCategory) : null);

export function addAnchor(day: StoredDay, id: string, input: AnchorInput, clock: Clock): StoredDay {
  const title = cleanText(input.title, TITLE_MAX);
  if (!title || !isId(id) || day.anchors.some((a) => a.id === id)) return day;
  const anchor: StoredAnchor = {
    id,
    title,
    subtitle: cleanText(input.subtitle ?? "", ANCHOR_SUBTITLE_MAX),
    time: timeOf(input),
    flexMinutes: clampFlex(input.flexMinutes ?? DEFAULT_FLEX),
    category: categoryOf(input.category) ?? "other",
    createdAt: clock.now,
    updatedAt: clock.now,
    doneOn: null,
    tickAt: null,
  };
  return { ...day, anchors: [...day.anchors, anchor].sort(anchorOrder) };
}

/**
 * An edit keeps every other field of the anchor ({...anchor, title}), so a
 * field another app uses survives it. The editor shows the defaults for a
 * window or kind the anchor came without; saving them unchanged keeps them
 * absent. Saving with nothing changed changes nothing (no new updatedAt to
 * win over a real edit made elsewhere).
 */
export function updateAnchor(day: StoredDay, id: string, input: AnchorInput, clock: Clock): StoredDay {
  const title = cleanText(input.title, TITLE_MAX);
  if (!title) return day;
  const i = day.anchors.findIndex((a) => a.id === id);
  if (i < 0) {
    // Deleted (here or on another device) while it was being edited: the
    // later edit brings it back, as Undo would (§5.3). A tombstone keeps no
    // content, so the editor's fields are the whole anchor.
    const tomb = day.sync.gone.anchors.find((t) => t.id === id);
    if (!tomb) return day;
    const back: StoredAnchor = {
      id,
      title,
      subtitle: cleanText(input.subtitle ?? "", ANCHOR_SUBTITLE_MAX),
      time: timeOf(input),
      flexMinutes: clampFlex(input.flexMinutes ?? DEFAULT_FLEX),
      category: categoryOf(input.category) ?? "other",
      createdAt: tomb.createdAt,
      updatedAt: later(clock.now, tomb.updatedAt, tomb.deletedAt),
      doneOn: null,
      tickAt: null,
    };
    const gone = { ...day.sync.gone, anchors: day.sync.gone.anchors.filter((t) => t.id !== id) };
    return { ...day, anchors: [...day.anchors, back].sort(anchorOrder), sync: { ...day.sync, gone } };
  }
  const a = day.anchors[i];
  const next: StoredAnchor = { ...a, title, time: timeOf(input) };
  if (input.subtitle !== undefined) {
    const sub = cleanText(input.subtitle, ANCHOR_SUBTITLE_MAX);
    if (sub || a.subtitle !== undefined) next.subtitle = sub;
  }
  if (input.flexMinutes !== undefined) {
    const f = clampFlex(input.flexMinutes);
    if (!(a.flexMinutes === undefined && f === DEFAULT_FLEX)) next.flexMinutes = f;
  }
  const cat = categoryOf(input.category);
  if (cat && !(a.category === undefined && cat === "other")) next.category = cat;
  if (definitionOf(next) === definitionOf(a)) return day;
  next.updatedAt = later(clock.now, a.updatedAt);
  return { ...day, anchors: replaceAt(day.anchors, i, next).sort(anchorOrder) };
}

export function setAnchorDone(day: StoredDay, id: string, done: boolean, clock: Clock): StoredDay {
  const i = day.anchors.findIndex((a) => a.id === id);
  if (i < 0) return day;
  const a = day.anchors[i];
  if ((a.doneOn === clock.today) === done) return day;
  return { ...day, anchors: replaceAt(day.anchors, i, { ...a, doneOn: done ? clock.today : null, tickAt: later(clock.now, a.tickAt) }) };
}

export function removeAnchor(day: StoredDay, id: string, clock: Clock): { day: StoredDay; removed: StoredAnchor | null } {
  const a = day.anchors.find((x) => x.id === id);
  if (!a) return { day, removed: null };
  const tomb: Tombstone = { id, createdAt: a.createdAt, updatedAt: a.updatedAt, deletedAt: later(clock.now, a.updatedAt) };
  const gone = { ...day.sync.gone, anchors: withGone(day.sync.gone.anchors, tomb) };
  return { day: { ...day, anchors: day.anchors.filter((x) => x.id !== id), sync: { ...day.sync, gone } }, removed: a };
}

export function restoreAnchor(day: StoredDay, item: StoredAnchor, clock: Clock): StoredDay {
  if (!item || !isId(item.id) || day.anchors.some((a) => a.id === item.id)) return day;
  const tomb = day.sync.gone.anchors.find((t) => t.id === item.id);
  const restored: StoredAnchor = { ...item, updatedAt: later(clock.now, item.updatedAt, tomb?.updatedAt, tomb?.deletedAt) };
  delete restored.deletedAt;
  delete restored.status;
  const gone = { ...day.sync.gone, anchors: day.sync.gone.anchors.filter((t) => t.id !== item.id) };
  return { ...day, anchors: [...day.anchors, restored].sort(anchorOrder), sync: { ...day.sync, gone } };
}

export function addDump(day: StoredDay, id: string, text: string, clock: Clock): StoredDay {
  const t = cleanText(text, DUMP_TEXT_MAX);
  if (!t || !isId(id) || day.dump.some((d) => d.id === id)) return day;
  return { ...day, dump: [{ id, text: t, at: clock.now }, ...day.dump].sort(dumpOrder).slice(0, DUMP_CAP) };
}

/** The text is gone at once; the tombstone {id, deletedAt} carries the deletion (a dump deletion is final). */
export function removeDump(day: StoredDay, id: string, clock: Clock): { day: StoredDay; removed: StoredDump | null } {
  const d = day.dump.find((x) => x.id === id);
  if (!d) return { day, removed: null };
  const gone = { ...day.sync.gone, dump: withGone(day.sync.gone.dump, { id, deletedAt: clock.now }) };
  return { day: { ...day, dump: day.dump.filter((x) => x.id !== id), sync: { ...day.sync, gone } }, removed: d };
}

/**
 * Brain dump → minimum day. A line that fits a task title (120 characters)
 * moves. A longer one stays in the dump, so its end is never lost (§8 "Text
 * limits"), and the task gets a shortened copy (shortTitle). null: nothing to
 * move.
 */
export function moveDumpToTask(day: StoredDay, dumpId: string, taskId: string, clock: Clock): { day: StoredDay; title: string; kept: boolean } | null {
  const d = day.dump.find((x) => x.id === dumpId);
  if (!d) return null;
  const title = shortTitle(d.text, TITLE_MAX);
  const withTask = addTask(day, taskId, title, "", clock);
  if (withTask === day) return null;
  const kept = title !== cleanText(d.text, DUMP_TEXT_MAX);
  return { day: kept ? withTask : removeDump(withTask, dumpId, clock).day, title, kept };
}

/** Undo for the dump writes the text again under a new id (§5); it keeps its time, so it returns to its place. */
export function restoreDump(day: StoredDay, item: StoredDump, newId: string, clock: Clock): StoredDay {
  const text = cleanText(item?.text, DUMP_TEXT_MAX);
  if (!text || !isId(newId) || day.dump.some((d) => d.id === newId)) return day;
  const back: StoredDump = { ...item, id: newId, text, at: stampOrNull(item.at) ?? clock.now };
  delete back.deletedAt;
  return { ...day, dump: [...day.dump, back].sort(dumpOrder).slice(0, DUMP_CAP) };
}

// ---- the switch and the loop's bookkeeping --------------------------------------------------

export function setSyncEnabled(day: StoredDay, on: boolean): StoredDay {
  if (day.sync.enabled === on) return day;
  // On again counts as a first sync: forget gen and send none (§8), so a day
  // erased elsewhere meanwhile is added back instead of lost.
  const sync: SyncMeta = on ? { ...day.sync, enabled: true, gen: 0, rev: 0, syncedAt: null, last: null } : { ...day.sync, enabled: false };
  return { ...day, sync };
}

/** Something here hasn't reached the server yet (or this day never synced). */
export function hasUnsynced(day: StoredDay): boolean {
  return day.sync.syncedAt === null || day.sync.edit !== day.sync.syncedEdit;
}

export function noteResult(day: StoredDay, result: SyncResult, clock: Clock): StoredDay {
  if (day.sync.last?.result === result && result !== "ok") return day;
  return { ...day, sync: { ...day.sync, last: { at: clock.now, result } } };
}

// ---- the request (§8 "Sending") ---------------------------------------------------------------

export interface DayRequest {
  v: 1;
  gen?: number;
  anchors: Obj[];
  tasks: Obj[];
  dump: Obj[];
  checkins: Checkin[];
}

const STAMP_FIELDS = new Set(["createdAt", "updatedAt", "at"]);
const LOCAL_ONLY = new Set(["done", "status", "deletedAt", "doneOn", "tickAt"]);

/** The whole item, fields this app doesn't use included; an optional field without a value is left out (never null). */
function itemOut(item: Obj, ticked: boolean): Obj {
  const out: Obj = {};
  for (const key of Object.keys(item)) {
    if (UNSAFE.has(key) || LOCAL_ONLY.has(key)) continue;
    const v = item[key];
    if (v === undefined || v === null) continue;
    out[key] = STAMP_FIELDS.has(key) ? (stampOrNull(v) ?? v) : v;
  }
  out.deletedAt = null;
  if (ticked) {
    const tickAt = stampOrNull(item.tickAt);
    out.doneOn = tickAt && isDay(item.doneOn) ? item.doneOn : null;
    out.tickAt = tickAt;
  }
  return out;
}

/**
 * Everything this app has of the sections it knows — anchors, the minimum
 * day, the brain dump (never `todos`: the web app has no to-do list) —
 * tombstones included, the check-ins, and the stored gen (none before the
 * first sync, §7).
 */
export function buildRequest(day: StoredDay): DayRequest {
  return {
    v: 1,
    ...(day.sync.gen > 0 ? { gen: day.sync.gen } : {}),
    anchors: [...day.anchors.map((a) => itemOut(a, true)), ...day.sync.gone.anchors.map((t) => ({ ...t }))],
    tasks: [...day.tasks.map((t) => itemOut(t, true)), ...day.sync.gone.tasks.map((t) => ({ ...t }))],
    dump: [...day.dump.map((d) => itemOut(d, false)), ...day.sync.gone.dump.map((t) => ({ id: t.id, deletedAt: t.deletedAt }))],
    checkins: day.checkins.map((c) => ({ at: stampOrNull(c.at) ?? c.at, state: c.state, level: cleanLevel(c.level) })),
  };
}

// ---- adopting an answer (§8 "Receiving") ------------------------------------------------------

export function isDayAnswer(body: unknown): body is Obj {
  return isObj(body) && body.v === 1;
}

type ServerEntry<T> = { id: string; item: T; tomb?: undefined } | { id: string; item?: undefined; tomb: Tombstone };

/** One anchor or task of an answer, checked just enough that no screen can trip on it; everything else kept as it came. */
function serverItem(kind: "tasks" | "anchors", raw: unknown): ServerEntry<Obj> | null {
  if (!isObj(raw) || !isId(raw.id)) return null;
  const id = raw.id;
  if (raw.deletedAt !== null && raw.deletedAt !== undefined) {
    const deletedAt = stampOrNull(raw.deletedAt);
    if (!deletedAt) return null;
    return { id, tomb: { id, createdAt: stampOrNull(raw.createdAt) ?? EPOCH, updatedAt: stampOrNull(raw.updatedAt) ?? EPOCH, deletedAt } };
  }
  const item = copySafe(raw);
  delete item.deletedAt;
  delete item.done;
  delete item.status;
  const createdAt = stampOrNull(item.createdAt);
  const updatedAt = stampOrNull(item.updatedAt);
  if (typeof item.title !== "string" || !item.title.trim() || !createdAt || !updatedAt) return null;
  item.createdAt = createdAt;
  item.updatedAt = updatedAt;
  if (kind === "anchors") {
    const t = isObj(item.time) ? item.time : null;
    const ok = (v: unknown, hi: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= hi;
    if (!t || !ok(t.hour, 23) || !ok(t.minute, 59)) return null;
    item.time = { hour: t.hour, minute: t.minute };
  }
  if (item.subtitle !== undefined && typeof item.subtitle !== "string") delete item.subtitle;
  cleanTick(item);
  return { id, item };
}

function serverDumpItem(raw: unknown): { id: string; item?: StoredDump; tomb?: DumpTombstone } | null {
  if (!isObj(raw) || !isId(raw.id)) return null;
  const id = raw.id;
  if (raw.deletedAt !== null && raw.deletedAt !== undefined) {
    const deletedAt = stampOrNull(raw.deletedAt);
    return deletedAt ? { id, tomb: { id, deletedAt } } : null;
  }
  const item = copySafe(raw);
  delete item.deletedAt;
  const at = stampOrNull(item.at);
  if (typeof item.text !== "string" || !item.text.trim() || !at) return null;
  item.at = at;
  return { id, item: item as StoredDump };
}

/**
 * One section of the answer replaces ours, with the one exception that
 * protects this device's data: a local item the answer doesn't mention at
 * all (neither live nor as a tombstone) stays and is sent again next time.
 * After an erase there is no exception. An answer without the section
 * changes nothing.
 */
function adoptSection<T extends { id: string }, G extends { id: string; deletedAt: string }>(
  localLive: T[],
  localGone: G[],
  serverList: unknown,
  read: (raw: unknown) => { id: string; item?: T; tomb?: G } | null,
  erased: boolean,
): { live: T[]; gone: G[] } {
  if (!Array.isArray(serverList)) return { live: localLive, gone: localGone };
  const live: T[] = [];
  const gone: G[] = [];
  const seen = new Set<string>();
  for (const raw of serverList) {
    const r = read(raw);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    if (r.tomb) gone.push(r.tomb);
    else if (r.item) live.push(r.item);
  }
  if (!erased) {
    for (const it of localLive) if (!seen.has(it.id)) live.push(it);
    for (const t of localGone) if (!seen.has(t.id)) gone.push(t);
  }
  return { live, gone: capGone(gone) };
}

export interface Adopted {
  day: StoredDay;
  /** Home's state and level moved to a newer check-in from another device. */
  follow: boolean;
}

/**
 * The answer as the new local day. Check-ins are always replaced (no
 * exception); when the answer's newest check-in is newer than every one this
 * browser had, Home's state and level follow it. `sentEdit` is the edit mark
 * the request was built from (the caller made sure nothing changed since).
 * `account`, when given, labels the day as that account's (SyncMeta.account).
 * null: not a day answer.
 */
export function adoptAnswer(day: StoredDay, body: unknown, clock: Clock, sentEdit: string, account?: string): Adopted | null {
  if (!isDayAnswer(body)) return null;
  const erased = body.erased === true;
  const anchors = adoptSection<StoredAnchor, Tombstone>(day.anchors, day.sync.gone.anchors, body.anchors, (r) => serverItem("anchors", r) as ServerEntry<StoredAnchor> | null, erased);
  const tasks = adoptSection<StoredTask, Tombstone>(day.tasks, day.sync.gone.tasks, body.tasks, (r) => serverItem("tasks", r) as ServerEntry<StoredTask> | null, erased);
  const dump = adoptSection<StoredDump, DumpTombstone>(day.dump, day.sync.gone.dump, body.dump, serverDumpItem, erased);

  let checkins = day.checkins;
  let state = day.state;
  let level = day.level;
  let follow = false;
  if (Array.isArray(body.checkins) || erased) {
    checkins = cleanCheckins(body.checkins);
    const newest = checkins[checkins.length - 1];
    follow = Boolean(newest) && Date.parse(newest.at) > newestMs(day.checkins);
    if (follow) {
      state = newest.state;
      level = newest.level;
    } else if (erased) {
      // The day was erased everywhere: the current check-in goes with it.
      state = null;
      level = null;
    }
  }
  const gen = Number.isSafeInteger(body.gen) && (body.gen as number) > 0 ? (body.gen as number) : day.sync.gen;
  const rev = Number.isSafeInteger(body.rev) && (body.rev as number) >= 0 ? (body.rev as number) : day.sync.rev;
  return {
    day: {
      ...day,
      dayStamp: clock.today,
      state,
      level,
      checkins,
      anchors: anchors.live.slice().sort(anchorOrder),
      tasks: tasks.live.slice().sort(taskOrder),
      dump: dump.live.slice().sort(dumpOrder).slice(0, DUMP_CAP),
      sync: {
        ...day.sync,
        account: account ?? day.sync.account,
        gen,
        rev,
        syncedEdit: sentEdit,
        gone: { anchors: anchors.gone, tasks: tasks.gone, dump: dump.gone },
        syncedAt: clock.now,
        last: { at: clock.now, result: "ok" },
      },
    },
    follow,
  };
}

/**
 * An answer older than one another tab already adopted (both built from the
 * same local day) adds nothing: the server's state only grows between them.
 */
export function isOlderAnswer(body: unknown, day: StoredDay): boolean {
  if (!isDayAnswer(body)) return false;
  const gen = Number.isSafeInteger(body.gen) ? (body.gen as number) : 0;
  const rev = Number.isSafeInteger(body.rev) ? (body.rev as number) : 0;
  return gen < day.sync.gen || (gen === day.sync.gen && rev < day.sync.rev);
}

// ---- the line under the Settings switch -------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clockText(d: Date, clock24: boolean): string {
  if (clock24) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${h}:${pad2(d.getMinutes())} ${d.getHours() >= 12 ? "PM" : "AM"}`;
}

export interface SyncStatusInput {
  enabled: boolean;
  /** A sync is on the wire in this tab. */
  syncing: boolean;
  last: SyncMeta["last"];
  syncedAt: string | null;
  now: Date;
  /** Signal's 24-hour clock; Classic says "2:05 PM". */
  clock24: boolean;
}

export type SyncTone = "off" | "ok" | "busy" | "problem" | "none";

/** The one place a sync problem is ever shown (§8 "Failures"). */
export function syncStatus(s: SyncStatusInput): { text: string; tone: SyncTone } {
  if (!s.enabled) return { text: "Off. Your day stays in this browser.", tone: "off" };
  const result = s.last?.result;
  if (s.syncing && !s.syncedAt && !result) return { text: "Syncing…", tone: "busy" };
  if (result === "unsupported") return { text: "This server doesn’t keep the day yet, so your day stays in this browser.", tone: "problem" };
  // Never "Synced at …" after these two: say what brings sync back.
  if (result === "ended") return { text: "Your session has ended. Sign in again and your day syncs again.", tone: "problem" };
  if (result === "stopped")
    return { text: "Sync stopped: your server refused the day. It tries again the next time you open the app. Your day is saved in this browser.", tone: "problem" };
  if (result === "offline")
    return { text: "Can’t reach your server right now. Your day is saved in this browser and syncs when the server answers again.", tone: "problem" };
  if (result === "error") return { text: "The server didn’t take the sync this time. Your day is saved in this browser and syncs again soon.", tone: "problem" };
  if (s.syncedAt) {
    const at = new Date(s.syncedAt);
    const time = clockText(at, s.clock24);
    const text = localDate(at) === localDate(s.now) ? `Synced at ${time}.` : `Synced on ${at.getDate()} ${MONTHS[at.getMonth()]} at ${time}.`;
    return { text, tone: "ok" };
  }
  if (s.syncing) return { text: "Syncing…", tone: "busy" };
  return { text: "Not synced yet.", tone: "none" };
}

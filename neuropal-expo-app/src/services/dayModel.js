// Day sync, the pure half (docs/DAY-SYNC.md, contract v1): stamps, the
// old-save migration, "done" derived from doneOn, the request body and
// adopting the server's answer. No React Native imports, and every import
// carries its extension: the slices, the sync loop (daySync.js) and
// `node --test scripts/day-model.test.mjs` all run exactly this code.
//
// What the screens read does not change: state.home.tasks / .anchors /
// .todos and state.pal.dump stay lists of LIVE items with task.done and
// anchor.status. The stamps ride on the items; tombstones live apart
// (state.home.sync.gone, state.pal.dumpGone), so no screen ever sees one.

import { createMockTasks, mockAnchors } from "../data/mockData.js";

export const EPOCH = "1970-01-01T00:00:00.000Z";
export const SECTIONS = ["anchors", "tasks", "todos"];
export const CHECKIN_CAP = 200;
export const CHECKIN_MERGE_MS = 60 * 1000;
export const TOMBSTONE_CAP = 500; // per section, like the server
export const DUMP_CAP = 1000;
export const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHECKIN_STATES = new Set(["green", "yellow", "red"]);
// Keys that must never be copied out of an answer into app state.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const pad2 = (n) => String(n).padStart(2, "0");
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const ms = (iso) => (typeof iso === "string" ? Date.parse(iso) : NaN);
const cmp = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

export const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
export const isDay = (v) => typeof v === "string" && DATE_RE.test(v);

// The device's local calendar date. An item is "done today" when its doneOn
// equals this; there is no rollover job.
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// The clock, read once per action (in `prepare`), so reducers stay pure and
// the tests can hand in any moment.
export function stamps() {
  const d = new Date();
  return { now: d.toISOString(), today: localDate(d) };
}

export function stampsFrom(meta) {
  const clock = stamps();
  return {
    now: meta && isIso(meta.now) ? meta.now : clock.now,
    today: meta && isDay(meta.today) ? meta.today : clock.today,
  };
}

// `now`, but always after every stamp given: an edit, tick or delete made
// here has to win over the version this device is looking at, even when
// another device's clock ran ahead and its stamp lies in our future.
export function later(now, ...previous) {
  let t = ms(now);
  if (!Number.isFinite(t)) t = Date.now();
  for (const p of previous) {
    const v = ms(p);
    if (Number.isFinite(v) && v + 1 > t) t = v + 1;
  }
  return new Date(t).toISOString();
}

// Sorted-key JSON: equal content gives equal strings whatever the key order
// (the server's items and ours list their keys differently).
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
}

// ------------------------------------------------------------ derivation ---

// task.done and anchor.status are never set on their own: they are doneOn
// === the local date. This one function recomputes them (on hydrate, on
// adopt, when the date changes while the app is open), and only touches an
// item whose value actually changes. Old saves and the starters carry other
// anchor statuses ("current", "pending"): anything but "done" is not done.
export function deriveDay(home, today) {
  for (const t of Array.isArray(home.tasks) ? home.tasks : []) {
    if (!isObj(t)) continue;
    const done = t.doneOn === today;
    if (t.done !== done) t.done = done;
  }
  for (const a of Array.isArray(home.anchors) ? home.anchors : []) {
    if (!isObj(a)) continue;
    const status = a.doneOn === today ? "done" : "upcoming";
    if (a.status !== status) a.status = status;
  }
  if (home.dayStamp !== today) home.dayStamp = today;
  return home;
}

// -------------------------------------------------------------- starters ---

const STARTER_TASKS = createMockTasks();

// New installs (and a day cleared for another account) start here. The 1970
// stamps make every device's copy of a starter merge into one; no starter
// carries a tick (a tick is something a person did).
export function starterTasks() {
  return createMockTasks().map((t) => ({ ...t, done: false, createdAt: EPOCH, updatedAt: EPOCH, doneOn: null, tickAt: null }));
}

export function starterAnchors() {
  return mockAnchors.map((a) => ({
    ...a,
    time: { ...a.time },
    status: "upcoming",
    createdAt: EPOCH,
    updatedAt: EPOCH,
    doneOn: null,
    tickAt: null,
  }));
}

// "Never edited": the contract's test is the same id and title. Tasks here
// can only be renamed, so that is exact for them; an anchor's time, subtitle,
// icon or place can change without its title, so an anchor has to match the
// starter in all of them, or a moved starter would lose its new time to the
// starter's 1970 copy on another device.
function isUneditedStarter(section, item) {
  if (section === "tasks") {
    const s = STARTER_TASKS.find((x) => x.id === item.id);
    return Boolean(s) && item.title === s.title;
  }
  if (section === "anchors") {
    const s = mockAnchors.find((x) => x.id === item.id);
    if (!s) return false;
    return (
      item.title === s.title &&
      (item.subtitle || "") === (s.subtitle || "") &&
      isObj(item.time) &&
      item.time.hour === s.time.hour &&
      item.time.minute === s.time.minute &&
      (item.icon || "flag") === (s.icon || "flag") &&
      !item.location
    );
  }
  return false;
}

// ------------------------------------------------------------- old saves ---

export function cleanLevel(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}

// Older saves have no check-ins; anything malformed is dropped, never thrown.
export function cleanCheckins(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const c of list) {
    if (!isObj(c) || !CHECKIN_STATES.has(c.state) || !isIso(c.at)) continue;
    out.push({ state: c.state, level: cleanLevel(c.level) ?? null, at: c.at });
  }
  return out.slice(-CHECKIN_CAP);
}

// A task / anchor / to-do tombstone always carries createdAt and updatedAt
// (the server drops one without them); a dump tombstone is {id, deletedAt}.
function cleanTombs(list, withTimes = true) {
  if (!Array.isArray(list)) return [];
  const byId = new Map();
  for (const t of list) {
    if (!isObj(t) || typeof t.id !== "string" || !t.id || !isIso(t.deletedAt)) continue;
    byId.set(t.id, withTimes ? tombstone(t.id, t.createdAt, t.updatedAt, t.deletedAt) : { id: t.id, deletedAt: t.deletedAt });
  }
  return capTombs([...byId.values()]);
}

function tombstone(id, createdAt, updatedAt, deletedAt) {
  return { id, createdAt: isIso(createdAt) ? createdAt : EPOCH, updatedAt: isIso(updatedAt) ? updatedAt : EPOCH, deletedAt };
}

// The newest TOMBSTONE_CAP, oldest first (the server drops the oldest too).
function capTombs(list) {
  if (list.length <= TOMBSTONE_CAP) return list;
  return [...list].sort((a, b) => (ms(a.deletedAt) || 0) - (ms(b.deletedAt) || 0)).slice(-TOMBSTONE_CAP);
}

export function defaultSyncMeta() {
  return {
    // "Keep my day in sync" (Settings), on unless switched off.
    enabled: true,
    // The server's generation from the last answer; 0 = never synced (§7).
    gen: 0,
    // The account this day last synced with (§8, "Whose day it is").
    owner: null,
    // Deleted items, until the server has them: {id, createdAt, updatedAt, deletedAt}.
    gone: { tasks: [], anchors: [], todos: [] },
    lastSyncAt: null,
  };
}

export function cleanSyncMeta(raw) {
  const s = isObj(raw) ? raw : {};
  const g = isObj(s.gone) ? s.gone : {};
  return {
    enabled: s.enabled !== false,
    gen: Number.isInteger(s.gen) && s.gen > 0 ? s.gen : 0,
    owner: typeof s.owner === "string" && s.owner ? s.owner : null,
    gone: { tasks: cleanTombs(g.tasks), anchors: cleanTombs(g.anchors), todos: cleanTombs(g.todos) },
    lastSyncAt: isIso(s.lastSyncAt) ? s.lastSyncAt : null,
  };
}

export function cleanDumpTombs(list) {
  return cleanTombs(list, false);
}

// Items saved before sync (0.3.0 and older) have no stamps. The contract's
// "Old saves": an untouched starter gets the 1970 stamps; anything else gets
// "now", one millisecond apart in the order the person sees, so ordering by
// createdAt keeps that order; an item ticked today keeps its tick. Items
// that already carry stamps pass through (this runs on every start).
function migrateList(list, section, { now, today, ticked }) {
  if (!Array.isArray(list)) return [];
  const base = Number.isFinite(ms(now)) ? ms(now) : Date.now();
  const ticks = section === "tasks" || section === "anchors";
  let k = 0;
  const out = [];
  for (const raw of list) {
    if (!isObj(raw)) continue;
    const item = { ...raw };
    if (typeof item.id !== "string" || !item.id) item.id = `m-${base.toString(36)}-${out.length}`;
    const hasCreated = isIso(item.createdAt);
    const hasUpdated = isIso(item.updatedAt);
    if (!hasCreated && !hasUpdated) {
      if (isUneditedStarter(section, item)) {
        item.createdAt = EPOCH;
        item.updatedAt = EPOCH;
      } else {
        const t = new Date(base + k).toISOString();
        k += 1;
        item.createdAt = t;
        item.updatedAt = t;
      }
      if (ticks && !isDay(item.doneOn)) {
        // The save's done / status belong to the save's dayStamp.
        const wasDone = section === "tasks" ? item.done === true : item.status === "done";
        item.doneOn = ticked && wasDone ? today : null;
        item.tickAt = item.doneOn ? now : null;
      }
    } else if (!hasCreated) {
      item.createdAt = item.updatedAt;
    } else if (!hasUpdated) {
      item.updatedAt = item.createdAt;
    }
    if (ticks) cleanTick(item);
    else item.done = item.done === true;
    delete item.deletedAt; // a live item; tombstones live in sync.gone
    out.push(item);
  }
  return out;
}

// A tick is doneOn + tickAt together; a doneOn without the moment it was set
// counts as no tick (the server's rule, so both sides agree on "done").
function cleanTick(item) {
  if (!isDay(item.doneOn) || !isIso(item.tickAt)) {
    item.doneOn = null;
    if (!isIso(item.tickAt)) item.tickAt = null;
  }
}

// The whole home slice from storage. `base` is the state before hydrating
// (it fills keys the save doesn't have, as Object.assign used to). Unknown
// top-level keys survive, like before.
export function migrateHome(saved, base, { now, today }) {
  const p = isObj(saved) ? saved : {};
  const ctx = { now, today, ticked: p.dayStamp === today };
  const next = { ...base, ...p };
  next.nervousLevel = cleanLevel(next.nervousLevel);
  next.checkins = cleanCheckins(next.checkins);
  next.tasks = migrateList(next.tasks, "tasks", ctx);
  next.anchors = migrateList(next.anchors, "anchors", ctx);
  next.todos = migrateList(next.todos, "todos", ctx);
  next.sync = cleanSyncMeta("sync" in p ? p.sync : base.sync);
  // A starter missing from a save made before sync was deleted by the
  // person (the deletion predates tombstones). Saying so keeps another
  // device's 1970 starter from bringing it back (contract §8, "Old saves").
  if (!("sync" in p)) {
    for (const [section, starters] of [
      ["tasks", STARTER_TASKS],
      ["anchors", mockAnchors],
    ]) {
      if (!Array.isArray(p[section])) continue;
      const have = new Set(next[section].map((it) => it.id));
      for (const s of starters) {
        if (!have.has(s.id)) next.sync.gone[section] = withTombstone(next.sync.gone[section], tombstone(s.id, EPOCH, EPOCH, now));
      }
    }
  }
  return deriveDay(next, today);
}

// ------------------------------------------------------- local editing ---

// What the merge treats as one item's "definition" (§5): every field but
// these. A field with no value counts the same as a missing one (an
// optional field is left out, never null).
const NOT_DEFINITION = {
  tasks: new Set(["done", "doneOn", "tickAt", "deletedAt", "createdAt", "updatedAt"]),
  anchors: new Set(["status", "doneOn", "tickAt", "deletedAt", "createdAt", "updatedAt"]),
  todos: new Set(["deletedAt", "createdAt", "updatedAt"]),
};

export function definitionKey(item, section) {
  const out = {};
  for (const key of Object.keys(item || {})) {
    if (NOT_DEFINITION[section].has(key)) continue;
    const v = item[key];
    if (v === null || v === undefined) continue;
    out[key] = v;
  }
  return canonical(out);
}

// Deleting = a tombstone (no content, like the server's) and the item hidden.
// deletedAt is never before updatedAt, or the delete would not hold (§5).
export function tombstoneFor(item, now) {
  return tombstone(item.id, item.createdAt, item.updatedAt, later(now, item.updatedAt));
}

export function withTombstone(list, tomb) {
  return capTombs([...(Array.isArray(list) ? list : []).filter((t) => t.id !== tomb.id), tomb]);
}

// For a new task or to-do: now, but never before the list's last createdAt,
// so it lands at the bottom (the server orders these by createdAt).
export function createdStamp(now, list) {
  const last = (Array.isArray(list) ? list : []).reduce((m, it) => Math.max(m, ms(it && it.createdAt) || 0), 0);
  return last ? later(now, new Date(last).toISOString()) : later(now);
}

const minuteOf = (a) => (isObj(a.time) ? Number(a.time.hour) * 60 + Number(a.time.minute) : 0);

// The server's order (§5), so adopting never reshuffles what the person sees.
export const ORDER = {
  anchors: (a, b) => minuteOf(a) - minuteOf(b) || cmp(a.id, b.id),
  tasks: (a, b) => (ms(a.createdAt) || 0) - (ms(b.createdAt) || 0) || cmp(a.id, b.id),
  todos: (a, b) => (ms(a.createdAt) || 0) - (ms(b.createdAt) || 0) || cmp(a.id, b.id),
  dump: (a, b) => (ms(b.at) || 0) - (ms(a.at) || 0) || cmp(b.id, a.id),
};

// ------------------------------------------------------------- request ---

// Fields the server has no use for: derived here, re-derived on adopt.
const LOCAL_ONLY = { anchors: new Set(["status"]), tasks: new Set(["done"]), todos: new Set() };
const NULL_MEANS_SOMETHING = new Set(["deletedAt", "doneOn", "tickAt"]);

// The whole item (fields this app doesn't use included, §8 "Fields you don't
// use"), minus local-only fields and optional fields with no value.
function itemOut(item, section) {
  const out = {};
  for (const key of Object.keys(item)) {
    if (LOCAL_ONLY[section].has(key) || UNSAFE_KEYS.has(key)) continue;
    const v = item[key];
    if (v === undefined || (v === null && !NULL_MEANS_SOMETHING.has(key))) continue;
    out[key] = v;
  }
  out.deletedAt = null;
  if (section !== "todos") {
    out.doneOn = isDay(item.doneOn) ? item.doneOn : null;
    out.tickAt = isIso(item.tickAt) ? item.tickAt : null;
  }
  return out;
}

function dumpOut(d) {
  const out = {};
  for (const key of Object.keys(d)) {
    if (UNSAFE_KEYS.has(key) || d[key] === undefined || d[key] === null) continue;
    out[key] = d[key];
  }
  out.deletedAt = null;
  return out;
}

// §8 "Sending": every local item of every section this app knows, tombstones
// included, the check-ins, and the stored gen (none before the first sync).
export function buildSyncBody(home, pal) {
  const sync = isObj(home && home.sync) ? home.sync : defaultSyncMeta();
  const body = { v: 1 };
  if (Number.isInteger(sync.gen) && sync.gen > 0) body.gen = sync.gen;
  for (const section of SECTIONS) {
    const live = (Array.isArray(home[section]) ? home[section] : []).filter(isObj).map((it) => itemOut(it, section));
    const gone = ((sync.gone && sync.gone[section]) || []).map((t) => ({ ...t }));
    body[section] = [...live, ...gone];
  }
  const dumpLive = (Array.isArray(pal && pal.dump) ? pal.dump : []).filter(isObj).map(dumpOut);
  const dumpGone = (Array.isArray(pal && pal.dumpGone) ? pal.dumpGone : []).map((t) => ({ id: t.id, deletedAt: t.deletedAt }));
  body.dump = [...dumpLive, ...dumpGone];
  body.checkins = (Array.isArray(home.checkins) ? home.checkins : []).map((c) => ({
    at: c.at,
    state: c.state,
    level: typeof c.level === "number" ? c.level : null,
  }));
  return body;
}

// --------------------------------------------------------------- adopt ---

export function isDayBody(body) {
  return isObj(body) && body.v === 1;
}

function copySafe(raw) {
  const out = {};
  for (const key of Object.keys(raw)) if (!UNSAFE_KEYS.has(key)) out[key] = raw[key];
  return out;
}

// One item of an answer, checked just enough that no screen can trip on it
// (everything else the server sent is kept as it came). null = unusable:
// treated as if the answer didn't mention it.
function cleanServerItem(raw, section) {
  if (!isObj(raw) || typeof raw.id !== "string" || !ID_RE.test(raw.id)) return null;
  if (raw.deletedAt !== null && raw.deletedAt !== undefined) {
    if (!isIso(raw.deletedAt)) return null;
    const tomb = section === "dump" ? { id: raw.id, deletedAt: raw.deletedAt } : tombstone(raw.id, raw.createdAt, raw.updatedAt, raw.deletedAt);
    return { tomb };
  }
  const item = copySafe(raw);
  delete item.deletedAt;
  if (section === "dump") {
    if (typeof item.text !== "string" || !item.text.trim() || typeof item.at !== "string") return null;
    return { item };
  }
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  if (section === "anchors") {
    const t = isObj(item.time) ? item.time : {};
    const okHour = Number.isInteger(t.hour) && t.hour >= 0 && t.hour <= 23;
    const okMinute = Number.isInteger(t.minute) && t.minute >= 0 && t.minute <= 59;
    if (!okHour || !okMinute) return null;
    item.time = copySafe(t);
  }
  if (section === "todos") item.done = item.done === true;
  else cleanTick(item);
  return { item };
}

// §8 "Receiving" for one id-based section. The answer replaces the section,
// with one exception that protects this device's data: a local item the
// answer doesn't mention at all (live or tombstone) stays and is sent again
// next time. After an erase (`erased`) there is no exception.
// Returns null when the answer has no such section (then nothing changes).
function adoptList(localLive, localGone, serverList, section, erased) {
  if (!Array.isArray(serverList)) return null;
  const live = [];
  const gone = [];
  const seen = new Set();
  for (const raw of serverList) {
    const r = cleanServerItem(raw, section);
    if (!r) continue;
    const id = r.tomb ? r.tomb.id : r.item.id;
    if (seen.has(id)) continue;
    seen.add(id);
    if (r.tomb) gone.push(r.tomb);
    else live.push(r.item);
  }
  if (!erased) {
    // Copies: the store's objects are frozen, and deriving may touch them.
    for (const it of Array.isArray(localLive) ? localLive : []) if (isObj(it) && !seen.has(it.id)) live.push({ ...it });
    for (const t of Array.isArray(localGone) ? localGone : []) if (isObj(t) && !seen.has(t.id)) gone.push({ ...t });
  }
  live.sort(ORDER[section]);
  return { live, gone: capTombs(gone) };
}

export function adoptCheckins(serverList) {
  if (!Array.isArray(serverList)) return null;
  const byAt = new Map();
  for (const c of cleanCheckinsAll(serverList)) byAt.set(c.at, c);
  return [...byAt.values()].sort((a, b) => ms(a.at) - ms(b.at)).slice(-CHECKIN_CAP);
}

function cleanCheckinsAll(list) {
  const out = [];
  for (const c of list) {
    if (!isObj(c) || !CHECKIN_STATES.has(c.state) || !isIso(c.at)) continue;
    out.push({ state: c.state, level: cleanLevel(c.level) ?? null, at: c.at });
  }
  return out;
}

export function newestCheckinMs(list) {
  let best = -Infinity;
  for (const c of Array.isArray(list) ? list : []) {
    const t = ms(c && c.at);
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best;
}

// The home half of an answer (the dump half is adoptDump). Returns only what
// the answer has; `follow` is the check-in Home's state and slider follow
// when it is newer than every check-in this device had.
export function adoptHome(home, body, { today }) {
  const erased = body.erased === true;
  const sync = isObj(home.sync) ? home.sync : defaultSyncMeta();
  const out = { sections: {}, checkins: null, follow: null, gen: sync.gen };
  for (const section of SECTIONS) {
    const r = adoptList(home[section], sync.gone && sync.gone[section], body[section], section, erased);
    if (r) out.sections[section] = r;
  }
  const checkins = adoptCheckins(body.checkins);
  if (checkins) {
    out.checkins = checkins;
    const newest = checkins[checkins.length - 1];
    if (newest && ms(newest.at) > newestCheckinMs(home.checkins)) {
      out.follow = { state: newest.state, level: newest.level };
    }
  }
  if (Number.isInteger(body.gen) && body.gen > 0) out.gen = body.gen;
  // Derive done / status for the adopted items before anyone reads them.
  const view = { tasks: out.sections.tasks ? out.sections.tasks.live : [], anchors: out.sections.anchors ? out.sections.anchors.live : [] };
  deriveDay(view, today);
  return out;
}

export function adoptDump(localLive, localGone, serverList, erased) {
  const r = adoptList(localLive, localGone, serverList, "dump", erased);
  if (!r) return null;
  return { live: r.live.slice(0, DUMP_CAP), gone: r.gone };
}

// --------------------------------------------------------- whose day ---

// §8 "Whose day it is", for the account signed in now:
//   "join"  — the day never synced (made signed out): it joins this account
//   "keep"  — it is this account's day
//   "reset" — it last synced as someone else: clear it before anything is sent
//   "none"  — nobody to sync as
export function ownerStep(owner, account) {
  if (!account) return "none";
  if (!owner) return "join";
  return owner === account ? "keep" : "reset";
}

// ------------------------------------------------------- status line ---

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function when(iso, now) {
  const d = new Date(iso);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return localDate(d) === localDate(now) ? `at ${time}` : `on ${d.getDate()} ${MONTHS[d.getMonth()]} at ${time}`;
}

// The one place a sync problem is ever shown (§8 "Failures"): the line under
// the Settings switch. phase comes from the sync loop (daySync.js).
export function describeDaySync({ enabled, phase, lastSyncAt, now = new Date() }) {
  if (!enabled) return "Off. Your day stays on this phone.";
  const synced = isIso(lastSyncAt) ? `Synced with your server ${when(lastSyncAt, now)}.` : null;
  switch (phase) {
    case "demo":
      return "Demo mode: your day stays on this phone.";
    case "unconfigured":
      return "No server is set up, so your day stays on this phone.";
    case "unavailable":
      return "Your server can't keep the day yet, so it stays on this phone.";
    case "signed-out":
      return "Your day syncs once you're signed in.";
    case "waiting":
      return "Waiting for your server. Your day is safe on this phone.";
    case "offline":
      return "Can't sync right now. Your day is safe on this phone and syncs when your server is back.";
    case "syncing":
      return synced || "Syncing with your server…";
    default:
      return synced || "Your day will sync with your server.";
  }
}

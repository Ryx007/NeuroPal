#!/usr/bin/env node
// The web app's day sync model (src/lib/neuropal/dayModel.ts, docs/DAY-SYNC.md):
// old saves, stamping every change, tombstones, Undo, "done" across midnight,
// the request, adopting an answer — and a round trip through the server's own
// merge (neuropal-backend/src/services/dayMerge.js), so what the web app sends
// is what the server keeps.
//   node scripts/qa/day-model.mjs
// Node ≥ 22.18 loads the .ts file directly (type stripping).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const platform = resolve(here, "../..");
const repo = resolve(platform, "..");
const m = await import(resolve(platform, "src/lib/neuropal/dayModel.ts"));
const server = createRequire(import.meta.url)(resolve(repo, "neuropal-backend/src/services/dayMerge.js"));

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`✗ ${name}\n    ${String(e && e.stack ? e.stack : e).split("\n").slice(0, 8).join("\n    ")}`);
  }
}

// A moment with its local date given explicitly, so the checks pass in any time zone.
const at = (iso, today = iso.slice(0, 10)) => {
  const ms = Date.parse(iso);
  return { ms, now: new Date(ms).toISOString(), today };
};
const plus = (c, ms, today = c.today) => at(new Date(c.ms + ms).toISOString(), today);
const EPOCH = "1970-01-01T00:00:00.000Z";
const STARTER_GONE = "1970-01-01T00:00:00.001Z";
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const clone = (v) => JSON.parse(JSON.stringify(v));
const ids = (list) => list.map((x) => x.id);

// ---- old saves -----------------------------------------------------------------------------

const OLD = {
  v: 1,
  dayStamp: "2026-11-19",
  state: "yellow",
  level: 0.52,
  checkins: [
    { state: "yellow", level: 0.52, at: "2026-11-19T09:00:00.000Z" },
    { state: "red", level: null, at: "2026-11-19T08:00:00.000Z" },
    { state: "blue", level: 1, at: "2026-11-19T08:30:00.000Z" },
  ],
  tasks: [
    { id: "mvd-1", title: "Stay hydrated", subtitle: "2 glasses left", done: true },
    { id: "mvd-2", title: "Take meds at noon", subtitle: "Morning dosage", done: false },
    { id: "t-abc", title: "Read section 2", subtitle: "", done: true },
    { id: "bad id!", title: "Call the lab", subtitle: "", done: false },
    { id: "t-empty", title: "   ", subtitle: "", done: false },
  ],
  anchors: [
    { id: "a-1", title: "Lunch break", subtitle: "Away from the screen", time: { hour: 12, minute: 30 }, flexMinutes: 30, category: "break", status: "done", mood: "kept" },
  ],
  dump: [{ id: "d-1", text: "Is the SPAD driver updated?", at: "2026-11-19T07:00:00.000Z" }],
};

await test("an old save: untouched starters get 1970, the rest now (a millisecond apart, in the order on screen), today's ticks hold", () => {
  const c = at("2026-11-19T10:00:00.000Z");
  const { day, changed } = m.readSave(clone(OLD), c);
  assert.equal(changed, true, "an old save is written back once");
  assert.equal(day.v, 2);
  const byId = Object.fromEntries(day.tasks.map((t) => [t.id, t]));
  assert.equal(byId["mvd-1"].createdAt, EPOCH);
  assert.equal(byId["mvd-1"].updatedAt, EPOCH);
  assert.equal(byId["mvd-2"].createdAt, "2026-11-19T10:00:00.000Z", "an edited starter is not a starter");
  assert.equal(byId["t-abc"].createdAt, "2026-11-19T10:00:00.001Z");
  const renamed = day.tasks.find((t) => t.title === "Call the lab");
  assert.match(renamed.id, /^m-[a-z0-9]+-1$/, "an id the server would refuse gets a new one");
  assert.equal(renamed.createdAt, "2026-11-19T10:00:00.002Z");
  assert.deepEqual(ids(day.tasks), ["mvd-1", "mvd-2", "t-abc", renamed.id], "order on screen kept (by createdAt)");
  assert.ok(!day.tasks.some((t) => t.id === "t-empty"), "an empty title is dropped");
  assert.deepEqual([byId["mvd-1"].doneOn, byId["mvd-1"].tickAt], ["2026-11-19", c.now], "ticked today: doneOn today, tickAt now");
  assert.deepEqual([byId["mvd-2"].doneOn, byId["mvd-2"].tickAt], [null, null]);
  assert.equal(byId["t-abc"].doneOn, "2026-11-19");
  for (const t of day.tasks) assert.ok(!("done" in t), "done is derived, never stored");
  const a = day.anchors[0];
  assert.deepEqual([a.doneOn, a.tickAt, a.createdAt, a.mood], ["2026-11-19", c.now, "2026-11-19T10:00:00.003Z", "kept"]);
  assert.ok(!("status" in a));
  assert.deepEqual(day.checkins, [
    { state: "red", level: null, at: "2026-11-19T08:00:00.000Z" },
    { state: "yellow", level: 0.52, at: "2026-11-19T09:00:00.000Z" },
  ]);
  assert.deepEqual([day.state, day.level], ["yellow", 0.52]);
  assert.deepEqual(day.dump, [{ id: "d-1", text: "Is the SPAD driver updated?", at: "2026-11-19T07:00:00.000Z" }]);
  assert.deepEqual(
    day.sync,
    { ...m.emptySync(true), gone: { anchors: [], dump: [], tasks: [{ id: "mvd-3", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: STARTER_GONE }] } },
    "on by default, never synced, nobody's yet; the starter it lacks was deleted (1970 + 1 ms: beats an untouched starter, never a real edit)",
  );
  assert.deepEqual(m.readSave(clone(OLD), at("2026-12-01T09:00:00.000Z")).day.sync.gone.tasks, day.sync.gone.tasks, "the same stamp whenever the browser migrated");
  const view = m.dayView(day);
  assert.deepEqual(view.tasks.map((t) => t.done), [true, false, true, false]);
  assert.equal(view.anchors[0].status, "done");

  // Read back after it was written: nothing changes and nothing is re-stamped.
  const again = m.readSave(clone(day), at("2026-11-19T11:30:00.000Z"));
  assert.equal(again.changed, false);
  assert.deepEqual(again.day, day);
});

await test("an old save from yesterday: its ticks don't count today", () => {
  const { day } = m.readSave({ ...clone(OLD), dayStamp: "2026-11-18" }, at("2026-11-19T10:00:00.000Z"));
  assert.ok(day.tasks.every((t) => t.doneOn === null && t.tickAt === null));
  assert.equal(day.anchors[0].doneOn, null);
});

await test("a new install, and saves that can't be read, start with the 1970 starters", () => {
  const c = at("2026-11-19T10:00:00.000Z");
  for (const input of [undefined, null, 42, "x", { v: 2, tasks: "nope" }]) {
    const { day } = m.readSave(input, c);
    assert.deepEqual(day.tasks, m.starterTasks());
    assert.deepEqual(day.tasks.map((t) => [t.id, t.createdAt, t.updatedAt, t.doneOn, t.tickAt]), [
      ["mvd-1", EPOCH, EPOCH, null, null],
      ["mvd-2", EPOCH, EPOCH, null, null],
      ["mvd-3", EPOCH, EPOCH, null, null],
    ]);
  }
});

// ---- stamping -------------------------------------------------------------------------------

await test("every change is stamped: add, tick and un-tick, edit, check-in, dump, delete", () => {
  const c0 = at("2026-11-19T10:00:00.000Z");
  let d = m.newDay(c0);
  const c1 = plus(c0, 1000);
  d = m.addTask(d, "t-1", "  Email   Milena ", "", c1);
  const t1 = d.tasks.find((t) => t.id === "t-1");
  assert.deepEqual([t1.title, t1.createdAt, t1.updatedAt, t1.doneOn, t1.tickAt], ["Email Milena", c1.now, c1.now, null, null]);
  assert.equal(d.tasks.at(-1).id, "t-1", "a new task lands at the bottom");

  // Another device's clock ran ahead: a new task still lands after its task.
  const ahead = { id: "t-ahead", title: "From the fast phone", subtitle: "", createdAt: plus(c1, 30000).now, updatedAt: plus(c1, 30000).now, doneOn: null, tickAt: null };
  d = m.addTask({ ...d, tasks: [...d.tasks, ahead] }, "t-2", "After it", "", plus(c1, 1000));
  assert.equal(d.tasks.find((t) => t.id === "t-2").createdAt, plus(c1, 30001).now);
  assert.equal(d.tasks.at(-1).id, "t-2");

  const c2 = plus(c0, 2000);
  d = m.toggleTask(d, "mvd-2", c2);
  let t = d.tasks.find((x) => x.id === "mvd-2");
  assert.deepEqual([t.doneOn, t.tickAt, t.updatedAt], ["2026-11-19", c2.now, EPOCH], "a tick never touches the definition");
  const c3 = plus(c0, 3000);
  d = m.toggleTask(d, "mvd-2", c3);
  t = d.tasks.find((x) => x.id === "mvd-2");
  assert.deepEqual([t.doneOn, t.tickAt], [null, c3.now], "un-ticking is a tick with doneOn null");

  // A tick from a phone whose clock is ahead: ours is still later.
  const future = plus(c3, 20000).now;
  d = { ...d, tasks: d.tasks.map((x) => (x.id === "mvd-3" ? { ...x, doneOn: "2026-11-19", tickAt: future } : x)) };
  d = m.toggleTask(d, "mvd-3", plus(c3, 1000));
  assert.equal(d.tasks.find((x) => x.id === "mvd-3").tickAt, new Date(Date.parse(future) + 1).toISOString());

  const c4 = plus(c0, 4000);
  d = m.addAnchor(d, "a-1", { title: "Evening meds", subtitle: "With water", hour: 21, minute: 0, flexMinutes: 15, category: "medication" }, c4);
  let a = d.anchors[0];
  assert.deepEqual([a.createdAt, a.updatedAt, a.flexMinutes, a.category, a.doneOn], [c4.now, c4.now, 15, "medication", null]);
  const c5 = plus(c0, 5000);
  d = m.updateAnchor(d, "a-1", { title: "Evening meds", subtitle: "With water", hour: 21, minute: 30, flexMinutes: 15, category: "medication" }, c5);
  a = d.anchors[0];
  assert.deepEqual([a.time, a.updatedAt, a.createdAt], [{ hour: 21, minute: 30 }, c5.now, c4.now]);
  const same = m.updateAnchor(d, "a-1", { title: "Evening meds", subtitle: "With water", hour: 21, minute: 30, flexMinutes: 15, category: "medication" }, plus(c0, 6000));
  assert.equal(same, d, "saving with nothing changed changes nothing (no updatedAt to win over a real edit elsewhere)");
  const c7 = plus(c0, 7000);
  d = m.setAnchorDone(d, "a-1", true, c7);
  assert.deepEqual([d.anchors[0].doneOn, d.anchors[0].tickAt, d.anchors[0].updatedAt], ["2026-11-19", c7.now, c5.now]);
  assert.equal(m.setAnchorDone(d, "a-1", true, plus(c0, 8000)), d, "already done: nothing to stamp");

  const c9 = plus(c0, 9000);
  d = m.recordCheckin(d, "green", 0.1, undefined, c9);
  assert.deepEqual(d.checkins.at(-1), { state: "green", level: 0.1, at: c9.now });
  d = m.recordCheckin(d, "yellow", 0.5, undefined, plus(c9, 30000));
  assert.equal(d.checkins.length, 1, "within a minute it refines the last one");
  assert.deepEqual([d.state, d.level], ["yellow", 0.5]);
  d = m.recordCheckin(d, "red", 0.9, c0.ms - 3600e3, plus(c9, 40000));
  assert.deepEqual(d.checkins.map((x) => x.state), ["red", "yellow"], "an older one joins the history in time order");
  assert.equal(d.state, "yellow", "…and leaves the current state alone");
  for (const x of d.checkins) assert.match(x.at, ISO_MS);

  const c10 = plus(c0, 10000);
  d = m.addDump(d, "d-1", "  call  the lab ", c10);
  assert.deepEqual(d.dump[0], { id: "d-1", text: "call the lab", at: c10.now });

  const c11 = plus(c0, 11000);
  const r = m.removeTask(d, "t-1", c11);
  assert.equal(r.removed.title, "Email Milena");
  assert.deepEqual(r.day.sync.gone.tasks, [{ id: "t-1", createdAt: c1.now, updatedAt: c1.now, deletedAt: c11.now }]);
  assert.ok(!ids(r.day.tasks).includes("t-1"));

  const marked = m.markEdited(r.day, "2026-11-19", "e-x");
  assert.equal(marked.sync.edit, "e-x");
  assert.equal(m.hasUnsynced(marked), true);
});

await test("a deletion always holds: deletedAt is never before updatedAt, even for an item stamped in our future", () => {
  const c = at("2026-11-19T10:00:00.000Z");
  const futureEdit = plus(c, 50000).now;
  const d0 = { ...m.newDay(c), tasks: [{ id: "t-f", title: "Edited on a fast phone", subtitle: "", createdAt: EPOCH, updatedAt: futureEdit, doneOn: null, tickAt: null }] };
  const { day } = m.removeTask(d0, "t-f", c);
  const tomb = day.sync.gone.tasks[0];
  assert.ok(tomb.deletedAt > tomb.updatedAt);
  assert.equal(server.normalizeItem("tasks", tomb, Date.parse(futureEdit)).deletedAt, tomb.deletedAt, "the server reads it as a tombstone");
});

// ---- tombstones and Undo --------------------------------------------------------------------

await test("tombstones are kept apart (never shown), sent, and capped at the newest 3000, like the server", () => {
  assert.equal(m.TOMBSTONE_CAP, 3000);
  const c = at("2026-11-19T10:00:00.000Z");
  const kept = Array.from({ length: 3000 }, (_, i) => ({ id: `old-${i}`, createdAt: EPOCH, updatedAt: EPOCH, deletedAt: plus(c, -1e6 + i).now }));
  let d = { ...m.newDay(c), sync: { ...m.emptySync(), gone: { anchors: [], tasks: kept, dump: [] } } };
  for (let i = 0; i < 10; i += 1) d = m.addTask(d, `t-${i}`, `Task ${i}`, "", plus(c, i));
  for (let i = 0; i < 10; i += 1) d = m.removeTask(d, `t-${i}`, plus(c, 1000 + i)).day;
  assert.equal(d.sync.gone.tasks.length, 3000);
  assert.ok(!d.sync.gone.tasks.some((t) => t.id === "old-0" || t.id === "old-9"), "the oldest go first");
  assert.ok(d.sync.gone.tasks.some((t) => t.id === "old-10") && d.sync.gone.tasks.some((t) => t.id === "t-9"));
  assert.deepEqual(ids(m.dayView(d).tasks), ["mvd-1", "mvd-2", "mvd-3"]);
  const req = m.buildRequest(d);
  assert.equal(req.tasks.filter((t) => t.deletedAt).length, 3000);
  assert.equal(m.readSave(clone(d), c).day.sync.gone.tasks.length, 3000, "all of them read back from storage");
});

await test("Undo: a task comes back as it was (an edit), tick included; the dump writes the text again under a new id", () => {
  const c = at("2026-11-19T10:00:00.000Z");
  let d = m.toggleTask(m.newDay(c), "mvd-2", c);
  const r = m.removeTask(d, "mvd-2", plus(c, 1000));
  d = m.restoreTask(r.day, r.removed, plus(c, 2000));
  const t = d.tasks.find((x) => x.id === "mvd-2");
  assert.equal(t.title, "Take meds");
  assert.ok(t.updatedAt > r.day.sync.gone.tasks[0].deletedAt, "updatedAt after the deletion, so the server takes it back");
  assert.deepEqual([t.doneOn, t.tickAt], ["2026-11-19", c.now]);
  assert.equal(d.sync.gone.tasks.length, 0, "no tombstone left for a live item");
  assert.deepEqual(ids(d.tasks), ["mvd-1", "mvd-2", "mvd-3"], "back in its place");
  assert.equal(m.restoreTask(d, r.removed, plus(c, 3000)), d, "restoring a live item does nothing");

  // An anchor from another app keeps its fields through delete + Undo.
  const expo = { id: "a-expo", title: "Pharmacy", subtitle: "", time: { hour: 17, minute: 0 }, icon: "medication", location: { lat: 41.1, lng: 16.87, radius: 150 }, createdAt: c.now, updatedAt: c.now, doneOn: null, tickAt: null };
  d = { ...d, anchors: [expo] };
  const ra = m.removeAnchor(d, "a-expo", plus(c, 4000));
  d = m.restoreAnchor(ra.day, ra.removed, plus(c, 5000));
  assert.deepEqual({ ...d.anchors[0], updatedAt: c.now }, expo);

  d = m.addDump(d, "d-1", "check the SPAD calibration", plus(c, 6000));
  const rd = m.removeDump(d, "d-1", plus(c, 7000));
  d = m.restoreDump(rd.day, rd.removed, "d-2", plus(c, 8000));
  assert.deepEqual(d.dump, [{ id: "d-2", text: "check the SPAD calibration", at: plus(c, 6000).now }]);
  assert.deepEqual(d.sync.gone.dump, [{ id: "d-1", deletedAt: plus(c, 7000).now }], "the old id stays deleted");
});

// ---- done across midnight -------------------------------------------------------------------

await test("doneOn across midnight: yesterday's tick stays stored but isn't done today; no rollover job", () => {
  const late = at("2026-11-19T22:59:00.000Z", "2026-11-19");
  let d = m.toggleTask(m.newDay(late), "mvd-1", late);
  d = m.setAnchorDone(m.addAnchor(d, "a-1", { title: "Wind down", hour: 23, minute: 30 }, late), "a-1", true, late);
  assert.equal(m.dayView(d).tasks[0].done, true);
  assert.equal(m.dayView(d).anchors[0].status, "done");
  // Read again after midnight (local date 2026-11-20): derived with the new date.
  const next = m.readSave(clone(d), at("2026-11-20T06:00:00.000Z", "2026-11-20")).day;
  assert.equal(next.dayStamp, "2026-11-20");
  assert.equal(m.dayView(next).tasks[0].done, false);
  assert.equal(m.dayView(next).anchors[0].status, "upcoming");
  assert.equal(next.tasks[0].doneOn, "2026-11-19", "the tick itself is kept as it was");
  // The page stayed open over midnight: the same stored day, a new date.
  assert.equal(m.dayView({ ...d, dayStamp: "2026-11-20" }).tasks[0].done, false);
  // Ticking again the next day.
  const morning = at("2026-11-20T07:00:00.000Z", "2026-11-20");
  const again = m.toggleTask(next, "mvd-1", morning);
  assert.deepEqual([again.tasks[0].doneOn, again.tasks[0].tickAt], ["2026-11-20", morning.now]);
  assert.equal(m.dayView(again).tasks[0].done, true);
  // The local date decides, not UTC: 00:30 in Rome is still the 19th in UTC.
  const rome = at("2026-11-19T23:30:00.000Z", "2026-11-20");
  assert.equal(m.toggleTask(next, "mvd-2", rome).tasks[1].doneOn, "2026-11-20");
});

// ---- the request ----------------------------------------------------------------------------

await test("the request: the sections the web app knows (never todos), tombstones, gen only after a sync, UTC stamps with milliseconds", () => {
  const c = at("2026-11-19T10:00:00.000Z");
  let d = m.readSave(clone(OLD), c).day;
  d = { ...d, anchors: [...d.anchors, { id: "a-expo", title: "Pharmacy", subtitle: "", time: { hour: 17, minute: 0 }, icon: "medication", location: { lat: 41.1, lng: 16.87, radius: 150 }, future: { x: 1 }, createdAt: c.now, updatedAt: c.now, doneOn: null, tickAt: null }] };
  d = m.removeAnchor(d, "a-1", plus(c, 1000)).day;
  d = m.removeDump(d, "d-1", plus(c, 2000)).day;
  const req = m.buildRequest(d);
  assert.deepEqual(Object.keys(req), ["v", "anchors", "tasks", "dump", "checkins"], "no gen before the first sync, no todos");
  assert.deepEqual(Object.keys(m.buildRequest({ ...d, sync: { ...d.sync, gen: 3 } })), ["v", "gen", "anchors", "tasks", "dump", "checkins"]);
  const expo = req.anchors.find((a) => a.id === "a-expo");
  assert.deepEqual(expo, {
    id: "a-expo",
    title: "Pharmacy",
    subtitle: "",
    time: { hour: 17, minute: 0 },
    icon: "medication",
    location: { lat: 41.1, lng: 16.87, radius: 150 },
    future: { x: 1 },
    createdAt: c.now,
    updatedAt: c.now,
    deletedAt: null,
    doneOn: null,
    tickAt: null,
  });
  assert.ok(!("flexMinutes" in expo) && !("category" in expo), "optional fields it came without stay out (never null)");
  assert.deepEqual(req.anchors.find((a) => a.id === "a-1"), { id: "a-1", createdAt: "2026-11-19T10:00:00.003Z", updatedAt: "2026-11-19T10:00:00.003Z", deletedAt: plus(c, 1000).now });
  assert.deepEqual(req.dump, [{ id: "d-1", deletedAt: plus(c, 2000).now }]);
  assert.deepEqual(req.tasks.filter((t) => t.deletedAt), [{ id: "mvd-3", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: STARTER_GONE }], "the starter deleted before sync goes as a tombstone");
  for (const t of req.tasks.filter((x) => x.deletedAt === null)) {
    assert.ok(!("done" in t) && !("status" in t));
    for (const k of ["createdAt", "updatedAt"]) assert.match(t[k], ISO_MS);
    if (t.tickAt !== null) assert.match(t.tickAt, ISO_MS);
  }
  for (const x of req.checkins) assert.match(x.at, ISO_MS);
  // The server takes every item as it is: nothing dropped, the same content.
  const n = server.normalizeRequest(clone(req), Date.parse("2026-11-19T10:05:00.000Z"));
  for (const kind of ["anchors", "tasks", "dump"]) assert.equal(n.sections[kind].length, req[kind].length, `${kind}: nothing refused`);
  assert.equal(n.sections.todos, null, "todos not sent, so the server leaves them alone");
  assert.equal(n.checkins.length, req.checkins.length);
  const sExpo = n.sections.anchors.find((a) => a.id === "a-expo");
  assert.deepEqual([sExpo.icon, sExpo.location], ["medication", { lat: 41.1, lng: 16.87, radius: 150 }]);
});

// ---- adopting an answer ----------------------------------------------------------------------

function answer(over = {}) {
  return { v: 1, gen: 1, rev: 5, serverTime: "2026-11-19T10:00:00.000Z", erased: false, anchors: [], tasks: [], todos: [], dump: [], checkins: [], ...over };
}

await test("adopting: the answer replaces the sections; what it doesn't mention stays; a tombstone hides an item still shown", () => {
  const c = at("2026-11-19T10:00:00.000Z");
  let d = m.newDay(c);
  d = m.addTask(d, "t-local", "Only here", "", c);
  d = m.addAnchor(d, "a-shown", { title: "Shown here", hour: 9, minute: 0 }, c);
  d = m.removeTask(d, "mvd-3", c).day; // a deletion the server hasn't seen
  d = m.markEdited(d, c.today, "e-1");
  const body = answer({
    tasks: [
      { id: "mvd-1", title: "Stay hydrated", subtitle: "2 glasses left", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: null, doneOn: "2026-11-19", tickAt: "2026-11-19T08:00:00.000Z" },
      { id: "mvd-2", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: "2026-11-19T07:00:00.000Z" },
    ],
    anchors: [{ id: "a-shown", createdAt: c.now, updatedAt: c.now, deletedAt: "2026-11-19T09:59:00.000Z" }],
    todos: [{ id: "td-1", title: "Not for the web", done: false, createdAt: c.now, updatedAt: c.now, deletedAt: null }],
    dump: [{ id: "d-phone", text: "from the phone", at: "2026-11-19T09:00:00.000Z", deletedAt: null }],
  });
  const r = m.adoptAnswer(d, body, plus(c, 500), "e-1");
  const view = m.dayView(r.day);
  assert.deepEqual(ids(view.tasks), ["mvd-1", "t-local"], "mvd-2 deleted elsewhere; t-local not mentioned, so kept");
  assert.equal(view.tasks[0].done, true, "the tick from the phone counts today");
  assert.deepEqual(ids(view.anchors), [], "deleted on another device while shown here: gone");
  assert.deepEqual(ids(r.day.sync.gone.anchors), ["a-shown"]);
  assert.deepEqual(ids(r.day.sync.gone.tasks).sort(), ["mvd-2", "mvd-3"], "the server's tombstone, and ours it doesn't mention yet");
  assert.deepEqual(view.dump.map((x) => x.text), ["from the phone"]);
  assert.ok(!("todos" in r.day), "todos are ignored");
  assert.deepEqual([r.day.sync.gen, r.day.sync.rev, r.day.sync.syncedEdit, r.day.sync.syncedAt, r.day.sync.last], [1, 5, "e-1", plus(c, 500).now, { at: plus(c, 500).now, result: "ok" }]);
  assert.equal(m.hasUnsynced(r.day), false);
  assert.equal(m.adoptAnswer(d, { v: 2 }, c, "e-1"), null, "not a day answer");
  assert.equal(m.adoptAnswer(d, "<html>", c, "e-1"), null);
});

await test("adopting keeps every field an item came with, and an edit here sends them back unchanged", () => {
  const c = at("2026-11-19T10:00:00.000Z");
  const fromExpo = { id: "a-expo", title: "Pharmacy", subtitle: "", time: { hour: 17, minute: 0 }, icon: "medication", location: { lat: 41.1, lng: 16.87, radius: 150 }, nextYear: "kept", createdAt: c.now, updatedAt: c.now, deletedAt: null, doneOn: null, tickAt: null };
  const d = m.adoptAnswer(m.newDay(c), answer({ anchors: [fromExpo] }), c, "").day;
  const shown = m.dayView(d).anchors[0];
  assert.deepEqual([shown.flexMinutes, shown.category, shown.status], [30, "other", "upcoming"], "the screens see the defaults");
  assert.ok(!("flexMinutes" in d.anchors[0]) && !("category" in d.anchors[0]), "…but nothing is added to the item");
  // The anchors dialog saves what it shows: a new title, the defaults untouched.
  const edited = m.updateAnchor(d, "a-expo", { title: "Pharmacy run", subtitle: "", hour: 17, minute: 0, flexMinutes: shown.flexMinutes, category: shown.category }, plus(c, 1000));
  const sent = m.buildRequest(edited).anchors[0];
  assert.deepEqual(sent, { ...fromExpo, title: "Pharmacy run", updatedAt: plus(c, 1000).now });
  // A real choice of window or kind is sent.
  const chosen = m.updateAnchor(edited, "a-expo", { title: "Pharmacy run", subtitle: "", hour: 17, minute: 0, flexMinutes: 15, category: "move" }, plus(c, 2000));
  assert.deepEqual([chosen.anchors[0].flexMinutes, chosen.anchors[0].category, chosen.anchors[0].icon], [15, "move", "medication"]);
  // Unsafe keys never travel from an answer into the day.
  const tricky = JSON.parse(`{"id":"a-x","title":"x","subtitle":"","time":{"hour":1,"minute":0},"createdAt":"${c.now}","updatedAt":"${c.now}","deletedAt":null,"doneOn":null,"tickAt":null,"__proto__":{"polluted":true}}`);
  const t = m.adoptAnswer(m.newDay(c), answer({ anchors: [tricky] }), c, "").day.anchors[0];
  assert.equal(Object.prototype.hasOwnProperty.call(t, "__proto__"), false);
  assert.equal({}.polluted, undefined);
});

await test("check-ins are always replaced; Home's state follows only a newer one", () => {
  const c = at("2026-11-19T10:00:00.000Z");
  let d = m.recordCheckin(m.newDay(c), "green", 0.1, undefined, c);
  // The answer has ours plus a newer one from the phone.
  const phone = { at: "2026-11-19T10:05:00.000Z", state: "red", level: 0.9 };
  let r = m.adoptAnswer(d, answer({ checkins: [{ at: c.now, state: "green", level: 0.1 }, phone] }), plus(c, 6 * 60e3), "");
  assert.deepEqual(r.day.checkins.map((x) => x.state), ["green", "red"]);
  assert.equal(r.follow, true);
  assert.deepEqual([r.day.state, r.day.level], ["red", 0.9], "Home follows the phone");
  // An answer whose newest check-in is older than ours: the list is still replaced, the state stays.
  d = m.recordCheckin(r.day, "yellow", 0.5, undefined, plus(c, 10 * 60e3));
  r = m.adoptAnswer(d, answer({ checkins: [phone] }), plus(c, 11 * 60e3), "");
  assert.equal(r.follow, false);
  assert.deepEqual(r.day.checkins, [phone], "replaced, no exception (the server moved a future check-in, say)");
  assert.deepEqual([r.day.state, r.day.level], ["yellow", 0.5]);
});

await test("erased: the answer replaces everything, with no exception for items it doesn't mention", () => {
  const c = at("2026-11-19T10:00:00.000Z");
  let d = m.recordCheckin(m.addDump(m.addTask(m.newDay(c), "t-1", "Only here", "", c), "d-1", "a thought", c), "red", 1, undefined, c);
  d = m.removeTask(d, "mvd-1", c).day;
  d = { ...d, sync: { ...d.sync, gen: 1, rev: 9 } };
  const r = m.adoptAnswer(d, answer({ erased: true, gen: 2, rev: 10 }), plus(c, 1000), d.sync.edit);
  assert.deepEqual([r.day.tasks, r.day.anchors, r.day.dump, r.day.checkins], [[], [], [], []]);
  assert.deepEqual(r.day.sync.gone, { anchors: [], tasks: [], dump: [] });
  assert.deepEqual([r.day.state, r.day.level, r.day.sync.gen], [null, null, 2]);
  const req = m.buildRequest(r.day);
  assert.equal(req.gen, 2, "the next sync sends the new gen");
});

await test("an older answer than one another tab took adds nothing; the switch forgets gen when it goes on again", () => {
  const c = at("2026-11-19T10:00:00.000Z");
  const d = { ...m.newDay(c), sync: { ...m.emptySync(), gen: 2, rev: 7 } };
  assert.equal(m.isOlderAnswer(answer({ gen: 2, rev: 6 }), d), true);
  assert.equal(m.isOlderAnswer(answer({ gen: 1, rev: 99 }), d), true);
  assert.equal(m.isOlderAnswer(answer({ gen: 2, rev: 7 }), d), false);
  assert.equal(m.isOlderAnswer(answer({ gen: 3, rev: 0 }), d), false);
  const off = m.setSyncEnabled(d, false);
  assert.deepEqual([off.sync.enabled, off.sync.gen], [false, 2]);
  const on = m.setSyncEnabled({ ...off, sync: { ...off.sync, syncedAt: c.now, last: { at: c.now, result: "ok" } } }, true);
  assert.deepEqual([on.sync.enabled, on.sync.gen, on.sync.rev, on.sync.syncedAt, on.sync.last], [true, 0, 0, null, null]);
  assert.equal(m.buildRequest(on).gen, undefined, "a first sync sends no gen");
});

// ---- a round trip through the server's own merge ---------------------------------------------

// The server's merge (dayMerge.js), standing in for POST /api/me/day/sync.
function serverFor() {
  let state = { gen: 1, rev: 0, sections: server.emptySections() };
  let checkins = [];
  return {
    sync(body, nowMs) {
      const req = server.normalizeRequest(clone(body), nowMs);
      if (req.gen > 0 && req.gen < state.gen) return clone(server.dayBody(state, checkins.slice(-200), nowMs, true));
      const sections = server.mergeSections(state.sections, req.sections);
      const merged = req.checkins ? server.mergeCheckins(checkins, req.checkins) : checkins;
      const changed = !server.sameSections(sections, state.sections) || JSON.stringify(merged) !== JSON.stringify(checkins);
      if (changed) state = { gen: state.gen, rev: state.rev + 1, sections };
      checkins = merged;
      return clone(server.dayBody(state, checkins.slice(-200), nowMs, false));
    },
    erase() {
      state = { gen: state.gen + 1, rev: state.rev + 1, sections: server.emptySections() };
      checkins = [];
    },
    get state() {
      return state;
    },
  };
}

await test("two browsers through the server's merge: they agree, and syncing again changes nothing", () => {
  const srv = serverFor();
  const c = at("2026-11-19T10:00:00.000Z");
  const sync = (day, cl) => {
    const res = srv.sync(m.buildRequest(day), cl.ms);
    return m.adoptAnswer(day, res, cl, day.sync.edit).day;
  };
  // A: an old save joins the account. B: a new install.
  let A = sync(m.readSave(clone(OLD), c).day, c);
  let B = sync(m.newDay(plus(c, 1000)), plus(c, 1000));
  assert.deepEqual(m.dayView(B).tasks.map((t) => [t.id, t.title]), m.dayView(A).tasks.map((t) => [t.id, t.title]), "B has A's minimum day; the starters merged into one copy");
  assert.deepEqual(m.dayView(B).dump, m.dayView(A).dump);
  // Edits on both sides.
  const cA = plus(c, 60e3);
  A = m.updateAnchor(A, "a-1", { title: "Lunch, away from the desk", subtitle: "Away from the screen", hour: 12, minute: 45, flexMinutes: 30, category: "break" }, cA);
  A = m.removeTask(A, "t-abc", cA).day;
  A = m.recordCheckin(A, "green", 0.2, undefined, cA);
  const cB = plus(c, 61e3);
  B = m.toggleTask(B, "mvd-2", cB);
  B = m.addDump(B, "d-b", "book the cryostat", cB);
  A = sync(A, plus(c, 62e3));
  B = sync(B, plus(c, 63e3));
  A = sync(A, plus(c, 64e3));
  const vA = m.dayView(A);
  const vB = m.dayView(B);
  assert.deepEqual(vA, vB, "both show the same day");
  assert.equal(vB.anchors[0].title, "Lunch, away from the desk");
  assert.ok(!ids(vB.tasks).includes("t-abc"));
  assert.equal(vA.tasks.find((t) => t.id === "mvd-2").done, true, "B's tick reached A");
  assert.deepEqual(vA.dump.map((x) => x.id), ["d-b", "d-1"]);
  assert.deepEqual([vB.state, vB.level], ["green", 0.2], "B followed A's newer check-in");
  // Idempotent: the same body again stores nothing new.
  const rev = srv.state.rev;
  A = sync(A, plus(c, 65e3));
  B = sync(B, plus(c, 66e3));
  assert.equal(srv.state.rev, rev, "nothing changed on the server");
  // Delete and Undo on A reach B with their content.
  A = m.removeTask(A, "mvd-1", plus(c, 70e3)).day;
  const removed = m.buildRequest(A).tasks.find((t) => t.id === "mvd-1");
  assert.ok(removed.deletedAt);
  A = sync(A, plus(c, 71e3));
  B = sync(B, plus(c, 72e3));
  assert.ok(!ids(B.tasks).includes("mvd-1"), "the deletion reached B");
  assert.equal(JSON.stringify(srv.state.sections.tasks).includes("Stay hydrated"), false, "the server keeps no content for it");
  const back = { id: "mvd-1", title: "Stay hydrated", subtitle: "2 glasses left", createdAt: EPOCH, updatedAt: EPOCH, doneOn: "2026-11-19", tickAt: c.now };
  A = sync(m.restoreTask(A, back, plus(c, 73e3)), plus(c, 74e3));
  B = sync(B, plus(c, 75e3));
  assert.equal(B.tasks.find((t) => t.id === "mvd-1")?.title, "Stay hydrated", "Undo brought it back everywhere");
});

await test("an anchor made through the API with icon and location survives an edit here, through the server's merge", () => {
  const srv = serverFor();
  const c = at("2026-11-19T10:00:00.000Z");
  srv.sync({ v: 1, anchors: [{ id: "a-expo", title: "Pharmacy", subtitle: "", time: { hour: 17, minute: 0 }, icon: "medication", location: { lat: 41.1, lng: 16.87, radius: 150 }, createdAt: c.now, updatedAt: c.now, deletedAt: null, doneOn: null, tickAt: null }] }, c.ms);
  const sync = (day, cl) => m.adoptAnswer(day, srv.sync(m.buildRequest(day), cl.ms), cl, day.sync.edit).day;
  let W = sync(m.newDay(c), plus(c, 1000));
  const shown = m.dayView(W).anchors[0];
  W = m.updateAnchor(W, "a-expo", { title: "Pharmacy before six", subtitle: shown.subtitle, hour: 17, minute: 30, flexMinutes: shown.flexMinutes, category: shown.category }, plus(c, 2000));
  W = sync(W, plus(c, 3000));
  const stored = srv.state.sections.anchors[0];
  assert.deepEqual(
    [stored.title, stored.time, stored.icon, stored.location, "flexMinutes" in stored, "category" in stored],
    ["Pharmacy before six", { hour: 17, minute: 30 }, "medication", { lat: 41.1, lng: 16.87, radius: 150 }, false, false],
  );
  const { deletedAt, ...live } = stored;
  assert.equal(deletedAt, null);
  assert.deepEqual(W.anchors[0], live, "this browser holds exactly the server's copy");
});

await test("an erase elsewhere: the stale browser's day is replaced; switched off then on, it adds its day back", () => {
  const srv = serverFor();
  const c = at("2026-11-19T10:00:00.000Z");
  const sync = (day, cl) => m.adoptAnswer(day, srv.sync(m.buildRequest(day), cl.ms), cl, day.sync.edit).day;
  let W = sync(m.addDump(m.newDay(c), "d-1", "a thought", c), plus(c, 1000));
  assert.equal(W.sync.gen, 1);
  srv.erase();
  W = sync(m.addDump(W, "d-2", "made before it heard", plus(c, 2000)), plus(c, 3000));
  assert.deepEqual([W.dump, W.tasks, W.sync.gen], [[], [], 2], "erased everywhere means here too");
  // Another device's day, switched off during an erase: on again sends no gen, so its day is added back.
  srv.erase();
  let off = m.setSyncEnabled(m.addDump({ ...m.newDay(c), sync: { ...m.emptySync(), gen: 2 } }, "d-3", "kept while off", c), false);
  off = m.setSyncEnabled(off, true);
  const back = sync(off, plus(c, 4000));
  assert.deepEqual(back.dump.map((x) => x.text), ["kept while off"]);
  assert.equal(back.sync.gen, 3);
});

// ---- the brain dump → minimum day (§8 "Text limits") -------------------------------------------

await test("brain dump → minimum day: a line that fits moves; a longer one stays whole in the dump, and the server keeps both", () => {
  const srv = serverFor();
  const c = at("2026-11-19T10:00:00.000Z");
  const thought =
    "Email Milena about the SPAD array calibration: ask whether the new beam splitter arrived, whether Friday's coincidence run can move to Monday, and who keeps the lab key over the weekend.";
  let d = m.addDump(m.addDump(m.newDay(c), "d-short", "Order the SPAD cable", c), "d-long", thought, plus(c, 1));
  const long = m.moveDumpToTask(d, "d-long", "t-long", plus(c, 1000));
  assert.equal(long.kept, true, "kept: the panel says the full note stays");
  assert.equal(long.title, "Email Milena about the SPAD array calibration: ask whether the new beam splitter arrived, whether Friday's coincidence…", "whole words and an ellipsis (the same as the phone)");
  assert.ok(long.title.length <= m.TITLE_MAX);
  assert.equal(long.day.tasks.at(-1).title, long.title);
  assert.equal(m.shortTitle("x".repeat(300), 120), `${"x".repeat(119)}…`, "one long word: cut, never more than the limit");
  assert.equal(m.shortTitle("  fits   as it is ", 120), "fits as it is");
  assert.equal(long.day.dump.find((x) => x.id === "d-long")?.text, thought, "the whole line stays in the dump");
  assert.deepEqual(long.day.sync.gone.dump, []);
  const short = m.moveDumpToTask(long.day, "d-short", "t-short", plus(c, 2000));
  assert.equal(short.kept, false);
  assert.equal(short.day.tasks.at(-1).title, "Order the SPAD cable");
  assert.equal(short.day.dump.some((x) => x.id === "d-short"), false, "a line that fits leaves the dump");
  assert.deepEqual(ids(short.day.sync.gone.dump), ["d-short"]);
  assert.equal(m.moveDumpToTask(short.day, "d-gone", "t-x", c), null, "nothing to move");
  // Through the server's merge: nothing is cut on the way, the end of the thought is still kept.
  d = m.adoptAnswer(short.day, srv.sync(m.buildRequest(short.day), plus(c, 3000).ms), plus(c, 3000), short.day.sync.edit).day;
  assert.equal(srv.state.sections.tasks.find((x) => x.id === "t-long").title, long.title);
  assert.equal(srv.state.sections.dump.find((x) => x.id === "d-long").text, thought);
  assert.deepEqual([d.tasks.find((x) => x.id === "t-long").title, d.dump.find((x) => x.id === "d-long").text], [long.title, thought]);
});

// ---- whose day it is: the account label -----------------------------------------------------------

await test("an adopted answer labels the day with its account; the label survives storage and every local change", () => {
  const c = at("2026-11-19T10:00:00.000Z");
  assert.equal(m.emptySync().account, null);
  assert.equal(m.newDay(c).sync.account, null, "a new day is nobody's until its first sync");
  let d = m.adoptAnswer(m.newDay(c), answer(), c, "", "acct-a").day;
  assert.equal(d.sync.account, "acct-a");
  d = m.markEdited(m.addTask(d, "t-1", "Read one page", "", plus(c, 1000)), c.today, "e-1");
  d = m.setSyncEnabled(m.setSyncEnabled(d, false), true);
  d = m.noteResult(d, "offline", plus(c, 2000));
  assert.equal(d.sync.account, "acct-a");
  assert.equal(m.readSave(clone(d), c).day.sync.account, "acct-a");
  assert.equal(m.adoptAnswer(d, answer(), plus(c, 3000), "e-1").day.sync.account, "acct-a", "an adopt without an account keeps the label");
  for (const bad of [42, "", null, { id: 1 }]) assert.equal(m.readSave({ ...clone(d), sync: { ...clone(d).sync, account: bad } }, c).day.sync.account, null);
});

// ---- the Settings line -----------------------------------------------------------------------

await test("the line under the switch", () => {
  const now = new Date(2026, 10, 19, 14, 30);
  const base = { enabled: true, syncing: false, last: null, syncedAt: null, now, clock24: true };
  const text = (over) => m.syncStatus({ ...base, ...over }).text;
  assert.equal(text({ enabled: false }), "Off. Your day stays in this browser.");
  assert.equal(text({}), "Not synced yet.");
  assert.equal(text({ syncing: true }), "Syncing…");
  const today = new Date(2026, 10, 19, 14, 5).toISOString();
  assert.equal(text({ syncedAt: today, last: { at: today, result: "ok" } }), "Synced at 14:05.");
  assert.equal(text({ syncedAt: today, last: { at: today, result: "ok" }, clock24: false }), "Synced at 2:05 PM.");
  assert.equal(text({ syncedAt: today, last: { at: today, result: "ok" }, syncing: true }), "Synced at 14:05.", "no flicker while the next one runs");
  const before = new Date(2026, 10, 18, 9, 0).toISOString();
  assert.equal(text({ syncedAt: before, last: { at: before, result: "ok" } }), "Synced on 18 Nov at 09:00.");
  assert.match(text({ syncedAt: before, last: { at: today, result: "offline" } }), /^Can’t reach your server right now\. Your day is saved in this browser/);
  assert.match(text({ last: { at: today, result: "error" } }), /^The server didn’t take the sync this time\./);
  assert.match(text({ last: { at: today, result: "unsupported" } }), /^This server doesn’t keep the day yet/);
  // After a 401 the line never says "Synced at …": signing in again is what resumes it.
  assert.equal(text({ syncedAt: before, last: { at: today, result: "ended" } }), "Your session has ended. Sign in again and your day syncs again.");
  assert.match(text({ syncedAt: before, last: { at: today, result: "stopped" } }), /^Sync stopped: your server refused the day\. It tries again the next time you open the app\./);
  // Both are read back from storage (any tab's line shows them).
  for (const result of ["ended", "stopped"]) {
    const saved = { ...m.newDay(at("2026-11-19T10:00:00.000Z")), sync: { ...m.emptySync(), last: { at: "2026-11-19T10:00:00.000Z", result } } };
    assert.equal(m.readSave(clone(saved), at("2026-11-19T10:00:00.000Z")).day.sync.last?.result, result);
  }
  for (const r of ["error", "ended", "stopped"]) assert.ok(!text({ last: { at: today, result: r } }).includes("!"), "no exclamation marks");
  for (const s of ["Off. Your day stays in this browser.", text({ last: { at: today, result: "error" } })]) assert.ok(!s.includes("!"), "no exclamation marks");
});

console.log(failed ? `\n✗ ${failed} of ${passed + failed} checks failed` : `\n✓ all ${passed} checks passed`);
process.exit(failed ? 1 : 0);

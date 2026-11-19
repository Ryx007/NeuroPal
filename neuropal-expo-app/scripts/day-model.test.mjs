// Day sync on the phone (docs/DAY-SYNC.md): the pure model and every reducer
// that changes the day, run through the real slices.
//   cd neuropal-expo-app && node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/day-model.test.mjs
import assert from "node:assert/strict";
import { createRequire, register } from "node:module";
import { mock, test } from "node:test";

import { configureStore } from "@reduxjs/toolkit";

import {
  EPOCH,
  TEXT_MAX,
  TOMBSTONE_CAP,
  buildSyncBody,
  canonical,
  cleanText,
  describeDaySync,
  later,
  localDate,
  ownerStep,
} from "../src/services/dayModel.js";
import homeReducer, * as H from "../src/store/slices/homeSlice.js";
import palReducer, * as P from "../src/store/slices/palSlice.js";
import { buildSnapshot } from "../src/widgets/model.js";

// ---- helpers ----------------------------------------------------------------

const DAY1 = "2026-11-19";
const DAY2 = "2026-11-20";
const NOW = "2026-11-19T17:20:00.000Z";
// A starter deleted before sync (contract §8 "Old saves"): beats an untouched
// starter, never a real edit.
const STARTER_GONE = "1970-01-01T00:00:00.001Z";
const t = (offsetMs, base = NOW) => new Date(Date.parse(base) + offsetMs).toISOString();

// An action from the real action creator (its payload shape and id), at a
// chosen moment.
function at(action, now = NOW, today = DAY1) {
  return { ...action, meta: { ...(action.meta || {}), now, today } };
}

const freshHome = (today = DAY1) => homeReducer(undefined, at(H.refreshDay(), NOW, today));
const freshPal = () => palReducer(undefined, { type: "@@init" });
const run = (state, ...actions) => actions.reduce((s, a) => homeReducer(s, a), state);
const byId = (list, id) => list.find((x) => x.id === id);

// A home slice exactly as 0.3.0 saved it ("np.home.v2", no stamps).
function save030({ dayStamp = DAY1 } = {}) {
  return {
    nervousState: "yellow",
    nervousLevel: 0.52,
    checkins: [
      { state: "green", level: 0.2, at: "2026-11-19T07:00:00.000Z" },
      { state: "yellow", level: 0.52, at: "2026-11-19T10:05:00.000Z" },
    ],
    tasks: [
      { id: "mvd-1", title: "Stay hydrated", subtitle: "2 glasses left", done: true },
      { id: "mvd-2", title: "Take meds", subtitle: "Morning dosage", done: false },
      { id: "mvd-3", title: "Walk to the lab", subtitle: "10 minutes outside", done: false }, // renamed starter
      { id: "t-m3x9-1", title: "Read one page", done: true },
      { id: "t-m3x9-2", title: "Email Milena", done: false },
    ],
    anchors: [
      { id: "a-1", title: "Morning meds", subtitle: "Blue, with water", time: { hour: 8, minute: 15 }, status: "done", icon: "medication" },
      { id: "a-2", title: "Lunch Break", subtitle: "Reset cognitive load and hydrate.", time: { hour: 13, minute: 0 }, status: "current", icon: "restaurant" }, // moved
      { id: "a-3", title: "Work Start", subtitle: "Quiet focus block with low stimulation.", time: { hour: 14, minute: 0 }, status: "pending", icon: "work-history" },
      { id: "a-m3xa-1", title: "Physio", subtitle: "", time: { hour: 17, minute: 30 }, status: "done", icon: "flag", location: { lat: 41.1, lng: 16.8, radius: 150 } },
    ],
    todos: [
      { id: "td-1", title: "Email the lab about the SPAD array", done: false },
      { id: "td-2", title: "Book the room", done: true },
    ],
    dayStamp,
  };
}

const pal030 = {
  bubbleHidden: false,
  dump: [
    { id: "d-2", text: "Order the SPAD cable", at: "2026-11-19T10:06:00.000Z" },
    { id: "d-1", text: "Ask about the beam splitter", at: "2026-11-19T10:05:00.000Z" },
  ],
  chat: [],
  sit: null,
  sits: [],
};

// ---- old saves ---------------------------------------------------------------

test("a 0.3.0 save keeps every item, and gets the contract's stamps", () => {
  const s = homeReducer(undefined, at(H.hydrateHome(save030())));
  assert.equal(s.tasks.length, 5);
  assert.equal(s.anchors.length, 4);
  assert.equal(s.todos.length, 2);
  assert.equal(s.checkins.length, 2);
  assert.equal(s.nervousState, "yellow");
  assert.equal(s.nervousLevel, 0.52);

  // untouched starters → 1970; a renamed starter is not untouched
  assert.equal(byId(s.tasks, "mvd-1").createdAt, EPOCH);
  assert.equal(byId(s.tasks, "mvd-2").updatedAt, EPOCH);
  assert.equal(byId(s.tasks, "mvd-3").createdAt, NOW);
  // everything else: now, one millisecond apart in the order shown
  assert.deepEqual(
    s.tasks.map((x) => x.createdAt),
    [EPOCH, EPOCH, t(0), t(1), t(2)]
  );
  assert.deepEqual(s.todos.map((x) => x.createdAt), [t(0), t(1)]);
  assert.deepEqual(s.todos.map((x) => x.updatedAt), [t(0), t(1)]);

  // ticked today → doneOn today + tickAt now; not ticked → no tick
  assert.equal(byId(s.tasks, "mvd-1").doneOn, DAY1);
  assert.equal(byId(s.tasks, "mvd-1").tickAt, NOW);
  assert.equal(byId(s.tasks, "mvd-1").done, true);
  assert.equal(byId(s.tasks, "t-m3x9-2").doneOn, null);
  assert.equal(byId(s.tasks, "t-m3x9-2").tickAt, null);

  // anchors: a moved starter is an edit; legacy statuses are "not done"
  assert.equal(byId(s.anchors, "a-1").createdAt, EPOCH);
  assert.equal(byId(s.anchors, "a-1").status, "done");
  assert.equal(byId(s.anchors, "a-2").createdAt, NOW);
  assert.equal(byId(s.anchors, "a-2").status, "upcoming");
  assert.equal(byId(s.anchors, "a-3").createdAt, EPOCH);
  assert.equal(byId(s.anchors, "a-3").status, "upcoming");
  assert.equal(byId(s.anchors, "a-m3xa-1").doneOn, DAY1);
  assert.deepEqual(byId(s.anchors, "a-m3xa-1").location, { lat: 41.1, lng: 16.8, radius: 150 });
  for (const a of s.anchors) assert.ok(["done", "upcoming"].includes(a.status));

  // to-dos keep `done` (it is part of a to-do, not a daily tick)
  assert.equal(byId(s.todos, "td-2").done, true);

  // sync starts on, never synced, nobody's yet. The save has no starter
  // anchor a-4: the person deleted it before tombstones existed, so the
  // deletion is recorded (or another phone's 1970 a-4 would bring it back).
  assert.deepEqual(s.sync, {
    enabled: true,
    gen: 0,
    owner: null,
    gone: { tasks: [], anchors: [{ id: "a-4", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: STARTER_GONE }], todos: [] },
    lastSyncAt: null,
  });
  assert.equal(s.dayStamp, DAY1);
});

test("a starter deleted before sync is sent as a deletion, and only for old saves", () => {
  const old = save030();
  old.tasks = old.tasks.filter((x) => x.id !== "mvd-2");
  const s = homeReducer(undefined, at(H.hydrateHome(old)));
  assert.deepEqual(s.sync.gone.tasks, [{ id: "mvd-2", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: STARTER_GONE }]);
  assert.equal(byId(s.tasks, "mvd-2"), undefined);
  // The tombstone wins over a 1970 starter on the server (deletedAt >= updatedAt),
  // and its stamp doesn't depend on when this phone migrated.
  const body = buildSyncBody(s, freshPal());
  assert.ok(body.tasks.some((x) => x.id === "mvd-2" && x.deletedAt === STARTER_GONE && x.title === undefined));
  const migratedLater = homeReducer(undefined, at(H.hydrateHome(old), "2026-12-01T09:00:00.000Z", "2026-12-01"));
  assert.deepEqual(migratedLater.sync.gone.tasks, s.sync.gone.tasks);
  // A save that already syncs, or one with no task list at all, adds none.
  const again = homeReducer(undefined, at(H.hydrateHome(JSON.parse(JSON.stringify(H.persistedHome(s))))));
  assert.equal(again.sync.gone.tasks.length, 1, "hydrating again adds no second tombstone");
  const bare = homeReducer(undefined, at(H.hydrateHome({ dayStamp: DAY1 })));
  assert.deepEqual(bare.sync.gone, { tasks: [], anchors: [], todos: [] });
});

test("a 0.3.0 save from yesterday: its ticks don't count today (as before)", () => {
  const s = homeReducer(undefined, at(H.hydrateHome(save030({ dayStamp: "2026-11-18" }))));
  for (const x of s.tasks) {
    assert.equal(x.done, false);
    assert.equal(x.doneOn, null);
  }
  for (const a of s.anchors) assert.equal(a.status, "upcoming");
});

test("hydrating a migrated save again changes nothing", () => {
  const once = homeReducer(undefined, at(H.hydrateHome(save030())));
  const stored = JSON.parse(JSON.stringify(H.persistedHome(once)));
  const twice = homeReducer(undefined, at(H.hydrateHome(stored), t(3600e3)));
  assert.equal(canonical(H.persistedHome(twice)), canonical(H.persistedHome(once)));
});

test("an old save without check-ins, to-dos or anchors still loads", () => {
  const s = homeReducer(undefined, at(H.hydrateHome({ tasks: [{ id: "mvd-1", title: "Stay hydrated", done: false }], dayStamp: DAY1 })));
  assert.deepEqual(s.checkins, []);
  assert.deepEqual(s.todos, []);
  assert.equal(s.anchors.length, 4); // the starters, as before
  assert.equal(s.tasks.length, 1);
});

test("a tick is doneOn + tickAt together (the server's rule), on load and on adopt", () => {
  const saved = { tasks: [{ id: "t-1", title: "x", createdAt: NOW, updatedAt: NOW, doneOn: DAY1, tickAt: null }], dayStamp: DAY1 };
  const s = homeReducer(undefined, at(H.hydrateHome(saved)));
  assert.equal(s.tasks[0].doneOn, null);
  assert.equal(s.tasks[0].done, false);
  const answer = { v: 1, gen: 1, tasks: [{ id: "t-2", title: "y", createdAt: NOW, updatedAt: NOW, deletedAt: null, doneOn: DAY1 }] };
  const after = homeReducer(s, at(H.adoptDay(answer)));
  assert.equal(after.tasks.find((x) => x.id === "t-2").done, false);
  // an untick (doneOn null with its tickAt) stays an untick
  const untick = homeReducer(s, at(H.adoptDay({ v: 1, tasks: [{ id: "t-3", title: "z", createdAt: NOW, updatedAt: NOW, deletedAt: null, doneOn: null, tickAt: NOW }] })));
  assert.equal(untick.tasks.find((x) => x.id === "t-3").tickAt, NOW);
});

test("Pal's 0.3.0 brain dump keeps every line", () => {
  const p = palReducer(freshPal(), P.hydratePal(pal030));
  assert.deepEqual(p.dump.map((d) => d.text), ["Order the SPAD cable", "Ask about the beam splitter"]);
  assert.deepEqual(p.dumpGone, []);
});

test("new installs seed starters with the 1970 stamps and no ticks", () => {
  const s = freshHome();
  assert.deepEqual(s.tasks.map((x) => x.id), ["mvd-1", "mvd-2", "mvd-3"]);
  assert.deepEqual(s.anchors.map((x) => x.id), ["a-1", "a-2", "a-3", "a-4"]);
  for (const x of [...s.tasks, ...s.anchors]) {
    assert.equal(x.createdAt, EPOCH);
    assert.equal(x.updatedAt, EPOCH);
    assert.equal(x.doneOn, null);
    assert.equal(x.tickAt, null);
  }
  for (const a of s.anchors) assert.equal(a.status, "upcoming");
});

// ---- stamping on every reducer path ------------------------------------------

test("tasks: add, tick, untick, rename, remove", () => {
  let s = freshHome();
  s = run(s, at(H.addTask("  Read one page  ")));
  const id = s.tasks[3].id;
  assert.deepEqual(
    { ...s.tasks[3], id: "x" },
    { id: "x", title: "Read one page", done: false, createdAt: NOW, updatedAt: NOW, doneOn: null, tickAt: null }
  );
  s = run(s, at(H.toggleTask(id), t(1000)));
  assert.equal(byId(s.tasks, id).done, true);
  assert.equal(byId(s.tasks, id).doneOn, DAY1);
  assert.equal(byId(s.tasks, id).tickAt, t(1000));
  assert.equal(byId(s.tasks, id).updatedAt, NOW, "a tick is not an edit");
  s = run(s, at(H.toggleTask(id), t(2000)));
  assert.equal(byId(s.tasks, id).done, false);
  assert.equal(byId(s.tasks, id).doneOn, null);
  assert.equal(byId(s.tasks, id).tickAt, t(2000), "unticking is a tick too");
  s = run(s, at(H.renameTask({ id, title: "Read two pages" }), t(3000)));
  assert.equal(byId(s.tasks, id).updatedAt, t(3000));
  const same = run(s, at(H.renameTask({ id, title: "Read two pages" }), t(4000)));
  assert.equal(byId(same.tasks, id).updatedAt, t(3000), "same title: not an edit");
  s = run(s, at(H.removeTask(id), t(5000)));
  assert.equal(byId(s.tasks, id), undefined);
  assert.deepEqual(s.sync.gone.tasks, [{ id, createdAt: NOW, updatedAt: t(3000), deletedAt: t(5000) }]);
  // the empty add stays a no-op
  assert.equal(run(s, at(H.addTask("   "))).tasks.length, s.tasks.length);
});

test("anchors: add, edit, tick, remove; fields this app doesn't use survive", () => {
  let s = freshHome();
  s = run(s, at(H.addAnchor({ title: "Physio", subtitle: "", hour: 17, minute: 30, icon: "flag", location: null })));
  const id = s.anchors[s.anchors.length - 1].id;
  const a0 = byId(s.anchors, id);
  assert.equal(a0.createdAt, NOW);
  assert.equal(a0.status, "upcoming");
  assert.equal(a0.doneOn, null);

  // another client's fields on the item (as adopted from the server)
  s = { ...s, anchors: s.anchors.map((a) => (a.id === id ? { ...a, category: "move", flexMinutes: 30, futureField: { x: 1 } } : a)) };

  // the editor saved without a change is not an edit
  const unchanged = run(s, at(H.updateAnchor({ id, title: "Physio", subtitle: "", hour: 17, minute: 30, icon: "flag", location: null }), t(1000)));
  assert.equal(byId(unchanged.anchors, id).updatedAt, NOW);

  s = run(s, at(H.updateAnchor({ id, title: "Physio", subtitle: "Knee", hour: 18, minute: 0, icon: "flag", location: null }), t(2000)));
  const a1 = byId(s.anchors, id);
  assert.equal(a1.updatedAt, t(2000));
  assert.deepEqual(a1.time, { hour: 18, minute: 0 });
  assert.equal(a1.category, "move");
  assert.equal(a1.flexMinutes, 30);
  assert.deepEqual(a1.futureField, { x: 1 });

  s = run(s, at(H.setAnchorStatus({ id, status: "done" }), t(3000)));
  assert.equal(byId(s.anchors, id).status, "done");
  assert.equal(byId(s.anchors, id).doneOn, DAY1);
  assert.equal(byId(s.anchors, id).tickAt, t(3000));
  assert.equal(byId(s.anchors, id).updatedAt, t(2000), "a tick is not an edit");
  const again = run(s, at(H.setAnchorStatus({ id, status: "done" }), t(4000)));
  assert.equal(byId(again.anchors, id).tickAt, t(3000), "done twice: one tick");
  s = run(s, at(H.setAnchorStatus({ id, status: "upcoming" }), t(5000)));
  assert.equal(byId(s.anchors, id).status, "upcoming");
  assert.equal(byId(s.anchors, id).doneOn, null);
  assert.equal(byId(s.anchors, id).tickAt, t(5000));

  s = run(s, at(H.removeAnchor(id), t(6000)));
  assert.equal(byId(s.anchors, id), undefined);
  assert.deepEqual(s.sync.gone.anchors, [{ id, createdAt: NOW, updatedAt: t(2000), deletedAt: t(6000) }]);
});

test("anchors stay sorted by time of day (then id, like the server)", () => {
  let s = freshHome();
  s = run(s, at(H.addAnchor({ title: "Early", hour: 6, minute: 0 })), at(H.addAnchor({ title: "Late", hour: 22, minute: 0 })));
  const mins = s.anchors.map((a) => a.time.hour * 60 + a.time.minute);
  assert.deepEqual(mins, [...mins].sort((a, b) => a - b));
  const early = s.anchors[0].id;
  s = run(s, at(H.updateAnchor({ id: early, hour: 23, minute: 0 }), t(1000)));
  assert.equal(s.anchors[s.anchors.length - 1].id, early);
});

test("to-dos: add, toggle (an edit), remove, clear done", () => {
  let s = freshHome();
  s = run(s, at(H.addTodo("Email the lab")), at(H.addTodo("Book the room"), NOW));
  const [a, b] = s.todos.map((x) => x.id);
  assert.equal(s.todos[0].createdAt, NOW);
  assert.ok(Date.parse(s.todos[1].createdAt) > Date.parse(s.todos[0].createdAt), "a new to-do lands last");
  s = run(s, at(H.toggleTodo(b), t(1000)));
  assert.equal(byId(s.todos, b).done, true);
  assert.equal(byId(s.todos, b).updatedAt, t(1000));
  s = run(s, at(H.removeTodo(a), t(2000)));
  assert.deepEqual(s.todos.map((x) => x.id), [b]);
  s = run(s, at(H.clearDoneTodos(), t(3000)));
  assert.deepEqual(s.todos, []);
  assert.deepEqual(
    s.sync.gone.todos.map((x) => [x.id, x.deletedAt]),
    [
      [a, t(2000)],
      [b, t(3000)],
    ]
  );
  for (const tomb of s.sync.gone.todos) assert.equal(tomb.title, undefined, "a tombstone carries no content");
});

test("brain dump: add, delete leaves a tombstone, Undo writes it again under a new id", () => {
  let p = palReducer(freshPal(), P.addDump("  Order   the cable "));
  const first = p.dump[0];
  assert.equal(first.text, "Order the cable");
  p = palReducer(p, at(P.removeDump(first.id), t(1000)));
  assert.deepEqual(p.dump, []);
  assert.deepEqual(p.dumpGone, [{ id: first.id, deletedAt: t(1000) }]);
  p = palReducer(p, P.addDump(first.text)); // PalSheet's Undo
  assert.equal(p.dump.length, 1);
  assert.notEqual(p.dump[0].id, first.id);
  assert.equal(p.dump[0].text, first.text);
  assert.deepEqual(p.dumpGone.map((d) => d.id), [first.id]);
  // deleting something that isn't there changes nothing
  assert.equal(palReducer(p, P.removeDump("nope")), p);
  // the tombstones are persisted with the dump
  assert.deepEqual(P.persistedPal(p).dumpGone, p.dumpGone);
  const back = palReducer(freshPal(), P.hydratePal(JSON.parse(JSON.stringify(P.persistedPal(p)))));
  assert.deepEqual(back.dumpGone, p.dumpGone);
});

test("check-ins behave as before (refine within 60 s, a late widget tap joins in order)", () => {
  let s = freshHome();
  s = run(s, H.recordCheckin({ state: "green", level: 0.1, at: "2026-11-19T10:00:00.000Z" }));
  s = run(s, H.recordCheckin({ state: "yellow", level: 0.5, at: "2026-11-19T10:00:30.000Z" }));
  assert.equal(s.checkins.length, 1);
  assert.equal(s.nervousState, "yellow");
  s = run(s, H.recordCheckin({ state: "red", level: 0.9, at: "2026-11-19T09:00:00.000Z" }));
  assert.deepEqual(s.checkins.map((c) => c.state), ["red", "yellow"]);
  assert.equal(s.nervousState, "yellow", "an older check-in doesn't change the state");
});

test("an edit, tick or delete always lands after the stamp it replaces (fast clock elsewhere)", () => {
  const future = "2026-11-19T18:00:00.000Z"; // another device ran 40 min ahead
  let s = freshHome();
  s = { ...s, todos: [{ id: "td-x", title: "From the laptop", done: false, createdAt: future, updatedAt: future }] };
  s = run(s, at(H.toggleTodo("td-x")));
  assert.equal(byId(s.todos, "td-x").updatedAt, later(NOW, future));
  assert.ok(Date.parse(byId(s.todos, "td-x").updatedAt) > Date.parse(future));
  s = run(s, at(H.removeTodo("td-x")));
  const tomb = s.sync.gone.todos[0];
  assert.ok(Date.parse(tomb.deletedAt) >= Date.parse(tomb.updatedAt), "the delete holds (§5: deletedAt >= updatedAt)");
});

// ---- tombstones and Undo -------------------------------------------------------

test("tombstones: one per id, the newest 3000 kept (like the server)", () => {
  assert.equal(TOMBSTONE_CAP, 3000);
  const kept = Array.from({ length: TOMBSTONE_CAP }, (_, i) => ({ id: `old-${i}`, createdAt: EPOCH, updatedAt: EPOCH, deletedAt: t(-1e6 + i) }));
  const todos = Array.from({ length: 20 }, (_, i) => ({ id: `td-${i}`, title: `n${i}`, done: false, createdAt: t(i), updatedAt: t(i) }));
  let s = freshHome();
  s = { ...s, todos, sync: { ...s.sync, gone: { ...s.sync.gone, todos: kept } } };
  for (let i = 0; i < todos.length; i += 1) s = run(s, at(H.removeTodo(`td-${i}`), t(10000 + i)));
  s = run(s, at(H.removeTodo("td-0"), t(20000))); // already gone: no second tombstone
  assert.equal(s.sync.gone.todos.length, TOMBSTONE_CAP);
  assert.equal(s.sync.gone.todos[0].id, "old-20", "the oldest went first");
  assert.equal(s.sync.gone.todos.at(-1).id, "td-19");
  assert.equal(new Set(s.sync.gone.todos.map((x) => x.id)).size, TOMBSTONE_CAP);
});

test("\"Clear done\" on a long to-do list: after the sync none of them comes back", () => {
  const serverNow = Date.parse(NOW) + 60e3;
  const syncWith = (stored, home, pal) => {
    const req = dayMerge.normalizeRequest(JSON.parse(JSON.stringify(buildSyncBody(home, pal))), serverNow);
    const sections = dayMerge.mergeSections(stored, req.sections);
    return { sections, answer: JSON.parse(JSON.stringify(dayMerge.dayBody({ gen: 1, rev: 1, sections }, [], serverNow, false))) };
  };
  const todos = Array.from({ length: 900 }, (_, i) => ({ id: `td-${i}`, title: `Done thing ${i}`, done: true, createdAt: t(i), updatedAt: t(i) }));
  // 2400 older deletions are already kept: with the old cap of 500 most new ones would be dropped.
  const older = Array.from({ length: 2400 }, (_, i) => ({ id: `old-${i}`, createdAt: EPOCH, updatedAt: EPOCH, deletedAt: t(-1e6 + i) }));
  let s = freshHome();
  s = { ...s, todos, sync: { ...s.sync, gen: 1, gone: { ...s.sync.gone, todos: older } } };
  const first = syncWith(dayMerge.emptySections(), s, freshPal());
  s = run(s, at(H.adoptDay(first.answer), t(61e3)));
  assert.equal(s.todos.length, 900, "the server has them all");
  s = run(s, at(H.clearDoneTodos(), t(62e3)));
  assert.equal(s.todos.length, 0);
  const second = syncWith(first.sections, s, freshPal());
  s = run(s, at(H.adoptDay(second.answer), t(63e3)));
  assert.deepEqual(s.todos, [], "no cleared to-do came back from the server's copy");
  assert.equal(second.answer.todos.filter((x) => !x.deletedAt).length, 0);
});

test("Undo of a deleted task / anchor / to-do: an edit after the deletion, with everything it had", () => {
  let s = freshHome();
  s = run(s, at(H.toggleTask("mvd-2"), t(1000)));
  const task = byId(s.tasks, "mvd-2");
  s = run(s, at(H.removeTask("mvd-2"), t(2000)));
  s = run(s, at(H.restoreDayItem({ section: "tasks", item: task }), t(2000)));
  const back = byId(s.tasks, "mvd-2");
  assert.ok(back, "it is back");
  assert.ok(Date.parse(back.updatedAt) > Date.parse(t(2000)), "updatedAt is after deletedAt, so the server keeps it alive");
  assert.equal(back.doneOn, DAY1, "its tick came back too");
  assert.equal(back.done, true);
  assert.deepEqual(s.sync.gone.tasks, []);
  assert.deepEqual(s.tasks.map((x) => x.id), ["mvd-1", "mvd-2", "mvd-3"], "back in its place");
  // a second Undo of the same item is a no-op
  assert.equal(run(s, at(H.restoreDayItem({ section: "tasks", item: task }), t(3000))).tasks.length, 3);
});

// ---- doneOn across midnight ------------------------------------------------------

test("a tick counts for its day only: after midnight it shows as open, and the tick is kept", () => {
  let s = freshHome();
  s = run(s, at(H.toggleTask("mvd-1"), "2026-11-19T22:59:00.000Z", DAY1));
  s = run(s, at(H.setAnchorStatus({ id: "a-1", status: "done" }), "2026-11-19T22:59:00.000Z", DAY1));
  assert.equal(byId(s.tasks, "mvd-1").done, true);
  // the date changes while the app is open (startDayClock → refreshDay)
  s = run(s, at(H.refreshDay(), "2026-11-19T23:01:00.000Z", DAY2));
  assert.equal(s.dayStamp, DAY2);
  assert.equal(byId(s.tasks, "mvd-1").done, false);
  assert.equal(byId(s.tasks, "mvd-1").doneOn, DAY1, "the tick itself is not rewritten");
  assert.equal(byId(s.anchors, "a-1").status, "upcoming");
  // tapping it again ticks it for the new day
  s = run(s, at(H.toggleTask("mvd-1"), "2026-11-19T23:02:00.000Z", DAY2));
  assert.equal(byId(s.tasks, "mvd-1").done, true);
  assert.equal(byId(s.tasks, "mvd-1").doneOn, DAY2);
  // and a restart on the next day derives the same
  const stored = JSON.parse(JSON.stringify(H.persistedHome(s)));
  const next = homeReducer(undefined, at(H.hydrateHome(stored), "2026-11-21T08:00:00.000Z", "2026-11-21"));
  assert.equal(byId(next.tasks, "mvd-1").done, false);
});

test("refreshDay on the same day touches nothing", () => {
  const s = run(freshHome(), at(H.toggleTask("mvd-1")));
  const again = run(s, at(H.refreshDay(), t(60e3)));
  assert.equal(again, s);
});

// ---- the request ----------------------------------------------------------------

test("the request: every section, live items whole, tombstones, check-ins, gen", () => {
  let s = freshHome();
  s = run(
    s,
    at(H.addAnchor({ title: "Physio", hour: 17, minute: 30, icon: "flag", location: null })),
    at(H.toggleTask("mvd-1")),
    at(H.removeTask("mvd-3"), t(1000)),
    at(H.addTodo("Email the lab")),
    H.recordCheckin({ state: "yellow", level: 0.5, at: "2026-11-19T10:00:00.000Z" })
  );
  const physio = s.anchors.find((a) => a.title === "Physio");
  s = { ...s, anchors: s.anchors.map((a) => (a.id === physio.id ? { ...a, category: "move" } : a)) };
  let p = palReducer(freshPal(), P.addDump("A thought"));
  const dumpId = p.dump[0].id;
  p = palReducer(p, P.addDump("Another"));
  p = palReducer(p, at(P.removeDump(p.dump[0].id), t(2000)));

  const body = buildSyncBody(s, p);
  assert.equal(body.v, 1);
  assert.equal("gen" in body, false, "never synced: no gen");
  const sentPhysio = body.anchors.find((a) => a.id === physio.id);
  assert.equal(sentPhysio.status, undefined, "status is derived here, not sent");
  assert.equal("location" in sentPhysio, false, "an optional field with no value is left out");
  assert.equal(sentPhysio.category, "move", "another client's field goes back unchanged");
  assert.equal(sentPhysio.icon, "flag");
  assert.equal(sentPhysio.deletedAt, null);
  assert.equal(sentPhysio.doneOn, null);
  const sentTask = body.tasks.find((x) => x.id === "mvd-1");
  assert.equal(sentTask.done, undefined);
  assert.equal(sentTask.doneOn, DAY1);
  assert.equal(sentTask.createdAt, EPOCH);
  assert.deepEqual(body.tasks.find((x) => x.id === "mvd-3"), { id: "mvd-3", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: t(1000) });
  assert.equal(body.todos[0].done, false, "a to-do's done is part of it");
  assert.equal(body.todos[0].deletedAt, null);
  assert.deepEqual(body.dump.find((d) => d.id === dumpId), { id: dumpId, text: "A thought", at: p.dump[0].at, deletedAt: null });
  assert.equal(body.dump.filter((d) => d.deletedAt).length, 1);
  assert.deepEqual(body.checkins, [{ at: "2026-11-19T10:00:00.000Z", state: "yellow", level: 0.5 }]);

  const synced = { ...s, sync: { ...s.sync, gen: 3 } };
  assert.equal(buildSyncBody(synced, p).gen, 3);
});

// ---- adopting the answer ---------------------------------------------------------

// A server answer built from the request, as the server would echo it.
function answerFrom(body, extra = {}) {
  return { v: 1, gen: 1, rev: 1, serverTime: NOW, erased: false, ...body, ...extra };
}

test("adopt: unknown fields kept, done / status derived, the merged state replaces ours", () => {
  let s = freshHome();
  let p = freshPal();
  const answer = answerFrom(buildSyncBody(s, p), {
    gen: 2,
    anchors: [
      { id: "a-web-1", title: "Stand up", subtitle: "", time: { hour: 11, minute: 0 }, flexMinutes: 15, category: "move", newThing: [1, 2], createdAt: t(-1000), updatedAt: t(-1000), deletedAt: null, doneOn: DAY1, tickAt: t(-500) },
      ...buildSyncBody(s, p).anchors,
    ],
    tasks: [...buildSyncBody(s, p).tasks, { id: "t-web-1", title: "From the web", subtitle: "", createdAt: t(-1000), updatedAt: t(-1000), deletedAt: null, doneOn: null, tickAt: null }],
    dump: [{ id: "d-web-1", text: "Web thought", at: t(-100), deletedAt: null }],
  });
  s = run(s, at(H.adoptDay(answer)));
  p = palReducer(p, at(H.adoptDay(answer)));
  const web = byId(s.anchors, "a-web-1");
  assert.equal(web.flexMinutes, 15);
  assert.equal(web.category, "move");
  assert.deepEqual(web.newThing, [1, 2]);
  assert.equal(web.status, "done", "ticked today on the web → done here");
  assert.equal(s.anchors[0].id, "a-1", "ordered by time of day");
  assert.equal(byId(s.tasks, "t-web-1").done, false);
  assert.equal(s.sync.gen, 2);
  assert.equal(s.sync.lastSyncAt, NOW);
  assert.deepEqual(p.dump.map((d) => d.text), ["Web thought"]);

  // ...and an edit here sends those fields back unchanged
  s = run(s, at(H.updateAnchor({ id: "a-web-1", title: "Stand up and stretch" }), t(1000)));
  const sent = buildSyncBody(s, p).anchors.find((a) => a.id === "a-web-1");
  assert.equal(sent.flexMinutes, 15);
  assert.equal(sent.category, "move");
  assert.deepEqual(sent.newThing, [1, 2]);
  assert.equal(sent.title, "Stand up and stretch");
});

test("adopt: a tombstone for an item still on screen hides it; unmentioned local items stay", () => {
  let s = freshHome();
  s = run(s, at(H.addTodo("Only on this phone")), at(H.removeTask("mvd-2"), t(500)));
  const local = s.todos[0].id;
  const answer = answerFrom({}, {
    anchors: buildSyncBody(s, freshPal()).anchors,
    tasks: [
      { id: "mvd-1", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: t(1000) }, // deleted on the laptop
      { id: "mvd-3", title: "Walk", subtitle: "10 minutes outside", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: null, doneOn: null, tickAt: null },
    ],
    todos: [],
    dump: [],
    checkins: [],
  });
  s = run(s, at(H.adoptDay(answer), t(2000)));
  assert.equal(byId(s.tasks, "mvd-1"), undefined, "deleted elsewhere → gone here");
  assert.deepEqual(byId(s.sync.gone.tasks, "mvd-1"), { id: "mvd-1", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: t(1000) });
  assert.ok(byId(s.sync.gone.tasks, "mvd-2"), "our own tombstone the answer didn't mention stays");
  assert.ok(byId(s.todos, local), "our to-do the answer didn't mention stays, and goes again next time");
  assert.ok(buildSyncBody(s, freshPal()).todos.some((x) => x.id === local));
});

test("adopt with erased: the answer replaces everything, no exception", () => {
  let s = freshHome();
  s = run(s, at(H.addTodo("Only on this phone")), at(H.removeTask("mvd-2")), H.recordCheckin({ state: "red", level: 0.9, at: "2026-11-19T10:00:00.000Z" }));
  s = { ...s, sync: { ...s.sync, gen: 3 } };
  let p = palReducer(freshPal(), P.addDump("mine"));
  const answer = { v: 1, gen: 4, rev: 9, serverTime: NOW, erased: true, anchors: [], tasks: [], todos: [], dump: [], checkins: [] };
  s = run(s, at(H.adoptDay(answer)));
  p = palReducer(p, at(H.adoptDay(answer)));
  assert.deepEqual(s.tasks, []);
  assert.deepEqual(s.anchors, []);
  assert.deepEqual(s.todos, []);
  assert.deepEqual(s.checkins, []);
  assert.deepEqual(s.sync.gone, { tasks: [], anchors: [], todos: [] });
  assert.deepEqual(p.dump, []);
  assert.equal(s.sync.gen, 4);
});

test("adopt with erased: Home's current state and level are cleared too, unless a newer check-in came with it", () => {
  const s = run(freshHome(), H.recordCheckin({ state: "red", level: 0.9, at: "2026-11-19T10:00:00.000Z" }));
  assert.deepEqual([s.nervousState, s.nervousLevel], ["red", 0.9]);
  const erased = { v: 1, gen: 4, rev: 9, serverTime: NOW, erased: true, anchors: [], tasks: [], todos: [], dump: [], checkins: [] };
  const cleared = run(s, at(H.adoptDay(erased)));
  assert.deepEqual([cleared.nervousState, cleared.nervousLevel], [undefined, undefined], "the erased day has no check-in to show");
  assert.equal(buildSnapshot({ home: cleared, look: {}, palette: {}, now: new Date(NOW) }).state, null, "the widget shows no check-in either");
  // An answer without a check-in list still erases them (the web app does the same).
  const { checkins, ...noList } = erased;
  void checkins;
  assert.deepEqual(run(s, at(H.adoptDay(noList))).checkins, []);
  // A check-in made elsewhere after the erase, newer than ours: Home follows it.
  const followed = run(s, at(H.adoptDay({ ...erased, checkins: [{ at: "2026-11-19T11:00:00.000Z", state: "green", level: 0.2 }] })));
  assert.deepEqual([followed.nervousState, followed.nervousLevel], ["green", 0.2]);
  // Not erased, nothing newer: Home keeps its state, as before.
  const kept = run(s, at(H.adoptDay({ ...erased, erased: false, checkins: [{ at: "2026-11-19T10:00:00.000Z", state: "red", level: 0.9 }] })));
  assert.deepEqual([kept.nervousState, kept.nervousLevel], ["red", 0.9]);
});

test("adopt: check-ins replaced (newest 200); Home follows a newer one, not an older one", () => {
  let s = run(freshHome(), H.recordCheckin({ state: "green", level: 0.1, at: "2026-11-19T10:00:00.000Z" }));
  const list = [];
  for (let i = 0; i < 230; i += 1) list.push({ at: t(i * 61e3, "2026-11-18T00:00:00.000Z"), state: "green", level: 0.1 });
  list.push({ at: "2026-11-19T10:00:00.000Z", state: "green", level: 0.1 });
  list.push({ at: "2026-11-19T11:00:00.000Z", state: "red", level: null }); // a web check-in has no level
  s = run(s, at(H.adoptDay(answerFrom({}, { checkins: list }))));
  assert.equal(s.checkins.length, 200);
  assert.equal(s.checkins[199].at, "2026-11-19T11:00:00.000Z");
  assert.equal(s.nervousState, "red");
  assert.equal(s.nervousLevel, undefined, "no level: the slider shows the state's middle");

  // an answer whose newest is older than ours: Home keeps its state
  let mine = run(freshHome(), H.recordCheckin({ state: "yellow", level: 0.5, at: "2026-11-19T12:00:00.000Z" }));
  mine = run(mine, at(H.adoptDay(answerFrom({}, { checkins: [{ at: "2026-11-19T11:00:00.000Z", state: "red", level: 0.9 }] }))));
  assert.equal(mine.nervousState, "yellow");
  assert.equal(mine.nervousLevel, 0.5);
});

test("adopt: check-ins are replaced by the answer, never kept when unmentioned (a wrong phone clock)", () => {
  // The phone runs 10 minutes fast: the server stores this check-in at its
  // own clock, so the answer never mentions the phone's `at`.
  const fast = "2026-11-19T17:30:00.000Z";
  let s = run(freshHome(), H.recordCheckin({ state: "green", level: 0.2, at: "2026-11-19T09:00:00.000Z" }));
  s = { ...s, checkins: [...s.checkins, { state: "yellow", level: 0.5, at: fast }] };
  const answer = answerFrom({}, {
    checkins: [
      { at: "2026-11-19T09:00:00.000Z", state: "green", level: 0.2 },
      { at: NOW, state: "yellow", level: 0.5 }, // the same check-in, at server time
    ],
  });
  s = run(s, at(H.adoptDay(answer)));
  assert.deepEqual(s.checkins.map((c) => c.at), ["2026-11-19T09:00:00.000Z", NOW]);
  assert.equal(buildSyncBody(s, freshPal()).checkins.some((c) => c.at === fast), false, "the future copy is never sent again");
});

test("adopt: an identical answer changes no list (no re-render, no rescheduled anchors)", () => {
  let s = run(freshHome(), at(H.toggleTask("mvd-1")), at(H.addTodo("x")), at(H.removeAnchor("a-4")));
  const answer = answerFrom(buildSyncBody(s, freshPal()));
  const after = run(s, at(H.adoptDay(answer), t(1000)));
  for (const key of ["tasks", "anchors", "todos", "checkins"]) assert.equal(after[key], s[key], key);
  assert.equal(after.sync.gone.anchors, s.sync.gone.anchors);
});

test("adopt: broken items are skipped, unsafe keys dropped, a wrong v is ignored", () => {
  let s = run(freshHome(), at(H.addTodo("Mine")));
  const todosBefore = s.todos;
  const answer = answerFrom({}, {
    anchors: [
      { id: "bad id!", title: "x", time: { hour: 1, minute: 1 } },
      { id: "a-x", title: "No time" },
      { id: "a-y", title: "Late", time: { hour: 25, minute: 0 } },
      JSON.parse('{"id":"a-z","title":"Fine","time":{"hour":9,"minute":0},"__proto__":{"polluted":true}}'),
      "not an object",
    ],
    tasks: [{ id: "t-1", title: "  " }, { id: "t-2", title: "ok", createdAt: NOW, updatedAt: NOW }],
    todos: null,
  });
  s = run(s, at(H.adoptDay(answer)));
  // the starters weren't mentioned, so they stay; of the answer only a-z is usable
  assert.deepEqual(s.anchors.map((a) => a.id), ["a-1", "a-z", "a-2", "a-3", "a-4"]);
  const z = byId(s.anchors, "a-z");
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(z, "__proto__"), false);
  assert.equal(z.status, "upcoming");
  assert.deepEqual(s.tasks.map((x) => x.id), ["mvd-1", "mvd-2", "mvd-3", "t-2"]);
  assert.equal(s.todos, todosBefore, "a section the answer doesn't have leaves ours alone");
  const ignored = run(s, at(H.adoptDay({ v: 2, tasks: [] })));
  assert.equal(ignored, s);
});

// ---- text limits (§8 "Text limits") ------------------------------------------------

// The server's own merge (neuropal-backend), read only.
const dayMerge = createRequire(import.meta.url)("../../neuropal-backend/src/services/dayMerge.js");

// A long thought from the brain dump (186 characters).
const THOUGHT =
  "Email Milena about the SPAD array calibration: ask whether the new beam splitter arrived, whether Friday's coincidence run can move to Monday, and who keeps the lab key over the weekend.";
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

const newStore = () =>
  configureStore({ reducer: { home: homeReducer, pal: palReducer }, middleware: (g) => g({ serializableCheck: false, immutableCheck: false }) });

test("the phone cleans text exactly like the server (limits in UTF-16 units, never half an emoji)", () => {
  assert.deepEqual(TEXT_MAX, { taskTitle: 120, taskSubtitle: 120, todoTitle: 200, anchorTitle: 120, anchorSubtitle: 200, dump: 2000 });
  const samples = ["  Email   Milena  ", "x".repeat(130), `${"y".repeat(119)}😀z`, "lone \uD800 surrogate", "tab\there\nnew line", "é".repeat(2100), `${" ".repeat(9)}q${" ".repeat(300)}`, words(80)];
  for (const s of samples) for (const max of [120, 200, 2000]) assert.equal(cleanText(s, max), dayMerge.cleanText(s, max), `${s.slice(0, 20)}… at ${max}`);
});

test("titles, subtitles and dump lines are kept within the server's limits as they are written", () => {
  let s = freshHome();
  s = run(s, at(H.addTask(`  ${words(40)}  `)), at(H.addTodo(words(60))));
  const task = s.tasks.at(-1);
  assert.equal(task.title, cleanText(words(40), 120));
  assert.ok(task.title.length <= 120 && words(40).startsWith(task.title));
  assert.equal(s.todos[0].title, cleanText(words(60), 200));
  assert.ok(s.todos[0].title.length <= 200 && s.todos[0].title.length > 120, "a to-do keeps more than a task");
  s = run(s, at(H.renameTask({ id: task.id, title: `Read   ${words(50)}` }), t(1000)));
  assert.equal(byId(s.tasks, task.id).title, cleanText(`Read ${words(50)}`, 120));
  // the emoji at the limit is dropped whole, never cut in half
  s = run(s, at(H.addTask(`${"y".repeat(119)}😀 and more`), t(2000)));
  assert.equal(s.tasks.at(-1).title, "y".repeat(119));
  s = run(s, at(H.addAnchor({ title: words(40), subtitle: words(60), hour: 9, minute: 0 }), t(3000)));
  const anchor = s.anchors.find((a) => a.title.startsWith("word0"));
  assert.deepEqual([anchor.title, anchor.subtitle], [cleanText(words(40), 120), cleanText(words(60), 200)]);
  s = run(s, at(H.updateAnchor({ id: anchor.id, title: `New ${words(40)}`, subtitle: `New ${words(60)}` }), t(4000)));
  const edited = byId(s.anchors, anchor.id);
  assert.deepEqual([edited.title, edited.subtitle], [cleanText(`New ${words(40)}`, 120), cleanText(`New ${words(60)}`, 200)]);
  assert.equal(edited.updatedAt, t(4000));
  // an empty name never replaces the anchor's name (the server would drop the anchor)
  assert.equal(byId(run(s, at(H.updateAnchor({ id: anchor.id, title: "   " }), t(5000))).anchors, anchor.id).title, edited.title);
  const p = palReducer(freshPal(), P.addDump(words(400)));
  assert.equal(p.dump[0].text, cleanText(words(400), 2000));
});

test("what the phone keeps is what the server keeps: the first sync cuts nothing", () => {
  let s = freshHome();
  s = run(s, at(H.addTask(THOUGHT)), at(H.addTodo(words(60))), at(H.addAnchor({ title: words(40), subtitle: words(60), hour: 9, minute: 0 })));
  let p = palReducer(freshPal(), P.addDump(words(400)));
  const mine = (home, pal) => [home.tasks.at(-1).title, home.todos.at(-1).title, home.anchors.find((a) => a.title.startsWith("word0")).subtitle, pal.dump[0].text];
  const before = mine(s, p);
  const serverNow = Date.parse(NOW) + 1000;
  const req = dayMerge.normalizeRequest(JSON.parse(JSON.stringify(buildSyncBody(s, p))), serverNow);
  const sections = dayMerge.mergeSections(dayMerge.emptySections(), req.sections);
  const answer = JSON.parse(JSON.stringify(dayMerge.dayBody({ gen: 1, rev: 1, sections }, req.checkins || [], serverNow, false)));
  s = run(s, at(H.adoptDay(answer), t(2000)));
  p = palReducer(p, at(H.adoptDay(answer), t(2000)));
  assert.deepEqual(mine(s, p), before, "the server kept every character the phone had");
  assert.equal(before[0].length, 120, "the task title was cut on the phone, as it was typed, not by the sync");
});

test("brain dump → minimum day / to-do: a line that fits moves; a longer one stays whole in the dump", () => {
  const store = newStore();
  store.dispatch(P.addDump("Order the SPAD cable"));
  store.dispatch(P.addDump(THOUGHT));
  const [long, short] = store.getState().pal.dump;
  // 186 characters don't fit a task title (120): the task gets the start, the line stays.
  assert.equal(store.dispatch(P.moveDumpLine(long, "day")), true, "kept: the sheet says the full note stays");
  const task = store.getState().home.tasks.at(-1);
  assert.equal(task.title, "Email Milena about the SPAD array calibration: ask whether the new beam splitter arrived, whether Friday's coincidence…");
  assert.ok(task.title.length <= 120, "whole words and an ellipsis, within a task title");
  assert.equal(store.getState().pal.dump.find((d) => d.id === long.id)?.text, THOUGHT, "the whole line is still in the dump");
  assert.deepEqual(store.getState().pal.dumpGone, []);
  // A to-do takes 200: the same line fits there, so it moves.
  assert.equal(store.dispatch(P.moveDumpLine(long, "todo")), false);
  assert.equal(store.getState().home.todos.at(-1).title, THOUGHT);
  assert.equal(store.getState().pal.dump.some((d) => d.id === long.id), false);
  // A short line moves to the minimum day as before; a line too long for a to-do stays too.
  assert.equal(store.dispatch(P.moveDumpLine(short, "day")), false);
  assert.equal(store.getState().home.tasks.at(-1).title, "Order the SPAD cable");
  store.dispatch(P.addDump(words(60)));
  const longer = store.getState().pal.dump[0];
  assert.equal(store.dispatch(P.moveDumpLine(longer, "todo")), true);
  const todo = store.getState().home.todos.at(-1).title;
  assert.ok(todo.endsWith("…") && todo.length <= 200 && words(60).startsWith(todo.slice(0, -1)), todo);
  assert.ok(/ word\d+…$/.test(todo), "cut after a whole word");
  assert.ok(store.getState().pal.dump.some((d) => d.id === longer.id));
  // Nothing of the long thought is lost anywhere: the dump has it whole.
  const everywhere = JSON.stringify(store.getState());
  assert.ok(everywhere.includes(THOUGHT));
});

// ---- whose day it is ------------------------------------------------------------

test("whose day: join, keep, reset", () => {
  assert.equal(ownerStep(null, "u1"), "join");
  assert.equal(ownerStep("u1", "u1"), "keep");
  assert.equal(ownerStep("u1", "u2"), "reset");
  assert.equal(ownerStep("u1", ""), "none");
  assert.equal(ownerStep(null, null), "none");
});

test("whose day: another account's day is cleared (gen too) before anything is sent", () => {
  let s = run(freshHome(), at(H.addTodo("Ryx's")), at(H.removeTask("mvd-1")), H.recordCheckin({ state: "red", level: 0.9 }));
  s = run(s, H.setDayOwner("user-a"));
  s = { ...s, sync: { ...s.sync, gen: 5, lastSyncAt: NOW } };
  let p = palReducer(freshPal(), P.addDump("private"));
  const reset = H.resetDay("user-b");
  s = run(s, at(reset));
  p = palReducer(p, at(reset));
  assert.equal(s.sync.owner, "user-b");
  assert.equal(s.sync.gen, 0);
  assert.equal(s.sync.enabled, true);
  assert.deepEqual(s.todos, []);
  assert.deepEqual(s.checkins, []);
  assert.equal(s.nervousState, undefined);
  assert.deepEqual(s.tasks.map((x) => x.id), ["mvd-1", "mvd-2", "mvd-3"], "a fresh day, as a new install");
  assert.deepEqual(s.sync.gone, { tasks: [], anchors: [], todos: [] });
  assert.deepEqual(p.dump, []);
  assert.deepEqual(p.dumpGone, []);
  const body = buildSyncBody(s, p);
  assert.equal("gen" in body, false);
  assert.equal(body.checkins.length, 0);
});

test("switching sync on again forgets gen (a first sync, §8)", () => {
  let s = { ...freshHome(), sync: { ...freshHome().sync, gen: 7 } };
  s = run(s, H.setDaySyncEnabled(true));
  assert.equal(s.sync.gen, 7, "already on: nothing changes");
  s = run(s, H.setDaySyncEnabled(false));
  assert.equal(s.sync.enabled, false);
  s = run(s, H.setDaySyncEnabled(true));
  assert.equal(s.sync.enabled, true);
  assert.equal(s.sync.gen, 0);
});

// ---- what the widget reads --------------------------------------------------------

test("the Android widget's snapshot reads the same fields with the same meaning", () => {
  let s = run(freshHome(), at(H.setAnchorStatus({ id: "a-1", status: "done" }), "2026-11-19T07:00:00.000Z"));
  s = run(s, H.recordCheckin({ state: "green", level: 0.2 }));
  const now = new Date(2026, 10, 19, 7, 30);
  s = run(s, at(H.refreshDay(), now.toISOString(), localDate(now)));
  const snap = buildSnapshot({ home: s, look: {}, palette: {}, now });
  assert.equal(snap.state, "green");
  assert.deepEqual(snap.nextAnchor, { title: "Lunch Break", hour: 12, minute: 30 }, "a-1 is done, so the next one is a-2");
  assert.equal(snap.anchorsToday.find((a) => a.title === "Morning meds").status, "done");
  assert.ok(snap.line.includes("Stay hydrated"), "Pal's line names the first open task");
});

// ---- the Settings status line -----------------------------------------------------

test("the status line under the switch", () => {
  const now = new Date(2026, 10, 19, 15, 0);
  const lastSyncAt = new Date(2026, 10, 19, 14, 5).toISOString();
  assert.equal(describeDaySync({ enabled: false, phase: "ok", lastSyncAt, now }), "Off. Your day stays on this phone.");
  assert.equal(describeDaySync({ enabled: true, phase: "ok", lastSyncAt, now }), "Synced with your server at 14:05.");
  assert.equal(describeDaySync({ enabled: true, phase: "syncing", lastSyncAt: null, now }), "Syncing with your server…");
  assert.match(describeDaySync({ enabled: true, phase: "offline", lastSyncAt, now }), /^Can't sync right now/);
  assert.match(describeDaySync({ enabled: true, phase: "ok", lastSyncAt: new Date(2026, 10, 18, 9, 0).toISOString(), now }), /on 18 Nov at 09:00/);
  // After a 401 the line never says "Synced …": signing in again is what resumes it.
  assert.equal(describeDaySync({ enabled: true, phase: "ended", lastSyncAt, now }), "Your session ended. Sign in again and your day syncs again. Until then it's safe on this phone.");
  assert.match(describeDaySync({ enabled: true, phase: "stopped", lastSyncAt, now }), /^Sync stopped: your server refused the day\. It tries again the next time the app starts\./);
  for (const phase of ["demo", "unconfigured", "unavailable", "stopped", "ended", "signed-out", "waiting", "offline", "syncing", "ok", "idle"]) {
    const line = describeDaySync({ enabled: true, phase, lastSyncAt: null, now });
    assert.ok(line && !line.includes("!"), phase);
  }
});

// ---- the sync loop and the API layer -----------------------------------------------
// services/daySync.js and services/network.js with the real slices, the real
// session code (store/ApiLink.js) and real axios. Stand-ins: React Native
// (AppState, Platform), the phone's storage (SecureStore, AsyncStorage), the
// health probe (fetch), the server (an axios adapter) and the clock (fake
// timers).

const SRC = new URL("../src/", import.meta.url).href;
const RN_STUB = `data:text/javascript,${encodeURIComponent(`
const listeners = new Set();
export const AppState = {
  currentState: "active",
  addEventListener(type, fn) { listeners.add(fn); return { remove() { listeners.delete(fn); } }; },
  emit(next) { AppState.currentState = next; for (const fn of [...listeners]) fn(next); },
};
export const Platform = { OS: "android", select: (o) => (o && "android" in o ? o.android : o && o.default) };
`)}`;
// Metro finds "./network" without its extension; Node needs it.
register(
  `data:text/javascript,${encodeURIComponent(`
const SRC = ${JSON.stringify(SRC)};
const RN = ${JSON.stringify(RN_STUB)};
export async function resolve(specifier, context, next) {
  if (specifier === "react-native") return { url: RN, shortCircuit: true };
  if (context.parentURL?.startsWith(SRC) && /^\\.\\.?\\//.test(specifier) && !/\\.[a-z]+$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}`)}`
);

const secure = new Map();
const kv = new Map();
globalThis.require = (id) => {
  if (id === "expo-secure-store") {
    return { getItemAsync: async (k) => secure.get(k) ?? null, setItemAsync: async (k, v) => void secure.set(k, String(v)), deleteItemAsync: async (k) => void secure.delete(k) };
  }
  if (id === "@react-native-async-storage/async-storage") {
    return { default: { getItem: async (k) => kv.get(k) ?? null, setItem: async (k, v) => void kv.set(k, String(v)), removeItem: async (k) => void kv.delete(k) } };
  }
  throw new Error(`no stand-in for ${id}`);
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => (String(url).endsWith("/healthz") ? { ok: true, status: 200 } : realFetch(url, init));
process.env.EXPO_PUBLIC_API_BASE_URL = "http://np.test";
// These tests drive the real-server path. CI's Expo job sets
// EXPO_PUBLIC_USE_MOCK=true for its bundles; mock mode would park day sync
// in "demo" and every request below would never be sent.
process.env.EXPO_PUBLIC_USE_MOCK = "false";

const link = await import("../src/store/ApiLink.js");
const net = await import("../src/services/network.js");
const RN = await import(RN_STUB);
const A = await import("../src/store/slices/authSlice.js");
const { AxiosError } = (await import("axios")).default;

const settle = async (turns = 8) => {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r));
};
async function until(cond, turns = 80) {
  for (let i = 0; i < turns && !cond(); i += 1) await settle(1);
  return cond();
}
await link.apiReady;
await settle(); // the first health probe answers before the clock is faked

// The server: every request is recorded; `srv.handler` answers { status, data }.
// `dropAuth` makes the request look as if it left without its token.
const srv = { requests: [], handler: async () => ({ status: 500, data: {} }) };
net.apiClient.defaults.adapter = async (config) => {
  const h = config.headers;
  const auth = (h && (typeof h.get === "function" ? h.get("Authorization") : h.Authorization)) || null;
  const req = { url: config.url, auth, body: typeof config.data === "string" && config.data ? JSON.parse(config.data) : null };
  srv.requests.push(req);
  const { status, data, dropAuth } = await srv.handler(req);
  if (dropAuth) config.headers.delete("Authorization");
  const response = { status, statusText: String(status), data, headers: {}, config, request: {} };
  if (status >= 200 && status < 300) return response;
  throw new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_RESPONSE", config, {}, response);
};
const echo = (req) => ({
  status: 200,
  data: { v: 1, gen: 1, rev: srv.requests.length, serverTime: NOW, erased: false, anchors: req.body.anchors, tasks: req.body.tasks, todos: req.body.todos, dump: req.body.dump, checkins: req.body.checkins },
});
const refuse = (status, extra = {}) => async () => ({ status, data: { error: "Refused" }, ...extra });

function deferred() {
  let resolve;
  const p = new Promise((r) => (resolve = r));
  return { p, resolve };
}

function signedInStore(userId = "user-a") {
  const store = configureStore({
    reducer: { home: homeReducer, pal: palReducer, auth: A.default },
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(A.hydrateUser({ id: userId }));
  return store;
}

// A fresh copy of the loop each time (it keeps "until the next start" state),
// on fake timers.
let loops = 0;
async function withLoop(fn) {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const stops = [];
  try {
    const loop = await import(new URL(`../src/services/daySync.js?run=${(loops += 1)}`, import.meta.url).href);
    srv.requests.length = 0;
    await fn({ status: () => loop.getDaySyncStatus().phase, start: (store) => stops.push(loop.startDaySync(store)) });
  } finally {
    stops.forEach((stop) => stop());
    mock.timers.reset();
  }
}

// Seconds (from now) at which a request went out, over `seconds` of fake time.
async function requestTimes(seconds) {
  const times = [];
  for (let s = 1; s <= seconds; s += 1) {
    const n = srv.requests.length;
    mock.timers.tick(1000);
    await settle(2);
    if (srv.requests.length > n) times.push(s);
  }
  return times;
}

test("a 401 from day sync never signs anyone out; the next ordinary request still does", async () => {
  await link.saveSessionToken("tok-1");
  const signOuts = [];
  const off = link.onUnauthorized(() => signOuts.push("signed out"));
  try {
    srv.handler = refuse(401);
    const err = await net.syncDayApi({ v: 1 }).catch((e) => e);
    assert.equal(err?.response?.status, 401);
    await settle();
    assert.deepEqual(signOuts, [], "a background sync never interrupts");
    assert.equal(await err.isCurrentSession(), true, "the 401 answered the session held now");
    await net.fetchAnnotationsApi("doc-1").catch(() => {});
    await settle();
    assert.deepEqual(signOuts, ["signed out"], "an ordinary request ends the session, as before");
  } finally {
    off();
  }
});

test("day sync: a 401 for the session held now stops it and says so, signs nobody out; a new session lets it go on", () =>
  withLoop(async ({ start, status }) => {
    await link.saveSessionToken("tok-1");
    const signOuts = [];
    const off = link.onUnauthorized(() => signOuts.push("signed out"));
    try {
      const store = signedInStore();
      srv.handler = async (req) => (req.auth === "Bearer tok-2" ? echo(req) : { status: 401, data: { error: "Sign in again" } });
      start(store);
      assert.ok(await until(() => status() === "ended"), `phase: ${status()}`);
      // Changes, the foreground, ten minutes: nothing more goes out with the ended session.
      store.dispatch(H.addTask("Read one page"));
      mock.timers.tick(3000);
      await settle(20);
      RN.AppState.emit("background");
      RN.AppState.emit("active");
      await settle(20);
      mock.timers.tick(10 * 60 * 1000);
      await settle(20);
      assert.equal(srv.requests.length, 1);
      assert.equal(status(), "ended");
      assert.deepEqual(signOuts, [], "nobody was signed out by a background sync");
      assert.equal(store.getState().auth.loggedIn, true);
      // A new session is stored (a new password): the store doesn't change, yet the next change syncs.
      await link.saveSessionToken("tok-2");
      store.dispatch(H.addTask("Read two pages"));
      mock.timers.tick(3000);
      assert.ok(await until(() => status() === "ok"), `phase: ${status()}`);
      assert.equal(srv.requests.at(-1).auth, "Bearer tok-2");
      assert.ok(srv.requests.at(-1).body.tasks.some((x) => x.title === "Read two pages"));
    } finally {
      off();
    }
  }));

test("day sync: a late 401 for a token replaced meanwhile (a new password) stops nothing", () =>
  withLoop(async ({ start, status }) => {
    await link.saveSessionToken("tok-old");
    const store = signedInStore();
    const first = deferred();
    srv.handler = (req) => (srv.requests.length === 1 ? first.p : echo(req));
    start(store);
    assert.ok(await until(() => srv.requests.length === 1));
    assert.equal(srv.requests[0].auth, "Bearer tok-old");
    await link.saveSessionToken("tok-new"); // same account: nothing changes in the store
    first.resolve({ status: 401, data: { error: "Sign in again" } });
    await settle(20);
    assert.notEqual(status(), "ended");
    store.dispatch(H.addTask("Read one page"));
    mock.timers.tick(3000);
    assert.ok(await until(() => status() === "ok"), `phase: ${status()}`);
    assert.equal(srv.requests.at(-1).auth, "Bearer tok-new");
    assert.ok(srv.requests.at(-1).body.tasks.some((x) => x.title === "Read one page"));
  }));

test("day sync: signed out and in again while a request was out: its late 401 stops nothing", () =>
  withLoop(async ({ start, status }) => {
    await link.saveSessionToken("tok-a1");
    const store = signedInStore("user-a");
    const first = deferred();
    srv.handler = (req) => (srv.requests.length === 1 ? first.p : echo(req));
    start(store);
    assert.ok(await until(() => srv.requests.length === 1));
    await link.clearSession();
    store.dispatch(A.resetAuth());
    await link.saveSessionToken("tok-a2");
    store.dispatch(A.hydrateUser({ id: "user-a" }));
    first.resolve({ status: 401, data: { error: "Sign in again" } });
    await settle(20);
    store.dispatch(H.addTask("Read one page"));
    mock.timers.tick(3000);
    assert.ok(await until(() => status() === "ok"), `phase: ${status()}`);
    assert.equal(srv.requests.at(-1).auth, "Bearer tok-a2");
  }));

test("day sync: a 401 that keeps answering another session is retried on the ladder, never in a loop", () =>
  withLoop(async ({ start }) => {
    await link.saveSessionToken("tok-1");
    srv.handler = refuse(401, { dropAuth: true });
    start(signedInStore());
    assert.ok(await until(() => srv.requests.length === 1));
    assert.deepEqual(await requestTimes(6 * 60), [5, 35, 335]);
  }));

test("day sync: another 4xx stops until the next start and the line says so; 408 and 429 are retried like a 5xx", async () => {
  await link.saveSessionToken("tok-1");
  for (const code of [413, 422, 400]) {
    await withLoop(async ({ start, status }) => {
      const store = signedInStore();
      srv.handler = refuse(code);
      start(store);
      assert.ok(await until(() => status() === "stopped"), `${code}: phase ${status()}`);
      store.dispatch(H.addTask("x"));
      for (let s = 0; s < 20 * 60; s += 10) {
        mock.timers.tick(10_000);
        await settle(2);
      }
      RN.AppState.emit("background");
      RN.AppState.emit("active");
      await settle(10);
      assert.equal(srv.requests.length, 1, `${code}: one request in 20 minutes`);
      assert.equal(status(), "stopped");
    });
  }
  for (const code of [408, 429]) {
    await withLoop(async ({ start, status }) => {
      srv.handler = refuse(code);
      start(signedInStore());
      assert.ok(await until(() => srv.requests.length === 1));
      assert.deepEqual(await requestTimes(6 * 60), [5, 35, 335], `${code}: retried after 5 s, 30 s, then 5 minutes`);
      assert.equal(status(), "offline");
    });
  }
});

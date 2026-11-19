// Day sync on the phone (docs/DAY-SYNC.md): the pure model and every reducer
// that changes the day, run through the real slices.
//   cd neuropal-expo-app && node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/day-model.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EPOCH,
  TOMBSTONE_CAP,
  buildSyncBody,
  canonical,
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
    gone: { tasks: [], anchors: [{ id: "a-4", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: NOW }], todos: [] },
    lastSyncAt: null,
  });
  assert.equal(s.dayStamp, DAY1);
});

test("a starter deleted before sync is sent as a deletion, and only for old saves", () => {
  const old = save030();
  old.tasks = old.tasks.filter((x) => x.id !== "mvd-2");
  const s = homeReducer(undefined, at(H.hydrateHome(old)));
  assert.deepEqual(s.sync.gone.tasks, [{ id: "mvd-2", createdAt: EPOCH, updatedAt: EPOCH, deletedAt: NOW }]);
  assert.equal(byId(s.tasks, "mvd-2"), undefined);
  // The tombstone wins over a 1970 starter on the server (deletedAt >= updatedAt).
  const body = buildSyncBody(s, freshPal());
  assert.ok(body.tasks.some((x) => x.id === "mvd-2" && x.deletedAt === NOW && x.title === undefined));
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

test("tombstones: one per id, the newest 500 kept", () => {
  let s = freshHome();
  const many = [];
  for (let i = 0; i < TOMBSTONE_CAP + 20; i += 1) many.push({ id: `td-${i}`, title: `n${i}`, done: false, createdAt: t(i), updatedAt: t(i) });
  s = { ...s, todos: many };
  for (let i = 0; i < many.length; i += 1) s = run(s, at(H.removeTodo(`td-${i}`), t(10000 + i)));
  assert.equal(s.sync.gone.todos.length, TOMBSTONE_CAP);
  assert.equal(s.sync.gone.todos[0].id, "td-20", "the oldest went first");
  assert.equal(new Set(s.sync.gone.todos.map((x) => x.id)).size, TOMBSTONE_CAP);
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
  for (const phase of ["demo", "unconfigured", "unavailable", "signed-out", "waiting", "offline", "syncing", "ok", "idle"]) {
    const line = describeDaySync({ enabled: true, phase, lastSyncAt: null, now });
    assert.ok(line && !line.includes("!"), phase);
  }
});

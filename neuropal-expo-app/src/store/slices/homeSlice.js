import { createSlice, current, isDraft, nanoid } from "@reduxjs/toolkit";

import {
  CHECKIN_CAP,
  CHECKIN_MERGE_MS,
  ORDER,
  SECTIONS,
  adoptHome,
  canonical,
  cleanLevel,
  createdStamp,
  defaultSyncMeta,
  definitionKey,
  deriveDay,
  isDayBody,
  later,
  localDate,
  migrateHome,
  stamps,
  stampsFrom,
  starterAnchors,
  starterTasks,
  tombstoneFor,
  withTombstone,
} from "../../services/dayModel.js";

// The day: check-ins, the minimum viable day, timed anchors and the to-do
// list. It syncs through the server (docs/DAY-SYNC.md; services/daySync.js),
// and works exactly the same signed out, offline or with sync switched off.
//
// What screens and the Android widget read keeps its shape: `tasks`,
// `anchors` and `todos` are LIVE items only, with task.done and
// anchor.status. Those two are derived from `doneOn` (the local date of the
// tick) by deriveDay — never set on their own. Every item also carries
// createdAt / updatedAt (and doneOn / tickAt for tasks and anchors); deleted
// items wait in `sync.gone` as tombstones until the server has them.
//
// Action creators read the clock (and make ids) in `prepare`, into `meta`,
// so payloads keep their old shape and the reducers stay pure (the tests in
// scripts/day-model.test.mjs replay any moment through them).

// Check-in history from the Home slider: newest last, capped. Adjustments
// made within CHECKIN_MERGE_MS of the last entry refine that entry instead of
// adding a new one (one check-in = one settled feeling, not every key press).
export { CHECKIN_CAP, CHECKIN_MERGE_MS };
const CHECKIN_STATES = new Set(["green", "yellow", "red"]);

// Random tail: two devices adding an item in the same millisecond must not
// make the same id (the server would treat them as one item).
function freshId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${nanoid(8)}`;
}

const timed = (payload) => ({ payload, meta: stamps() });
const timedWithId = (prefix) => (payload) => ({ payload, meta: { ...stamps(), id: freshId(prefix) } });

// A plain snapshot of part of the state. Immer drafts only the original
// tree: a list assigned earlier in the same reducer is already plain.
const plain = (value) => (isDraft(value) ? current(value) : value);

function freshHome(today, sync = defaultSyncMeta()) {
  return deriveDay(
    {
      nervousState: undefined,
      // Exact level on the Home check-in slider, 0–1 (undefined until the
      // first check-in). recordCheckin keeps it in step with nervousState; if
      // the state is ever set on its own, the slider shows that state's
      // middle instead.
      nervousLevel: undefined,
      // [{ state, level, at }] — see CHECKIN_CAP / CHECKIN_MERGE_MS above.
      checkins: [],
      // Minimum viable day — 3-5 core items; ticks count for the day they
      // were made (doneOn).
      tasks: starterTasks(),
      // The local date done / status were derived for (the widget reads it).
      dayStamp: today,
      // Timed anchors (medication, breaks, appointments) — the planner. The
      // Home "Next anchor" card is derived from these.
      anchors: starterAnchors(),
      // Free-form running checklist (Toolbox to-do tool).
      todos: [],
      // Day sync: the switch, gen, whose day this is, tombstones.
      sync,
    },
    today
  );
}

const initialState = freshHome(localDate());

// Deleting = hide the item and keep a tombstone (no content) for the server.
function removeLive(state, section, id, now) {
  const item = state[section].find((it) => it.id === id);
  if (!item) return;
  const tomb = tombstoneFor(item, now);
  state[section] = state[section].filter((it) => it.id !== id);
  state.sync.gone[section] = withTombstone(plain(state.sync.gone[section]), tomb);
}

const homeSlice = createSlice({
  name: "home",
  initialState,
  reducers: {
    // Storage → state. Saves from 0.3.0 and older get their stamps here
    // (dayModel.migrateHome: the contract's "Old saves"); yesterday's ticks
    // stop counting because done / status are derived for today.
    hydrateHome: {
      reducer(state, action) {
        const { now, today } = stampsFrom(action.meta);
        return migrateHome(action.payload, current(state), { now, today });
      },
      prepare: timed,
    },
    setNervousState(state, action) {
      state.nervousState = action.payload;
    },
    clearNervousState(state) {
      state.nervousState = undefined;
      state.nervousLevel = undefined;
    },
    // One check-in from the Home slider or a state button: the state, its
    // exact level, and a history entry, updated together so they never
    // disagree. Home still dispatches setNervousState right after, so every
    // existing listener sees the usual action.
    recordCheckin: {
      reducer(state, action) {
        const { state: mood, level, at } = action.payload || {};
        if (!CHECKIN_STATES.has(mood)) return;
        const lv = cleanLevel(level);
        if (!Array.isArray(state.checkins)) state.checkins = [];
        const list = state.checkins;
        const entry = { state: mood, level: lv ?? null, at };
        const last = list[list.length - 1];
        const t = Date.parse(at);
        if (last && t < Date.parse(last.at)) {
          // Older than the newest check-in (a widget tap the app hears about
          // later): it joins the history in time order and the newer state
          // stays as it is.
          let i = list.length;
          while (i > 0 && Date.parse(list[i - 1].at) > t) i -= 1;
          list.splice(i, 0, entry);
        } else {
          state.nervousState = mood;
          state.nervousLevel = lv;
          if (last && t - Date.parse(last.at) < CHECKIN_MERGE_MS) list[list.length - 1] = entry;
          else list.push(entry);
        }
        if (list.length > CHECKIN_CAP) list.splice(0, list.length - CHECKIN_CAP);
      },
      // `at` defaults to now. A check-in made elsewhere (a widget tap while
      // the app was closed) keeps the time it was made, never a future one.
      prepare(payload) {
        const now = Date.now();
        const given = payload && typeof payload.at === "string" ? Date.parse(payload.at) : NaN;
        const at = Number.isFinite(given) && given <= now ? given : now;
        return { payload: { ...payload, at: new Date(at).toISOString() } };
      },
    },
    // ---- minimum viable day ----
    toggleTask: {
      reducer(state, action) {
        const { now, today } = stampsFrom(action.meta);
        const task = state.tasks.find((entry) => entry.id === action.payload);
        if (task) {
          // What the person sees flips (a tick from yesterday already shows
          // as open, so tapping it ticks it for today).
          task.doneOn = task.done ? null : today;
          task.tickAt = later(now, task.tickAt);
        }
        deriveDay(state, today);
      },
      prepare: timed,
    },
    addTask: {
      reducer(state, action) {
        const { now, today } = stampsFrom(action.meta);
        const title = String(action.payload || "").trim();
        if (!title) return;
        const at = createdStamp(now, state.tasks);
        state.tasks.push({ id: action.meta?.id || freshId("t"), title, done: false, createdAt: at, updatedAt: at, doneOn: null, tickAt: null });
        deriveDay(state, today);
      },
      prepare: timedWithId("t"),
    },
    removeTask: {
      reducer(state, action) {
        removeLive(state, "tasks", action.payload, stampsFrom(action.meta).now);
      },
      prepare: timed,
    },
    renameTask: {
      reducer(state, action) {
        const { now } = stampsFrom(action.meta);
        const { id, title } = action.payload || {};
        const task = state.tasks.find((t) => t.id === id);
        const next = String(title || "").trim();
        if (task && next && next !== task.title) {
          task.title = next;
          task.updatedAt = later(now, task.updatedAt);
        }
      },
      prepare: timed,
    },
    // ---- timed anchors (planner) ----
    addAnchor: {
      reducer(state, action) {
        const { now, today } = stampsFrom(action.meta);
        const { title, subtitle, hour, minute, icon, location } = action.payload || {};
        if (!String(title || "").trim()) return;
        const at = later(now);
        state.anchors.push({
          id: action.meta?.id || freshId("a"),
          title: String(title).trim(),
          subtitle: String(subtitle || "").trim(),
          time: {
            hour: Math.max(0, Math.min(23, hour ?? 9)),
            minute: Math.max(0, Math.min(59, minute ?? 0)),
          },
          status: "upcoming",
          icon: icon || "flag",
          // P8: optional place-based trigger {lat, lng, radius}
          location: location || null,
          createdAt: at,
          updatedAt: at,
          doneOn: null,
          tickAt: null,
        });
        state.anchors.sort(ORDER.anchors);
        deriveDay(state, today);
      },
      prepare: timedWithId("a"),
    },
    updateAnchor: {
      reducer(state, action) {
        const { now } = stampsFrom(action.meta);
        const { id, ...patch } = action.payload || {};
        const anchor = state.anchors.find((a) => a.id === id);
        if (!anchor) return;
        const before = definitionKey(anchor, "anchors");
        // Fields this app doesn't edit (another client's category,
        // flexMinutes, anything added later) stay as they are.
        if (patch.title !== undefined) anchor.title = String(patch.title).trim();
        if (patch.subtitle !== undefined) anchor.subtitle = String(patch.subtitle).trim();
        if (patch.hour !== undefined || patch.minute !== undefined) {
          anchor.time = {
            ...anchor.time,
            hour: Math.max(0, Math.min(23, patch.hour ?? anchor.time.hour)),
            minute: Math.max(0, Math.min(59, patch.minute ?? anchor.time.minute)),
          };
        }
        if (patch.icon !== undefined) anchor.icon = patch.icon;
        // P8: place-based anchor — {lat, lng, radius} or null to detach
        if (patch.location !== undefined) anchor.location = patch.location;
        // Saving the editor unchanged is not an edit (it must not beat a
        // real edit made on another device).
        if (definitionKey(anchor, "anchors") !== before) anchor.updatedAt = later(now, anchor.updatedAt);
        state.anchors.sort(ORDER.anchors);
      },
      prepare: timed,
    },
    removeAnchor: {
      reducer(state, action) {
        removeLive(state, "anchors", action.payload, stampsFrom(action.meta).now);
      },
      prepare: timed,
    },
    setAnchorStatus: {
      reducer(state, action) {
        const { now, today } = stampsFrom(action.meta);
        const { id, status } = action.payload || {};
        const anchor = state.anchors.find((a) => a.id === id);
        if (anchor) {
          const done = status === "done";
          if ((anchor.doneOn === today) !== done) {
            anchor.doneOn = done ? today : null;
            anchor.tickAt = later(now, anchor.tickAt);
          }
        }
        deriveDay(state, today);
      },
      prepare: timed,
    },
    // ---- running to-do list ----
    addTodo: {
      reducer(state, action) {
        const { now } = stampsFrom(action.meta);
        const title = String(action.payload || "").trim();
        if (!title) return;
        const at = createdStamp(now, state.todos);
        state.todos.push({ id: action.meta?.id || freshId("td"), title, done: false, createdAt: at, updatedAt: at });
      },
      prepare: timedWithId("td"),
    },
    // A to-do's `done` is part of what it is (it doesn't reset each day).
    toggleTodo: {
      reducer(state, action) {
        const { now } = stampsFrom(action.meta);
        const todo = state.todos.find((t) => t.id === action.payload);
        if (todo) {
          todo.done = !todo.done;
          todo.updatedAt = later(now, todo.updatedAt);
        }
      },
      prepare: timed,
    },
    removeTodo: {
      reducer(state, action) {
        removeLive(state, "todos", action.payload, stampsFrom(action.meta).now);
      },
      prepare: timed,
    },
    clearDoneTodos: {
      reducer(state, action) {
        const { now } = stampsFrom(action.meta);
        for (const todo of state.todos.filter((t) => t.done)) removeLive(state, "todos", todo.id, now);
      },
      prepare: timed,
    },
    // Undo for a deleted task, anchor or to-do: the item comes back as an
    // edit (updatedAt after its deletion), which is how the server sees it.
    // payload.item is the whole item from the screen's own undo state: once
    // the deletion has synced, the server's copy (and ours) has no content.
    restoreDayItem: {
      reducer(state, action) {
        const { now, today } = stampsFrom(action.meta);
        const { section, item } = action.payload || {};
        if (!SECTIONS.includes(section) || !item || typeof item.id !== "string") return;
        if (state[section].some((it) => it.id === item.id)) return;
        const gone = plain(state.sync.gone[section]);
        const tomb = gone.find((t) => t.id === item.id);
        const restored = { ...item, updatedAt: later(now, item.updatedAt, tomb && tomb.deletedAt) };
        delete restored.deletedAt;
        state.sync.gone[section] = gone.filter((t) => t.id !== item.id);
        state[section].push(restored);
        state[section].sort(ORDER[section]);
        deriveDay(state, today);
      },
      prepare: timed,
    },
    // ---- the date and day sync ----
    // The date changed while the app was open: re-derive done / status.
    refreshDay: {
      reducer(state, action) {
        deriveDay(state, stampsFrom(action.meta).today);
      },
      prepare: timed,
    },
    // "Keep my day in sync". Switching it on again is a first sync (§8): the
    // stored gen is forgotten, so a day erased elsewhere meanwhile is added
    // back instead of lost.
    setDaySyncEnabled(state, action) {
      const on = Boolean(action.payload);
      if (on && !state.sync.enabled) state.sync.gen = 0;
      state.sync.enabled = on;
    },
    // A day that never synced joins the first account it syncs as.
    setDayOwner(state, action) {
      state.sync.owner = typeof action.payload === "string" && action.payload ? action.payload : null;
    },
    // The day last synced as another account: clear it (and its gen) before
    // anything is sent as this one (payload: the new account's id). Pal's
    // brain dump clears on the same action (palSlice).
    resetDay: {
      reducer(state, action) {
        const { today } = stampsFrom(action.meta);
        const owner = typeof action.payload === "string" && action.payload ? action.payload : null;
        const snap = current(state);
        return { ...snap, ...freshHome(today, { ...defaultSyncMeta(), enabled: snap.sync.enabled, owner }) };
      },
      prepare: timed,
    },
    // The server's merged day (payload: the sync answer). Sections are
    // replaced unless identical (so screens and the anchor schedule don't
    // churn); local items the answer doesn't mention stay. Home's state and
    // slider follow the newest check-in when it is newer than ours. The
    // brain dump is adopted from the same action (palSlice).
    adoptDay: {
      reducer(state, action) {
        const { now, today } = stampsFrom(action.meta);
        const body = action.payload;
        if (!isDayBody(body)) return;
        const snap = current(state);
        const next = adoptHome(snap, body, { today });
        for (const section of SECTIONS) {
          const r = next.sections[section];
          if (!r) continue;
          if (canonical(r.live) !== canonical(snap[section])) state[section] = r.live;
          if (canonical(r.gone) !== canonical(snap.sync.gone[section])) state.sync.gone[section] = r.gone;
        }
        if (next.checkins && canonical(next.checkins) !== canonical(snap.checkins)) state.checkins = next.checkins;
        if (next.follow) {
          state.nervousState = next.follow.state;
          state.nervousLevel = cleanLevel(next.follow.level);
        }
        state.sync.gen = next.gen;
        state.sync.lastSyncAt = now;
        deriveDay(state, today);
      },
      prepare: timed,
    },
  },
});

export const {
  clearNervousState,
  hydrateHome,
  setNervousState,
  recordCheckin,
  toggleTask,
  addTask,
  removeTask,
  renameTask,
  addAnchor,
  updateAnchor,
  removeAnchor,
  setAnchorStatus,
  addTodo,
  toggleTodo,
  removeTodo,
  clearDoneTodos,
  restoreDayItem,
  refreshDay,
  setDaySyncEnabled,
  setDayOwner,
  resetDay,
  adoptDay,
} = homeSlice.actions;

// What AppProviders writes to storage ("np.home.v2"; hydrateHome reads it
// back, old saves included).
export function persistedHome(home) {
  return {
    nervousState: home.nervousState,
    // Home check-in slider: exact level + capped history.
    nervousLevel: home.nervousLevel,
    checkins: home.checkins,
    tasks: home.tasks,
    anchors: home.anchors,
    todos: home.todos,
    dayStamp: home.dayStamp,
    sync: home.sync,
  };
}

export default homeSlice.reducer;

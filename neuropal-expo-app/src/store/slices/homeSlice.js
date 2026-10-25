import { createSlice } from "@reduxjs/toolkit";

import { createMockTasks, mockAnchors } from "../../data/mockData";

// Local date stamp (YYYY-MM-DD) — the MVD resets each morning.
function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Check-in history from the Home slider: newest last, capped. Adjustments
// made within CHECKIN_MERGE_MS of the last entry refine that entry instead of
// adding a new one (one check-in = one settled feeling, not every key press).
export const CHECKIN_CAP = 200;
export const CHECKIN_MERGE_MS = 60 * 1000;
const CHECKIN_STATES = new Set(["green", "yellow", "red"]);

function cleanLevel(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}

// Older saves have no checkins; anything malformed is dropped, never thrown.
function cleanCheckins(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const c of list) {
    if (!c || !CHECKIN_STATES.has(c.state) || typeof c.at !== "string" || Number.isNaN(Date.parse(c.at))) continue;
    out.push({ state: c.state, level: cleanLevel(c.level) ?? null, at: c.at });
  }
  return out.slice(-CHECKIN_CAP);
}

const initialState = {
  nervousState: undefined,
  // Exact level on the Home check-in slider, 0–1 (undefined until the first
  // check-in). recordCheckin keeps it in step with nervousState; if the state
  // is ever set on its own, the slider shows that state's middle instead.
  nervousLevel: undefined,
  // [{ state, level, at }] — see CHECKIN_CAP / CHECKIN_MERGE_MS above.
  checkins: [],
  // Minimum viable day — 3-5 core items, re-set every morning.
  tasks: createMockTasks(),
  dayStamp: todayStamp(),
  // Timed anchors (medication, breaks, appointments) — the planner. The
  // Home "Next anchor" card is derived from these.
  anchors: mockAnchors,
  // Free-form running checklist (Toolbox to-do tool).
  todos: [],
};

let idCounter = 0;
function freshId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

const homeSlice = createSlice({
  name: "home",
  initialState,
  reducers: {
    hydrateHome(state, action) {
      Object.assign(state, action.payload);
      if (!Array.isArray(state.todos)) state.todos = [];
      if (!Array.isArray(state.anchors)) state.anchors = [];
      // Slider check-ins (saves from before the slider have neither field).
      state.nervousLevel = cleanLevel(state.nervousLevel);
      state.checkins = cleanCheckins(state.checkins);
      // New day → yesterday's checkmarks don't count anymore.
      const today = todayStamp();
      if (state.dayStamp !== today) {
        state.dayStamp = today;
        state.tasks.forEach((t) => {
          t.done = false;
        });
        state.anchors.forEach((a) => {
          a.status = "upcoming";
        });
      }
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
    toggleTask(state, action) {
      const task = state.tasks.find((entry) => entry.id === action.payload);
      if (task) {
        task.done = !task.done;
      }
    },
    addTask(state, action) {
      const title = String(action.payload || "").trim();
      if (!title) return;
      state.tasks.push({ id: freshId("t"), title, done: false });
    },
    removeTask(state, action) {
      state.tasks = state.tasks.filter((t) => t.id !== action.payload);
    },
    renameTask(state, action) {
      const { id, title } = action.payload;
      const task = state.tasks.find((t) => t.id === id);
      if (task && String(title || "").trim()) task.title = title.trim();
    },
    // ---- timed anchors (planner) ----
    addAnchor(state, action) {
      const { title, subtitle, hour, minute, icon, location } = action.payload;
      if (!String(title || "").trim()) return;
      state.anchors.push({
        id: freshId("a"),
        title: title.trim(),
        subtitle: String(subtitle || "").trim(),
        time: {
          hour: Math.max(0, Math.min(23, hour ?? 9)),
          minute: Math.max(0, Math.min(59, minute ?? 0)),
        },
        status: "upcoming",
        icon: icon || "flag",
        // P8: optional place-based trigger {lat, lng, radius}
        location: location || null,
      });
      state.anchors.sort(
        (a, b) => a.time.hour * 60 + a.time.minute - (b.time.hour * 60 + b.time.minute)
      );
    },
    updateAnchor(state, action) {
      const { id, ...patch } = action.payload;
      const anchor = state.anchors.find((a) => a.id === id);
      if (!anchor) return;
      if (patch.title !== undefined) anchor.title = String(patch.title).trim();
      if (patch.subtitle !== undefined) anchor.subtitle = String(patch.subtitle).trim();
      if (patch.hour !== undefined || patch.minute !== undefined) {
        anchor.time = {
          hour: Math.max(0, Math.min(23, patch.hour ?? anchor.time.hour)),
          minute: Math.max(0, Math.min(59, patch.minute ?? anchor.time.minute)),
        };
      }
      if (patch.icon !== undefined) anchor.icon = patch.icon;
      // P8: place-based anchor — {lat, lng, radius} or null to detach
      if (patch.location !== undefined) anchor.location = patch.location;
      state.anchors.sort(
        (a, b) => a.time.hour * 60 + a.time.minute - (b.time.hour * 60 + b.time.minute)
      );
    },
    removeAnchor(state, action) {
      state.anchors = state.anchors.filter((a) => a.id !== action.payload);
    },
    setAnchorStatus(state, action) {
      const { id, status } = action.payload;
      const anchor = state.anchors.find((a) => a.id === id);
      if (anchor) anchor.status = status;
    },
    // ---- running to-do list ----
    addTodo(state, action) {
      const title = String(action.payload || "").trim();
      if (!title) return;
      state.todos.push({ id: freshId("td"), title, done: false });
    },
    toggleTodo(state, action) {
      const todo = state.todos.find((t) => t.id === action.payload);
      if (todo) todo.done = !todo.done;
    },
    removeTodo(state, action) {
      state.todos = state.todos.filter((t) => t.id !== action.payload);
    },
    clearDoneTodos(state) {
      state.todos = state.todos.filter((t) => !t.done);
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
} = homeSlice.actions;

export default homeSlice.reducer;

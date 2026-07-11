import { createSlice } from "@reduxjs/toolkit";

import { createMockTasks, mockAnchors } from "../../data/mockData";

// Local date stamp (YYYY-MM-DD) — the MVD resets each morning.
function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const initialState = {
  nervousState: undefined,
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

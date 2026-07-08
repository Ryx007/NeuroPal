import { createSlice } from "@reduxjs/toolkit";

// Pomodoro state. `endsAt` is an absolute epoch-ms timestamp so the timer
// survives re-renders, tab switches, app restarts, and clock drift — the UI
// derives "remaining" from it, never counts down in state.

const initialState = {
  running: false,
  phase: "work", // 'work' | 'break'
  endsAt: null, // epoch ms while running
  workMin: 25,
  breakMin: 5,
  cyclesDone: 0,
  notificationId: null,
};

const focusSlice = createSlice({
  name: "focus",
  initialState,
  reducers: {
    hydrateFocus(state, action) {
      Object.assign(state, action.payload || {});
      // A phase that expired while the app was closed is not "running".
      if (state.endsAt && state.endsAt <= Date.now()) {
        if (state.phase === "work") state.cyclesDone += 1;
        state.phase = state.phase === "work" ? "break" : "work";
        state.running = false;
        state.endsAt = null;
        state.notificationId = null;
      }
    },
    startPhase(state, action) {
      state.running = true;
      state.endsAt = action.payload.endsAt;
      state.notificationId = action.payload.notificationId || null;
    },
    pausePhase(state) {
      state.running = false;
      state.endsAt = null;
      state.notificationId = null;
    },
    phaseCompleted(state) {
      if (state.phase === "work") state.cyclesDone += 1;
      state.phase = state.phase === "work" ? "break" : "work";
      state.running = false;
      state.endsAt = null;
      state.notificationId = null;
    },
    resetFocus(state) {
      state.running = false;
      state.phase = "work";
      state.endsAt = null;
      state.notificationId = null;
      state.cyclesDone = 0;
    },
    setDurations(state, action) {
      const { workMin, breakMin } = action.payload;
      if (workMin) state.workMin = Math.max(5, Math.min(90, workMin));
      if (breakMin) state.breakMin = Math.max(1, Math.min(30, breakMin));
    },
  },
});

export const {
  hydrateFocus,
  startPhase,
  pausePhase,
  phaseCompleted,
  resetFocus,
  setDurations,
} = focusSlice.actions;

export default focusSlice.reducer;

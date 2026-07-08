import { createSlice } from "@reduxjs/toolkit";

import { createMockTasks, mockAnchors } from "../../data/mockData";

const initialState = {
  nervousState: undefined,
  tasks: createMockTasks(),
  anchors: mockAnchors,
};

const homeSlice = createSlice({
  name: "home",
  initialState,
  reducers: {
    hydrateHome(state, action) {
      Object.assign(state, action.payload);
    },
    setNervousState(state, action) {
      state.nervousState = action.payload;
    },
    clearNervousState(state) {
      state.nervousState = undefined;
    },
    toggleTask(state, action) {
      const task = state.tasks.find((entry) => entry.id === action.payload);
      if (task) {
        task.done = !task.done;
      }
    },
  },
});

export const {
  clearNervousState,
  hydrateHome,
  setNervousState,
  toggleTask,
} = homeSlice.actions;

export default homeSlice.reducer;

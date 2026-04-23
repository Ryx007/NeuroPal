import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { MockAnchors, MockMvd } from "@/data/mock";
import type { Anchor, MvdTask, NervousState } from "@/models/types";

export interface HomeState {
  nervousState?: NervousState;
  tasks: MvdTask[];
  anchors: Anchor[];
}

export const initialHomeState: HomeState = {
  nervousState: undefined,
  tasks: MockMvd(),
  anchors: MockAnchors,
};

const homeSlice = createSlice({
  name: "home",
  initialState: initialHomeState,
  reducers: {
    hydrateHome(state, action: PayloadAction<Partial<HomeState>>) {
      Object.assign(state, action.payload);
    },
    setNervousState(state, action: PayloadAction<NervousState>) {
      state.nervousState = action.payload;
    },
    clearNervousState(state) {
      state.nervousState = undefined;
    },
    toggleTask(state, action: PayloadAction<string>) {
      const task = state.tasks.find((entry) => entry.id === action.payload);
      if (task) task.done = !task.done;
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

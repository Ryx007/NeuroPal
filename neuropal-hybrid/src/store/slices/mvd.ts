import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { MockMvd } from "@/data/mock";
import type { MvdTask } from "@/models/types";

interface State {
  tasks: MvdTask[];
}

const initial: State = { tasks: MockMvd() };

const slice = createSlice({
  name: "mvd",
  initialState: initial,
  reducers: {
    toggle: (s, a: PayloadAction<string>) => {
      const t = s.tasks.find((x) => x.id === a.payload);
      if (t) t.done = !t.done;
    },
  },
});

export const selectRemaining = (tasks: MvdTask[]) =>
  tasks.filter((t) => !t.done).length;

export const { toggle: toggleMvd } = slice.actions;
export default slice.reducer;

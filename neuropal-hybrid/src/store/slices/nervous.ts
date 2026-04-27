import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import type { NervousState } from "@/models/types";

interface State {
  value?: NervousState;
}

const initial: State = { value: undefined };

const slice = createSlice({
  name: "nervous",
  initialState: initial,
  reducers: {
    set: (s, a: PayloadAction<NervousState>) => {
      s.value = a.payload;
    },
    clear: (s) => {
      s.value = undefined;
    },
  },
});

export const { set: setNervous, clear: clearNervous } = slice.actions;
export default slice.reducer;

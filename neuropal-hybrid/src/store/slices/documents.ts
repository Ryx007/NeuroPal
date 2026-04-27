import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { MockDocuments } from "@/data/mock";
import type { NpDocument } from "@/models/types";

interface State {
  docs: NpDocument[];
}

const initial: State = { docs: MockDocuments };

const slice = createSlice({
  name: "documents",
  initialState: initial,
  reducers: {
    add: (s, a: PayloadAction<NpDocument>) => {
      s.docs.unshift(a.payload);
    },
  },
});

export const selectDocById = (
  docs: NpDocument[],
  id?: string
): NpDocument => docs.find((d) => d.id === id) ?? docs[0];

export const { add: addDoc } = slice.actions;
export default slice.reducer;

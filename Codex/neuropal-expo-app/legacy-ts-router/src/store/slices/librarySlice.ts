import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { MockDocuments } from "@/data/mock";
import type { NpDocument } from "@/models/types";

export interface LibraryState {
  docs: NpDocument[];
}

export const initialLibraryState: LibraryState = {
  docs: MockDocuments,
};

const librarySlice = createSlice({
  name: "library",
  initialState: initialLibraryState,
  reducers: {
    hydrateLibrary(state, action: PayloadAction<Partial<LibraryState>>) {
      Object.assign(state, action.payload);
    },
    addDocument(state, action: PayloadAction<NpDocument>) {
      state.docs.unshift(action.payload);
    },
  },
});

export const { addDocument, hydrateLibrary } = librarySlice.actions;

export default librarySlice.reducer;

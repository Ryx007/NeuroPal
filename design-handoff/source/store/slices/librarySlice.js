import { createSlice } from "@reduxjs/toolkit";

import { mockDocuments } from "../../data/mockData";
import { USE_MOCK } from "../../services/network";

// Mock docs only when explicitly requested — an empty library on a fresh
// backend is truthful, a fake populated one is not.
const initialState = {
  docs: USE_MOCK ? mockDocuments : [],
};

const librarySlice = createSlice({
  name: "library",
  initialState,
  reducers: {
    hydrateLibrary(state, action) {
      Object.assign(state, action.payload);
    },
    addDocument(state, action) {
      state.docs.unshift(action.payload);
    },
  },
});

export const { addDocument, hydrateLibrary } = librarySlice.actions;

export default librarySlice.reducer;

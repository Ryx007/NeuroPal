import { createSlice } from "@reduxjs/toolkit";

import { mockDocuments } from "../../data/mockData";

const initialState = {
  docs: mockDocuments,
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

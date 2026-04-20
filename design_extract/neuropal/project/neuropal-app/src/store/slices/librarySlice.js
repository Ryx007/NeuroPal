// ─── Library slice: filter, items ────────────────────────────────────
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  filter: 'all',
};

const librarySlice = createSlice({
  name: 'library',
  initialState,
  reducers: {
    setFilter: (s, a) => { s.filter = a.payload; },
  },
});

export const { setFilter } = librarySlice.actions;
export default librarySlice.reducer;

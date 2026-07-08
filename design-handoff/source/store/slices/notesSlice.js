import { createSlice } from "@reduxjs/toolkit";

// Handwritten notes. Each note is a list of ink strokes:
//   { points: [[x, y], ...], color, width }
// Point arrays (not path strings) so the stroke eraser can hit-test.

const initialState = {
  items: [], // [{ id, title, strokes, updatedAt }]
};

const notesSlice = createSlice({
  name: "notes",
  initialState,
  reducers: {
    hydrateNotes(state, action) {
      if (Array.isArray(action.payload?.items)) state.items = action.payload.items;
    },
    createNote(state, action) {
      state.items.unshift({
        id: action.payload.id,
        title: action.payload.title || "Untitled note",
        strokes: [],
        updatedAt: new Date().toISOString(),
      });
    },
    saveNote(state, action) {
      const { id, strokes, title } = action.payload;
      const note = state.items.find((n) => n.id === id);
      if (!note) return;
      if (strokes) note.strokes = strokes;
      if (title !== undefined) note.title = title;
      note.updatedAt = new Date().toISOString();
    },
    deleteNote(state, action) {
      state.items = state.items.filter((n) => n.id !== action.payload);
    },
  },
});

export const { hydrateNotes, createNote, saveNote, deleteNote } =
  notesSlice.actions;

export default notesSlice.reducer;

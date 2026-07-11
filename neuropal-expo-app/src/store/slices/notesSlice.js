import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import {
  createNoteApi,
  deleteNoteApi,
  listNotesApi,
  updateNoteApi,
  USE_MOCK,
} from "../../services/network";
import { apiConfigured } from "../ApiLink";

// P6 — notes sync through the backend (typed Markdown + ink strokes, one
// model). The slice keeps the last fetched list (persisted to AsyncStorage
// by AppProviders as an offline cache); the backend is the source of truth
// whenever it's reachable. Legacy PRE-P6 ink notes lived only in this slice
// — migrateLocalNotes pushes them up once, then the server list replaces
// them.

const normalise = (n) => ({
  ...n,
  id: n._id || n.id,
  strokes: n.strokes || [],
  contentMarkdown: n.contentMarkdown || "",
});

export const loadNotes = createAsyncThunk("notes/load", async () =>
  (await listNotesApi()).map(normalise)
);

export const createNoteRemote = createAsyncThunk(
  "notes/create",
  async (payload) => normalise(await createNoteApi(payload))
);

export const updateNoteRemote = createAsyncThunk(
  "notes/update",
  async ({ id, ...payload }) => normalise(await updateNoteApi(id, payload))
);

export const removeNoteRemote = createAsyncThunk(
  "notes/remove",
  async ({ id }) => {
    await deleteNoteApi(id);
    return id;
  }
);

// One-time migration: any note still carrying a local `n-…` id predates the
// backend model — push it up as an ink note, then reload the server list.
export const migrateLocalNotes = createAsyncThunk(
  "notes/migrate",
  async (_, { getState, dispatch }) => {
    if (USE_MOCK || !apiConfigured) return 0;
    const locals = getState().notes.items.filter(
      (n) => !n._id && String(n.id).startsWith("n-")
    );
    for (const n of locals) {
      try {
        await createNoteApi({
          kind: "ink",
          title: n.title,
          strokes: n.strokes || [],
        });
      } catch (e) {
        // backend unreachable — keep the local copy, try again next open
        return 0;
      }
    }
    await dispatch(loadNotes());
    return locals.length;
  }
);

const initialState = {
  items: [], // [{ id, _id?, kind, title, strokes, contentMarkdown, documentId, anchor, updatedAt }]
  loading: false,
  error: null,
  // cross-screen "open this note when the Notes screen shows" handoff — in
  // redux, NOT route params: drawer screens never unmount and RN7 param
  // delivery to them has proven unreliable (same class as the P4 wrong-doc
  // bug), so the Reader sets this and NotesScreen consumes it on focus.
  pendingOpenId: null,
};

const notesSlice = createSlice({
  name: "notes",
  initialState,
  reducers: {
    hydrateNotes(state, action) {
      if (Array.isArray(action.payload?.items)) state.items = action.payload.items;
    },
    setPendingOpenNote(state, action) {
      state.pendingOpenId = action.payload || null;
    },
    clearPendingOpenNote(state) {
      state.pendingOpenId = null;
    },
    // synchronous local edits keep the ink canvas responsive while drawing;
    // the editor pushes the final strokes to the server on back/blur
    saveNote(state, action) {
      const { id, strokes, title, contentMarkdown } = action.payload;
      const note = state.items.find((n) => n.id === id);
      if (!note) return;
      if (strokes) note.strokes = strokes;
      if (title !== undefined) note.title = title;
      if (contentMarkdown !== undefined) note.contentMarkdown = contentMarkdown;
      note.updatedAt = new Date().toISOString();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadNotes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadNotes.fulfilled, (state, action) => {
        state.loading = false;
        // keep un-migrated local notes visible below the server list
        const locals = state.items.filter(
          (n) => !n._id && String(n.id).startsWith("n-")
        );
        state.items = [...action.payload, ...locals];
      })
      .addCase(loadNotes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message || "Could not load notes.";
      })
      .addCase(createNoteRemote.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(updateNoteRemote.fulfilled, (state, action) => {
        const i = state.items.findIndex((n) => n.id === action.payload.id);
        if (i >= 0) state.items[i] = action.payload;
      })
      .addCase(removeNoteRemote.fulfilled, (state, action) => {
        state.items = state.items.filter((n) => n.id !== action.payload);
      });
  },
});

export const { hydrateNotes, saveNote, setPendingOpenNote, clearPendingOpenNote } =
  notesSlice.actions;

export default notesSlice.reducer;

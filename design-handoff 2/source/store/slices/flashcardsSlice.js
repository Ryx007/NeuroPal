import { createSlice } from "@reduxjs/toolkit";

// Generated flashcard decks, keyed by documentId — persisted so a deck
// survives app restarts and doesn't need regenerating (and re-billing).

const initialState = {
  byDoc: {}, // { [docId]: { cards: [{front, back}], generatedAt } }
};

const flashcardsSlice = createSlice({
  name: "flashcards",
  initialState,
  reducers: {
    hydrateFlashcards(state, action) {
      if (action.payload?.byDoc) state.byDoc = action.payload.byDoc;
    },
    setDeck(state, action) {
      const { docId, cards } = action.payload;
      state.byDoc[docId] = { cards, generatedAt: new Date().toISOString() };
    },
    clearDeck(state, action) {
      delete state.byDoc[action.payload];
    },
  },
});

export const { hydrateFlashcards, setDeck, clearDeck } = flashcardsSlice.actions;

export default flashcardsSlice.reducer;

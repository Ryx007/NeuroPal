import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { mockReaderMessages } from "../../data/mockData";
import { askReaderQuestion } from "../../services/network";

export const requestReaderAnswer = createAsyncThunk(
  "reader/requestReaderAnswer",
  async ({ documentId, paragraphId, question, excerpt }) => {
    const response = await askReaderQuestion({
      documentId,
      paragraphId,
      question,
      excerpt,
    });

    return {
      id: `c-${Date.now()}`,
      paragraphId,
      question,
      answer: response.answer,
      citations: response.citations || [],
      at: new Date().toISOString(),
    };
  }
);

const initialState = {
  messages: mockReaderMessages,
  playing: false,
  wordIndex: 0,
  totalWords: 0,
  asking: false,
};

const readerSlice = createSlice({
  name: "reader",
  initialState,
  reducers: {
    hydrateReader(state, action) {
      if (action.payload?.messages) {
        state.messages = action.payload.messages;
      }
      state.playing = false;
      state.wordIndex = 0;
      state.totalWords = 0;
      state.asking = false;
    },
    playReader(state) {
      state.playing = true;
    },
    pauseReader(state) {
      state.playing = false;
    },
    resetReader(state) {
      state.playing = false;
      state.wordIndex = 0;
    },
    setReaderWord(state, action) {
      state.wordIndex = action.payload;
    },
    setReaderTotalWords(state, action) {
      state.totalWords = action.payload;
    },
    advanceReader(state) {
      if (state.wordIndex + 1 >= state.totalWords) {
        state.playing = false;
        return;
      }
      state.wordIndex += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(requestReaderAnswer.pending, (state) => {
        state.asking = true;
      })
      .addCase(requestReaderAnswer.fulfilled, (state, action) => {
        state.asking = false;
        state.messages.push(action.payload);
      })
      .addCase(requestReaderAnswer.rejected, (state, action) => {
        state.asking = false;
        state.messages.push({
          id: `c-${Date.now()}`,
          paragraphId: action.meta.arg.paragraphId,
          question: action.meta.arg.question,
          answer:
            "The request did not complete. NeuroPal kept the note locally so you can retry when your API endpoint is available.",
          citations: ["local-error"],
          at: new Date().toISOString(),
        });
      });
  },
});

export const {
  advanceReader,
  hydrateReader,
  pauseReader,
  playReader,
  resetReader,
  setReaderTotalWords,
  setReaderWord,
} = readerSlice.actions;

export default readerSlice.reducer;

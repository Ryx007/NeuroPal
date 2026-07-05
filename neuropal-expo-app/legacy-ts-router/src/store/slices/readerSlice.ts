import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { MockSeedChat } from "@/data/mock";
import type { ChatMessage } from "@/models/types";

export interface ReaderState {
  messages: ChatMessage[];
  playing: boolean;
  wordIndex: number;
  totalWords: number;
}

export const initialReaderState: ReaderState = {
  messages: MockSeedChat,
  playing: false,
  wordIndex: 0,
  totalWords: 0,
};

const readerSlice = createSlice({
  name: "reader",
  initialState: initialReaderState,
  reducers: {
    hydrateReader(state, action: PayloadAction<Partial<ReaderState>>) {
      const payload = action.payload;
      if (payload.messages) state.messages = payload.messages;
      state.playing = false;
      state.wordIndex = 0;
      state.totalWords = 0;
    },
    addReaderMessage: {
      reducer(state, action: PayloadAction<ChatMessage>) {
        state.messages.push(action.payload);
      },
      prepare(args: { paragraphId: string; question: string }) {
        return {
          payload: {
            id: `c-${Date.now()}`,
            paragraphId: args.paragraphId,
            question: args.question,
            answer:
              "Pending Claude API call. When the RAG pipeline is wired up this answer will be grounded in the surrounding chunks and return source page references.",
            citations: [],
            at: new Date(),
          } satisfies ChatMessage,
        };
      },
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
    setReaderWord(state, action: PayloadAction<number>) {
      state.wordIndex = action.payload;
    },
    setReaderTotalWords(state, action: PayloadAction<number>) {
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
});

export const {
  addReaderMessage,
  advanceReader,
  hydrateReader,
  pauseReader,
  playReader,
  resetReader,
  setReaderTotalWords,
  setReaderWord,
} = readerSlice.actions;

export default readerSlice.reducer;

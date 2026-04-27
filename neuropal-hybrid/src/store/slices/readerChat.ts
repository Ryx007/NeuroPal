import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { MockSeedChat } from "@/data/mock";
import type { ChatMessage } from "@/models/types";

interface State {
  messages: ChatMessage[];
}

const initial: State = { messages: MockSeedChat };

const slice = createSlice({
  name: "readerChat",
  initialState: initial,
  reducers: {
    ask: (
      s,
      a: PayloadAction<{ paragraphId: string; question: string }>
    ) => {
      s.messages.push({
        id: `c-${Date.now()}`,
        paragraphId: a.payload.paragraphId,
        question: a.payload.question,
        answer:
          "Pending Claude API call. When the RAG pipeline is wired up this answer will be grounded in the surrounding chunks and return source page references.",
        citations: [],
        at: new Date(),
      });
    },
  },
});

export const { ask: askReader } = slice.actions;
export default slice.reducer;

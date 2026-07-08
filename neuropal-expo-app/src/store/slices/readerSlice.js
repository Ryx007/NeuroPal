import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { mockReaderMessages } from "../../data/mockData";
import {
  askReaderQuestion,
  fetchDocumentText,
  USE_MOCK,
} from "../../services/network";

export const requestReaderAnswer = createAsyncThunk(
  "reader/requestReaderAnswer",
  async ({ documentId, paragraphId, question, excerpt, kind }) => {
    const response = await askReaderQuestion({
      documentId,
      paragraphId,
      question,
      excerpt,
      kind,
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

// Backend documents carry no `sections` (only the mock ones do) — the reader
// pulls the ingested plain text and shapes it into the same structure.
export const fetchReaderDocument = createAsyncThunk(
  "reader/fetchReaderDocument",
  async ({ documentId }) => {
    const data = await fetchDocumentText(documentId);
    return { documentId, title: data?.title, text: data?.text };
  }
);

// Paragraphs split on blank lines (chunk boundaries in the /text response);
// single newlines inside a paragraph are PDF line wraps — collapsed to spaces.
// Paragraphs are then capped: a wall-of-text document with no blank lines
// (single-paragraph TXT dump) would otherwise become one enormous <Text>
// block — and word-splitting it with a spread-push can exceed the JS
// argument limit outright.
const MAX_PARAGRAPH_WORDS = 180;

// A 400-page book is thousands of paragraphs — far more than a phone can
// render at once. Paragraphs are grouped into "Part N" sections; the Reader
// renders one section at a time and auto-advances as playback crosses
// section boundaries.
const SECTION_PARAGRAPHS = 40;

function textToSections({ documentId, title, text }) {
  const rough = (text || "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const paragraphs = [];
  for (const p of rough) {
    const words = p.split(" ");
    if (words.length <= MAX_PARAGRAPH_WORDS) {
      paragraphs.push(p);
      continue;
    }
    for (let i = 0; i < words.length; i += MAX_PARAGRAPH_WORDS) {
      paragraphs.push(words.slice(i, i + MAX_PARAGRAPH_WORDS).join(" "));
    }
  }

  const sections = [];
  const totalParts = Math.max(1, Math.ceil(paragraphs.length / SECTION_PARAGRAPHS));
  for (let i = 0; i < paragraphs.length; i += SECTION_PARAGRAPHS) {
    const part = sections.length + 1;
    sections.push({
      id: `doc-${documentId}-part-${part}`,
      heading:
        totalParts === 1 ? title || "Document" : `${title} — Part ${part} of ${totalParts}`,
      paragraphs: paragraphs.slice(i, i + SECTION_PARAGRAPHS),
    });
  }
  if (sections.length === 0) {
    sections.push({ id: `doc-${documentId}`, heading: title || "Document", paragraphs: [] });
  }
  return sections;
}

const initialState = {
  messages: USE_MOCK ? mockReaderMessages : [],
  playing: false,
  wordIndex: 0,
  totalWords: 0,
  asking: false,
  // Fetched document text, keyed by docId so stale sections from the
  // previously opened document are never rendered under a new one.
  docId: null,
  docSections: null,
  docLoading: false,
  docError: null,
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
          answer: `⚠ ${action.error?.message || "The request did not complete."} Your question was not answered — retry when the backend is reachable.`,
          citations: ["error"],
          at: new Date().toISOString(),
        });
      })
      .addCase(fetchReaderDocument.pending, (state, action) => {
        state.docId = action.meta.arg.documentId;
        state.docSections = null;
        state.docLoading = true;
        state.docError = null;
      })
      // Both settle handlers bail unless the response belongs to the LAST
      // requested document — a slow /text response for doc A must not land
      // under doc B after the user switches (fetches aren't cancellable).
      .addCase(fetchReaderDocument.fulfilled, (state, action) => {
        if (action.meta.arg.documentId !== state.docId) return;
        state.docLoading = false;
        state.docSections = textToSections(action.payload);
      })
      .addCase(fetchReaderDocument.rejected, (state, action) => {
        if (action.meta.arg.documentId !== state.docId) return;
        state.docLoading = false;
        state.docError =
          action.error?.message || "Could not load the document text.";
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

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { mockReaderMessages } from "../../data/mockData";
import { blockMathOf, splitParagraphMathSafe } from "../../utils/math";
import {
  askReaderQuestion,
  createAnnotationApi,
  deleteAnnotationApi,
  fetchAnnotationsApi,
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

// Highlights + bookmarks live on the backend so they follow the document
// across devices.
export const loadAnnotations = createAsyncThunk(
  "reader/loadAnnotations",
  async ({ documentId }) => ({
    documentId,
    items: await fetchAnnotationsApi(documentId),
  })
);

export const addAnnotation = createAsyncThunk(
  "reader/addAnnotation",
  async ({ documentId, ...payload }) =>
    createAnnotationApi(documentId, payload)
);

export const removeAnnotation = createAsyncThunk(
  "reader/removeAnnotation",
  async ({ annotationId }) => {
    await deleteAnnotationApi(annotationId);
    return annotationId;
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

// A paragraph that looks like a TOP-LEVEL chapter heading (the cleaned PDF
// extraction emits headings as their own paragraphs). Deliberately strict:
// dotted subsection numbers ("1.1.2 …") are NOT chapter breaks — textbooks
// have hundreds of those and each would become a one-screen sliver.
function isHeadingParagraph(p) {
  if (p.length > 70 || /[.!?,;]$/.test(p)) return false;
  return (
    /^(chapter|part|appendix|preface|introduction|bibliography|epilogue|prologue)\b/i.test(p) ||
    /^\d{1,2}\.?\s+[A-Z]/.test(p) ||
    (/^[A-Z]/.test(p) && p === p.toUpperCase() && /[A-Z]{3}/.test(p))
  );
}

const MIN_CHAPTER_PARAGRAPHS = 5;

function textToSections({ documentId, title, text }) {
  const rough = (text || "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Group paragraphs under detected headings → real chapters in the reader
  // (and the Part navigator shows actual chapter names). Oversized chapters
  // and heading-less documents fall back to fixed-size parts.
  const chapters = [];
  let current = { heading: null, paragraphs: [] };
  for (const p of rough) {
    if (isHeadingParagraph(p) && current.paragraphs.length > 0) {
      chapters.push(current);
      current = { heading: p, paragraphs: [] };
      continue;
    }
    if (isHeadingParagraph(p) && !current.heading && current.paragraphs.length === 0) {
      current.heading = p;
      continue;
    }
    const words = p.split(" ");
    // equations are atomic (P1): whole-display paragraphs are never split,
    // and long prose paragraphs split WITHOUT cutting inside $…$ islands —
    // a severed pair mis-pairs with the next equation and swallows prose.
    if (words.length <= MAX_PARAGRAPH_WORDS || blockMathOf(p)) {
      current.paragraphs.push(p);
    } else {
      current.paragraphs.push(...splitParagraphMathSafe(p, MAX_PARAGRAPH_WORDS));
    }
  }
  if (current.paragraphs.length > 0 || current.heading) chapters.push(current);

  // Merge slivers (front-matter lines, TOC fragments, sparse headings) into
  // their predecessor so navigation stays meaningful.
  const merged = [];
  for (const ch of chapters) {
    const prev = merged[merged.length - 1];
    if (prev && ch.paragraphs.length < MIN_CHAPTER_PARAGRAPHS) {
      if (ch.heading) prev.paragraphs.push(ch.heading);
      prev.paragraphs.push(...ch.paragraphs);
    } else {
      merged.push({ ...ch });
    }
  }
  chapters.length = 0;
  chapters.push(...merged);

  // Too few detected headings → treat as unstructured. Too many relative to
  // the document's size means the "headings" are noise → also unstructured.
  const totalParas = chapters.reduce((n, c) => n + c.paragraphs.length, 0);
  const structured =
    chapters.length >= 3 && chapters.length <= Math.max(6, totalParas / 15);
  const sections = [];
  const pushSection = (heading, paragraphs) => {
    sections.push({
      id: `doc-${documentId}-s-${sections.length + 1}`,
      heading,
      paragraphs,
    });
  };

  if (structured) {
    for (const ch of chapters) {
      const head = ch.heading || title || "Document";
      if (ch.paragraphs.length <= SECTION_PARAGRAPHS) {
        pushSection(head, ch.paragraphs);
      } else {
        const pieces = Math.ceil(ch.paragraphs.length / SECTION_PARAGRAPHS);
        for (let i = 0; i < pieces; i++) {
          pushSection(
            i === 0 ? head : `${head} (cont. ${i + 1})`,
            ch.paragraphs.slice(i * SECTION_PARAGRAPHS, (i + 1) * SECTION_PARAGRAPHS)
          );
        }
      }
    }
  } else {
    const paragraphs = chapters.flatMap((c) =>
      c.heading ? [c.heading, ...c.paragraphs] : c.paragraphs
    );
    const totalParts = Math.max(1, Math.ceil(paragraphs.length / SECTION_PARAGRAPHS));
    for (let i = 0; i < paragraphs.length; i += SECTION_PARAGRAPHS) {
      const part = sections.length + 1;
      pushSection(
        totalParts === 1 ? title || "Document" : `${title} — Part ${part} of ${totalParts}`,
        paragraphs.slice(i, i + SECTION_PARAGRAPHS)
      );
    }
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
  // Highlights + bookmarks for the open document (backend-persisted).
  annotations: [],
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
        state.annotations = [];
      })
      .addCase(loadAnnotations.fulfilled, (state, action) => {
        if (action.payload.documentId !== state.docId) return;
        state.annotations = action.payload.items;
      })
      .addCase(addAnnotation.fulfilled, (state, action) => {
        if (action.payload) state.annotations.push(action.payload);
      })
      .addCase(removeAnnotation.fulfilled, (state, action) => {
        state.annotations = state.annotations.filter(
          (a) => a._id !== action.payload
        );
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

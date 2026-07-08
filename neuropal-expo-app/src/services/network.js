import axios from "axios";
import { Platform } from "react-native";

import { apiConfigured, apiHost, baseUrl, getHeaders } from "../store/ApiLink";

// Mock mode is OPT-IN ONLY via EXPO_PUBLIC_USE_MOCK=true — it exists so the
// UI can be developed with no backend on the LAN. It is never a silent
// fallback: with the flag off, a missing or unreachable backend is a visible
// error, not fabricated data.
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === "true";

export const apiClient = axios.create({
  baseURL: baseUrl || undefined,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Same JWT injection as ApiRequest.js — a no-op in LOCAL_MODE (the backend
// attaches the fixed local user), but keeps this client correct if
// LOCAL_MODE is ever turned off.
apiClient.interceptors.request.use(async (config) => {
  const headers = await getHeaders();
  config.headers = { ...config.headers, ...headers };
  return config;
});

function assertConfigured() {
  if (!apiConfigured) {
    throw new Error(
      "No backend configured. Set EXPO_PUBLIC_API_BASE_URL in neuropal-expo-app/.env " +
        "(e.g. http://192.168.3.169:4000) and restart `expo start`."
    );
  }
}

// Turns an axios failure into a message the owner can act on. Three cases:
// the server answered with an error, the server never answered, or the
// request never left the device.
export function describeNetworkError(error) {
  if (error?.response) {
    const serverMsg = error.response.data?.error;
    return serverMsg
      ? `Backend error ${error.response.status}: ${serverMsg}`
      : `Backend error ${error.response.status}`;
  }
  if (error?.code === "ECONNABORTED") {
    return `The backend at ${apiHost || "(unset)"} did not answer in time — it may still be working; try again.`;
  }
  if (error?.request) {
    return `Cannot reach the backend at ${apiHost || "(unset)"} — is the Mac Mini server running and this device on the same network?`;
  }
  return error?.message || "Unknown network error";
}

function buildMockAnswer(question, excerpt) {
  const snippet = excerpt ? excerpt.slice(0, 220) : "";

  if (/summaris|summary|plain language/i.test(question)) {
    return {
      answer: `[MOCK] In plain language: ${snippet || "this passage"} is describing a calmer reading environment that reduces cognitive load and helps the reader stay with the material.`,
      citations: ["mock"],
    };
  }

  return {
    answer: `[MOCK] EXPO_PUBLIC_USE_MOCK is on, so this answer is fabricated. The key idea in the selected passage is that synchronized reading, gentler formatting, and reduced sensory friction can make hard material easier to stay with. Source excerpt: "${snippet}"`,
    citations: ["mock"],
  };
}

// Backend citations are objects ({ chunkId, page, excerpt }); the reader UI
// renders short string chips. Deduped since several chunks often share a page.
function formatCitations(citations) {
  if (!Array.isArray(citations)) return [];
  const labels = citations.map((c, i) => {
    if (typeof c === "string") return c;
    if (c && typeof c === "object" && c.page != null) return `p. ${c.page}`;
    return `source ${i + 1}`;
  });
  return [...new Set(labels)];
}

export async function askReaderQuestion({
  documentId,
  paragraphId,
  question,
  excerpt,
  kind, // 'explain' routes to the passage-grounded endpoint
}) {
  if (USE_MOCK) {
    return buildMockAnswer(question, excerpt);
  }
  assertConfigured();

  const isExplain = kind === "explain" && excerpt;
  const url = isExplain
    ? `documents/${documentId}/explain`
    : `documents/${documentId}/query`;
  const body = isExplain
    ? { passage: excerpt, depth: "intuitive" }
    : { question };

  let data;
  try {
    ({ data } = await apiClient.post(
      url,
      body,
      // Retrieval + LLM reasoning is slow — the backend allows provider=
      // ollama up to 5 min, so the client ceiling must not undercut it.
      { timeout: 300000 }
    ));
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }

  if (!data || typeof data.answer !== "string") {
    throw new Error("Backend returned an unexpected response (no answer).");
  }

  return {
    answer: data.answer,
    citations: formatCitations(data.citations),
    provider: data.provider,
    mode: data.mode,
  };
}

// Phase 4 study material — POST /api/documents/:id/{summarize|quiz|cheatsheet}.
// Returns { answer (Markdown), citations, model, provider }.
export async function requestStudyMaterial(documentId, kind, opts = {}) {
  if (USE_MOCK) {
    return {
      answer: `[MOCK] ${kind} would be generated here from the real backend.`,
      citations: [],
    };
  }
  assertConfigured();

  let data;
  try {
    ({ data } = await apiClient.post(
      `documents/${documentId}/${kind}`,
      opts,
      // Whole-document features over a book + LLM can take a while.
      { timeout: 300000 }
    ));
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }

  if (!data || typeof data.answer !== "string") {
    throw new Error("Backend returned an unexpected response (no answer).");
  }

  return {
    answer: data.answer,
    citations: formatCitations(data.citations),
    model: data.model,
    provider: data.provider,
  };
}

// Upload a picked document (expo-document-picker asset) to
// POST /api/documents/upload. Returns the created Document.
//
// Native does NOT go through axios/XHR FormData — that path fails with an
// opaque "Network Error" on Android (the RN {uri,name,type} pseudo-file
// never leaves the device). expo-file-system's uploadAsync streams the
// file through the OS's native uploader instead. Web uses the real File
// from the picker in a real FormData, which browsers handle natively.
export async function uploadDocument(asset) {
  if (USE_MOCK) {
    throw new Error("Mock mode is on (EXPO_PUBLIC_USE_MOCK) — uploads are disabled.");
  }
  assertConfigured();

  const title = (asset.name || "").replace(/\.[^.]+$/, "");

  if (Platform.OS === "web") {
    const file = asset.file || (await (await fetch(asset.uri)).blob());
    const formData = new FormData();
    formData.append("file", file, asset.name || "upload");
    if (title) formData.append("title", title);

    let data;
    try {
      ({ data } = await apiClient.post("documents/upload", formData, {
        // Let the browser set the multipart boundary itself.
        headers: { "Content-Type": undefined },
        timeout: 300000,
      }));
    } catch (error) {
      throw new Error(describeNetworkError(error));
    }
    if (!data || !(data._id || data.id)) {
      throw new Error("Upload succeeded but the backend returned no document.");
    }
    return data;
  }

  // Native (Android / iOS)
  const FileSystem = require("expo-file-system/legacy");
  let result;
  try {
    result = await FileSystem.uploadAsync(
      `${baseUrl}documents/upload`,
      asset.uri,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType: asset.mimeType || "application/octet-stream",
        parameters: title ? { title } : {},
        headers: { Accept: "application/json", ...(await getHeaders()) },
      }
    );
  } catch (error) {
    throw new Error(
      `Upload failed before reaching the backend: ${error?.message || error}. ` +
        `Is the Mac Mini reachable at ${apiHost}?`
    );
  }

  if (result.status < 200 || result.status >= 300) {
    let serverMsg = "";
    try {
      serverMsg = JSON.parse(result.body)?.error || "";
    } catch (e) {
      // non-JSON body
    }
    throw new Error(
      serverMsg
        ? `Backend rejected the upload (${result.status}): ${serverMsg}`
        : `Backend rejected the upload (HTTP ${result.status}).`
    );
  }

  try {
    return JSON.parse(result.body);
  } catch (e) {
    throw new Error("Upload succeeded but the backend response was unreadable.");
  }
}

// POST /api/documents/:id/flashcards → { cards: [{front, back}], ... }
export async function requestFlashcards(documentId, count = 15) {
  if (USE_MOCK) {
    return {
      cards: [
        { front: "[MOCK] What is mock mode?", back: "Bundled fake data — no backend involved." },
      ],
    };
  }
  assertConfigured();
  try {
    const { data } = await apiClient.post(
      `documents/${documentId}/flashcards`,
      { count },
      { timeout: 300000 }
    );
    if (!Array.isArray(data?.cards) || data.cards.length === 0) {
      throw new Error("Backend returned no flashcards.");
    }
    return data;
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

// ---- Annotations (highlights + bookmarks) ---------------------------------

export async function fetchAnnotationsApi(documentId) {
  if (USE_MOCK) return [];
  assertConfigured();
  try {
    const { data } = await apiClient.get(`documents/${documentId}/annotations`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

export async function createAnnotationApi(documentId, payload) {
  assertConfigured();
  try {
    const { data } = await apiClient.post(
      `documents/${documentId}/annotations`,
      payload
    );
    return data;
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

export async function deleteAnnotationApi(annotationId) {
  assertConfigured();
  try {
    await apiClient.delete(`annotations/${annotationId}`);
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

// ---- Paper search (arXiv + Semantic Scholar) -------------------------------

// GET /api/search/papers → { query, results:[{source,id,title,authors,year,
// venue,abstract,pdfUrl,url,citationCount}], warnings:[] }
export async function searchPapersApi(q, source = "all") {
  assertConfigured();
  try {
    const { data } = await apiClient.get("search/papers", {
      params: { q, source },
      timeout: 30000,
    });
    return data;
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

// POST /api/search/papers/import — download the paper's PDF into the library
// and start ingest. Returns the created Document.
export async function importPaperApi(paper) {
  assertConfigured();
  try {
    const { data } = await apiClient.post(
      "search/papers/import",
      {
        title: paper.title,
        pdfUrl: paper.pdfUrl,
        source: paper.source,
        authors: paper.authors,
        year: paper.year,
        id: paper.id,
      },
      // download on the backend side can take a while for big PDFs
      { timeout: 180000 }
    );
    return data;
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

// POST /api/viz/spec — AI-generated visualization spec for the Visualizer.
// Returns { title, blurb, sliders, drawJs, model, provider }.
export async function generateVizApi(prompt) {
  assertConfigured();
  try {
    const { data } = await apiClient.post(
      "viz/spec",
      { prompt },
      // LLM generation of ~100 lines of canvas code takes a while
      { timeout: 300000 }
    );
    return data;
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

// ---- Raw markdown/txt editing ----------------------------------------------

export async function fetchRawDocumentApi(documentId) {
  assertConfigured();
  try {
    const { data } = await apiClient.get(`documents/${documentId}/raw`, {
      timeout: 30000,
    });
    return data; // { id, title, type, text }
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

export async function saveRawDocumentApi(documentId, text) {
  assertConfigured();
  try {
    const { data } = await apiClient.put(
      `documents/${documentId}/raw`,
      { text },
      { timeout: 60000 }
    );
    return data;
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

// ---- Reading position (Audible-style resume, D10 backend tandem) -----------

// GET /api/documents/:id/progress → { progress, lastWordIndex, lastPage, ... }
export async function fetchReadingProgressApi(documentId) {
  if (USE_MOCK) return null;
  assertConfigured();
  try {
    const { data } = await apiClient.get(`documents/${documentId}/progress`, {
      timeout: 15000,
    });
    return data;
  } catch (error) {
    // A missing resume point must never block opening the doc — start at 0.
    return null;
  }
}

// PATCH /api/documents/:id/progress — throttled heartbeat from the reader.
// Fire-and-forget: a dropped heartbeat just means a slightly stale resume.
export async function saveReadingProgressApi(documentId, payload) {
  if (USE_MOCK || !apiConfigured) return;
  try {
    await apiClient.patch(`documents/${documentId}/progress`, payload, {
      timeout: 15000,
    });
  } catch (error) {
    // swallow — position sync is best-effort
  }
}

// PATCH /api/documents/:id — rename from the library.
export async function renameDocument(documentId, title) {
  assertConfigured();
  try {
    const { data } = await apiClient.patch(`documents/${documentId}`, { title });
    return data;
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

// DELETE /api/documents/:id — soft-delete (backend keeps the file 30 days).
export async function deleteDocument(documentId) {
  assertConfigured();
  try {
    const { data } = await apiClient.delete(`documents/${documentId}`);
    return data;
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

// URL of a rendered PDF page image (reader "Original pages" view).
export function documentPageUrl(documentId, page) {
  return `${baseUrl}documents/${documentId}/page/${page}`;
}

// GET /api/documents/:id/text — the reader's TTS source.
// Returns { id, title, text, pageCount, wordCount, source }.
export async function fetchDocumentText(documentId) {
  assertConfigured();
  try {
    const { data } = await apiClient.get(`documents/${documentId}/text`, {
      timeout: 60000,
    });
    return data;
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }
}

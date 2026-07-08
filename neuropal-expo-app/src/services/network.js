import axios from "axios";

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

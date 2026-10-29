// Documents: /api/documents/* (docs/BRAIN.md §4). Owned by the Library +
// Reader + Ask work; add functions freely, keep these signatures.
import { fileUrl, request, seg } from "./client";
import type { ChatMessage, DocumentText, EpubManifest, NPDocument, QueryAnswer, ReadingProgress } from "./types";

export const listDocuments = (q?: string, signal?: AbortSignal) =>
  request<NPDocument[]>("/documents", { query: { q }, signal });

export const getDocument = (id: string, signal?: AbortSignal) => request<NPDocument>(`/documents/${seg(id)}`, { signal });

/** Multipart upload (field `file`, optional `title`); the server starts ingesting at once. */
export function uploadDocument(file: File, title?: string, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", file, file.name);
  if (title) form.append("title", title);
  return request<NPDocument>("/documents/upload", { method: "POST", body: { form }, signal, timeoutMs: 10 * 60 * 1000 });
}

export const renameDocument = (id: string, title: string, subtitle?: string) =>
  request<NPDocument>(`/documents/${seg(id)}`, { method: "PATCH", body: { json: { title, subtitle } } });

export const deleteDocument = (id: string) => request<unknown>(`/documents/${seg(id)}`, { method: "DELETE" });

export const getText = (id: string, signal?: AbortSignal) =>
  request<DocumentText>(`/documents/${seg(id)}/text`, { signal, timeoutMs: 60000 });

export const getProgress = (id: string, signal?: AbortSignal) =>
  request<ReadingProgress>(`/documents/${seg(id)}/progress`, { signal });

export const saveProgress = (
  id: string,
  p: { progress: number; lastWordIndex: number; lastPage?: number | null; timeSpentSec?: number },
) => request<unknown>(`/documents/${seg(id)}/progress`, { method: "PATCH", body: { json: p } });

/** Grounded answer with sources. AI calls can take a while. */
export const ask = (id: string, question: string, threadId?: string, signal?: AbortSignal) =>
  request<QueryAnswer>(`/documents/${seg(id)}/query`, {
    method: "POST",
    body: { json: { question, threadId } },
    signal,
    timeoutMs: 120000,
  });

export const chatHistory = (id: string, threadId?: string, signal?: AbortSignal) =>
  request<ChatMessage[]>(`/documents/${seg(id)}/chat`, { query: { threadId }, signal });

/** A 12 h read pass for one document, for loads that can't send a header (null on a local-mode server). */
export const getTicket = (id: string) => request<{ ticket: string | null; expiresAt?: string }>(`/documents/${seg(id)}/ticket`);

export const epubManifest = (id: string, signal?: AbortSignal) =>
  request<EpubManifest>(`/documents/${seg(id)}/epub-manifest`, { signal });

/** Rendered page image (JPEG) of a pdf/arxiv document. */
export const pageImageUrl = (id: string, page: number, ticket: string | null) =>
  fileUrl(`/documents/${seg(id)}/page/${page}`, ticket ? { t: ticket } : undefined);

/** Base for an EPUB's files; the ticket sits in the path so relative hrefs inherit it. */
export const epubBaseUrl = (id: string, ticket: string | null) =>
  fileUrl(ticket ? `/documents/${seg(id)}/epub/t/${seg(ticket)}/` : `/documents/${seg(id)}/epub/`);

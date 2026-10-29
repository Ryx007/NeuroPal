// Documents: /api/documents/* (docs/BRAIN.md §4). Owned by the Library +
// Reader + Ask work; add functions freely, keep these signatures.
import { sessionStore } from "@/lib/api";
import { ApiError, currentBase, currentSession, fileUrl, request, seg } from "./client";
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

// ---- additions (Library + Reader) -------------------------------------------

/** Run the ingest again (a failed one resumes where it stopped). */
export const reingestDocument = (id: string) =>
  request<{ ok: boolean; status: string }>(`/documents/${seg(id)}/reingest`, { method: "POST", body: { json: {} } });

const ticketCache = new Map<string, { ticket: string | null; until: number }>();

/** A document ticket, cached until an hour before it expires. */
export async function ticketFor(id: string, fresh = false): Promise<string | null> {
  const key = `${currentBase()}|${id}`;
  const hit = ticketCache.get(key);
  if (!fresh && hit && hit.until > Date.now()) return hit.ticket;
  const r = await getTicket(id);
  const ticket = r?.ticket ?? null;
  const expires = Date.parse(r?.expiresAt || "");
  ticketCache.set(key, {
    ticket,
    until: Number.isFinite(expires) ? expires - 60 * 60 * 1000 : Date.now() + 60 * 60 * 1000,
  });
  return ticket;
}

export function forgetTickets() {
  ticketCache.clear();
}

/** One EPUB entry path, each segment encoded ("OEBPS/Text/ch 1.xhtml"). */
export const epubPath = (href: string) =>
  href
    .split("/")
    .filter((s) => s && s !== "." && s !== "..")
    .map(seg)
    .join("/");

/** The directory URL a chapter's relative links resolve against (ticket in the path). */
export function epubChapterBase(id: string, href: string, ticket: string | null): string {
  const dir = href.includes("/") ? href.slice(0, href.lastIndexOf("/") + 1) : "";
  return `${epubBaseUrl(id, ticket)}${epubPath(dir)}${dir ? "/" : ""}`;
}

function applySessionRule(status: number, sentToken: string | null) {
  if (status === 401 && sentToken && currentSession()?.token === sentToken) sessionStore.clear();
}

function errorFrom(status: number, text: string, retryHeader: string | null): ApiError {
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const env = data as { error?: unknown; retryAfterSec?: unknown } | null;
  const message = typeof env?.error === "string" ? env.error : `The server answered ${status}.`;
  const retry = typeof env?.retryAfterSec === "number" ? env.retryAfterSec : Number(retryHeader) || null;
  return new ApiError(message, status, retry, data);
}

/** A chapter's XHTML as text (the ticket URL needs no header; otherwise the session's). */
export async function fetchEpubChapter(id: string, href: string, ticket: string | null, signal?: AbortSignal): Promise<string> {
  const base = currentBase();
  if (!base) throw new ApiError("Connect to your NeuroPal server first.", 0);
  const session = ticket ? null : currentSession();
  const url = `${epubBaseUrl(id, ticket)}${epubPath(href)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: session ? { Authorization: `Bearer ${session.token}` } : undefined,
      credentials: "omit",
      cache: "default",
      referrerPolicy: "no-referrer",
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ApiError("Can’t reach your NeuroPal server right now.", 0);
  }
  const text = await res.text();
  if (res.ok) return text;
  applySessionRule(res.status, session?.token ?? null);
  throw errorFrom(res.status, text, res.headers.get("Retry-After"));
}

/** Save the resume point while the page is going away (keepalive; best effort). */
export function saveProgressOnExit(id: string, p: { progress: number; lastWordIndex: number; lastPage?: number | null; timeSpentSec?: number }) {
  const base = currentBase();
  const session = currentSession();
  if (!base) return;
  try {
    void fetch(`${base}/api/documents/${seg(id)}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: JSON.stringify(p),
      keepalive: true,
      credentials: "omit",
    }).catch(() => {});
  } catch {
    /* the page is closing; the periodic saves already hold most of it */
  }
}

export interface UploadOptions {
  title?: string;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

/** Upload with progress (XMLHttpRequest): same session and error rules as `request`. */
export function uploadWithProgress(file: File, opts: UploadOptions = {}): Promise<NPDocument> {
  return new Promise((resolve, reject) => {
    const base = currentBase();
    if (!base) {
      reject(new ApiError("Connect to your NeuroPal server first.", 0));
      return;
    }
    const session = currentSession();
    const sentToken = session?.token ?? null;
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file, file.name);
    if (opts.title) form.append("title", opts.title);

    const onAbort = () => xhr.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const done = () => opts.signal?.removeEventListener("abort", onAbort);

    xhr.open("POST", `${base}/api/documents/upload`);
    xhr.timeout = 10 * 60 * 1000;
    xhr.withCredentials = false;
    xhr.setRequestHeader("Accept", "application/json");
    if (sentToken) xhr.setRequestHeader("Authorization", `Bearer ${sentToken}`);
    xhr.upload.onprogress = (e) => {
      if (opts.onProgress) opts.onProgress(e.loaded, e.lengthComputable ? e.total : file.size);
    };
    xhr.onload = () => {
      done();
      const text = xhr.responseText || "";
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(text) as NPDocument);
        } catch {
          reject(new ApiError("The server’s answer couldn’t be read.", xhr.status));
        }
        return;
      }
      applySessionRule(xhr.status, sentToken);
      reject(errorFrom(xhr.status, text, xhr.getResponseHeader("Retry-After")));
    };
    xhr.onerror = () => {
      done();
      reject(new ApiError("Can’t reach your NeuroPal server right now.", 0));
    };
    xhr.ontimeout = () => {
      done();
      reject(new ApiError("The server took too long to answer.", 0));
    };
    xhr.onabort = () => {
      done();
      reject(new DOMException("The upload was cancelled.", "AbortError"));
    };
    xhr.send(form);
  });
}

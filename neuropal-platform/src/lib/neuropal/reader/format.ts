// Plain-words formatting shared by the Library, Reader and Ask.
import { ApiError, errorText } from "../client";
import type { NPDocument } from "../types";

export const TYPE_LABELS: Record<string, string> = {
  pdf: "PDF",
  epub: "EPUB",
  docx: "Word",
  pptx: "Slides",
  md: "Markdown",
  txt: "Text",
  djvu: "DjVu",
  arxiv: "arXiv",
  web: "Web page",
};

export const typeLabel = (t: string | undefined) => TYPE_LABELS[String(t || "").toLowerCase()] ?? String(t || "File").toUpperCase();

/** Listening/reading time for a number of words at a speed. */
export function minutesLabel(words: number, wpm: number): string {
  const m = Math.max(0, words) / Math.max(60, wpm);
  if (m < 1) return "under a minute";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function shortMinutes(words: number, wpm: number): string {
  const m = Math.max(0, words) / Math.max(60, wpm);
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  return `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, (now - t) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: new Date(t).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}

/** What the server is doing with a document, in plain words. */
export function stageWords(status: string | undefined): string {
  switch (status) {
    case "pending":
      return "Waiting to start";
    case "parsing":
      return "Reading the file";
    case "chunking":
      return "Splitting into passages";
    case "embedding":
      return "Preparing it for questions";
    default:
      return "Processing";
  }
}

/** A failed ingest, said plainly; `detail` keeps the server's own words for a disclosure. */
export function failureWords(doc: Pick<NPDocument, "ingestError" | "type"> & { ingestStage?: string }): { summary: string; detail: string | null } {
  const raw = String(doc.ingestError || "").trim();
  const stage = (doc.ingestStage || /^failed at (\w+)/i.exec(raw)?.[1] || "").toLowerCase();
  // Already plain words (no stage prefix, codes, paths or numbers)?
  const plain = raw.length > 0 && raw.length < 140 && !stage && !/[:/\\{}<>]|\b[A-Z_]{4,}\b|\d{3,}/.test(raw);
  let summary: string;
  if (/no text found|no extractable text/i.test(raw)) {
    summary = "No readable text was found in this file. If it is a scan, a copy with a text layer will work better.";
  } else if (/password|encrypt/i.test(raw)) {
    summary = "This file is locked with a password, so it can’t be read.";
  } else if (/too large|too big|budget|entries/i.test(raw)) {
    summary = "This file is larger than the server can process.";
  } else if (stage === "parsing" || stage === "extracting") {
    summary = "NeuroPal couldn’t read the text in this file.";
  } else if (stage === "chunking") {
    summary = "The file was read, but splitting it into passages didn’t finish.";
  } else if (stage === "embedding") {
    summary = "The text was read, but preparing it for questions didn’t finish. Trying again usually picks up where it stopped.";
  } else if (plain) {
    summary = raw;
  } else {
    summary = "Processing didn’t finish.";
  }
  return { summary, detail: raw && !plain && raw !== summary ? raw : null };
}

/** Words for an error from an AI route (Ask). */
export function askErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.offline) return /too long/.test(e.message) ? "The answer took too long. Try again, or ask a shorter question." : "Can’t reach your NeuroPal server right now. Your question wasn’t answered.";
    if (e.status === 429) {
      return e.retryAfter ? `Too many questions at once — wait ${e.retryAfter} s and ask again.` : e.message || "Too many questions for now — try again later.";
    }
    if (e.status === 503) return e.message || "The AI service is busy right now. Try again in a little while.";
    if (e.status === 409) return "This document is still being processed. Ask again when it’s ready.";
    if (e.status >= 500) return "The server couldn’t answer this time. Try again in a moment.";
  }
  return errorText(e);
}

export const percent = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;

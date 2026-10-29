"use client";
// The upload queue, outside React: uploads keep going (and stay listed) when
// you leave the library and come back. Two at a time, each with progress.
import { useSyncExternalStore } from "react";
import { ApiError } from "@/lib/neuropal/client";
import { uploadWithProgress } from "@/lib/neuropal/documents";
import { docId, type NPDocument } from "@/lib/neuropal/types";

export type UploadStatus = "waiting" | "uploading" | "done" | "error" | "cancelled" | "rejected";

export interface UploadItem {
  key: string;
  name: string;
  size: number;
  status: UploadStatus;
  loaded: number;
  total: number;
  error?: string;
  docId?: string;
}

export const ACCEPTED = ["pdf", "epub", "docx", "pptx", "md", "markdown", "txt", "djvu", "djv"];
export const ACCEPT_ATTR = [
  ...ACCEPTED.map((e) => `.${e}`),
  "application/pdf",
  "application/epub+zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/markdown",
  "text/plain",
  "image/vnd.djvu",
].join(",");
export const ACCEPTED_WORDS = "PDF, EPUB, Word (.docx), PowerPoint (.pptx), Markdown, plain text and DjVu";
const MAX_BYTES = 300 * 1024 * 1024;
const PARALLEL = 2;

type Entry = UploadItem & { file: File | null };

let entries: Entry[] = [];
let snapshot: UploadItem[] = [];
let frame = 0;
let seq = 0;
const listeners = new Set<() => void>();
const doneListeners = new Set<(doc: NPDocument, item: UploadItem) => void>();
const failListeners = new Set<(item: UploadItem) => void>();
const controllers = new Map<string, AbortController>();
const EMPTY: UploadItem[] = [];

const view = (e: Entry): UploadItem => ({
  key: e.key,
  name: e.name,
  size: e.size,
  status: e.status,
  loaded: e.loaded,
  total: e.total,
  error: e.error,
  docId: e.docId,
});

function publish() {
  snapshot = entries.map(view);
  listeners.forEach((l) => l());
}

function publishSoon() {
  if (frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    publish();
  });
}

const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] || "").toLowerCase();

function uploadErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 413) return "This file is larger than the server accepts.";
    if (e.status === 401) return "Your session ended. Sign in again, then add the file again.";
    if (e.status === 400) return "The file didn’t arrive in one piece. Try again.";
    if (e.status === 429) return e.retryAfter ? `Too many uploads at once — wait ${e.retryAfter} s and try again.` : "Too many uploads at once — wait a moment.";
    if (e.status >= 500) return "The server couldn’t take the file this time. Try again in a moment.";
    return e.message;
  }
  return "The upload didn’t finish. Try again.";
}

function launch(entry: Entry) {
  const file = entry.file;
  if (!file) return;
  const ctrl = new AbortController();
  controllers.set(entry.key, ctrl);
  entry.status = "uploading";
  entry.loaded = 0;
  entry.total = file.size;
  entry.error = undefined;
  uploadWithProgress(file, {
    signal: ctrl.signal,
    onProgress: (loaded, total) => {
      entry.loaded = loaded;
      entry.total = total || file.size;
      publishSoon();
    },
  })
    .then((doc) => {
      entry.status = "done";
      entry.loaded = entry.total;
      entry.docId = docId(doc);
      entry.file = null;
      const item = view(entry);
      doneListeners.forEach((l) => l(doc, item));
    })
    .catch((e) => {
      if (ctrl.signal.aborted) {
        entry.status = "cancelled";
      } else {
        entry.status = "error";
        entry.error = uploadErrorText(e);
        failListeners.forEach((l) => l(view(entry)));
      }
    })
    .finally(() => {
      controllers.delete(entry.key);
      publish();
      pump();
    });
}

function pump() {
  let running = entries.filter((e) => e.status === "uploading").length;
  for (const e of entries) {
    if (running >= PARALLEL) break;
    if (e.status !== "waiting") continue;
    running += 1;
    launch(e);
  }
  publish();
}

/** Queue files; returns how many were accepted. Unreadable kinds are listed with the reason. */
export function addFiles(files: Iterable<File>): { accepted: number; rejected: number } {
  let accepted = 0;
  let rejected = 0;
  for (const file of files) {
    const key = `u${++seq}`;
    const ext = extOf(file.name);
    let error: string | undefined;
    if (!ACCEPTED.includes(ext)) error = `NeuroPal can’t read ${ext ? `.${ext}` : "this kind of"} files yet. It reads ${ACCEPTED_WORDS}.`;
    else if (file.size === 0) error = "This file is empty.";
    else if (file.size > MAX_BYTES) error = "This file is larger than 300 MB, the most the server takes.";
    entries.push({
      key,
      name: file.name || "Untitled file",
      size: file.size,
      status: error ? "rejected" : "waiting",
      loaded: 0,
      total: file.size,
      error,
      file: error ? null : file,
    });
    if (error) rejected += 1;
    else accepted += 1;
  }
  pump();
  return { accepted, rejected };
}

export function cancelUpload(key: string) {
  const e = entries.find((x) => x.key === key);
  if (!e) return;
  if (e.status === "uploading") controllers.get(key)?.abort();
  else if (e.status === "waiting") {
    e.status = "cancelled";
    publish();
  }
}

export function retryUpload(key: string) {
  const e = entries.find((x) => x.key === key);
  if (!e || !e.file || (e.status !== "error" && e.status !== "cancelled")) return;
  e.status = "waiting";
  e.error = undefined;
  pump();
}

export function dismissUpload(key: string) {
  entries = entries.filter((x) => x.key !== key || x.status === "uploading" || x.status === "waiting");
  publish();
}

export function clearFinished() {
  entries = entries.filter((x) => x.status === "uploading" || x.status === "waiting");
  publish();
}

export function onUploadDone(fn: (doc: NPDocument, item: UploadItem) => void) {
  doneListeners.add(fn);
  return () => {
    doneListeners.delete(fn);
  };
}

export function onUploadFailed(fn: (item: UploadItem) => void) {
  failListeners.add(fn);
  return () => {
    failListeners.delete(fn);
  };
}

const store = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => snapshot,
  getServer: () => EMPTY,
};

export function useUploads(): UploadItem[] {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

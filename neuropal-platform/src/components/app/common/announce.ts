"use client";
// One app-wide voice for screen readers: `announce("Saved.")` speaks through
// the live regions the shell renders (<Announcer />). For results that
// appear already filled in, where a live region in place would stay silent.
import { useSyncExternalStore } from "react";

export interface Announcement {
  id: number;
  text: string;
  assertive: boolean;
}

const EMPTY: Announcement = { id: 0, text: "", assertive: false };
let current: Announcement = EMPTY;
let timer: number | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Say `text` to screen readers. The same words twice are read twice. */
export function announce(text: string, opts: { assertive?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const id = current.id + 1;
  current = { id, text: "", assertive: Boolean(opts.assertive) };
  emit();
  window.clearTimeout(timer);
  // Empty first, then the words: a changed live region is what gets read.
  timer = window.setTimeout(() => {
    current = { id, text, assertive: Boolean(opts.assertive) };
    emit();
  }, 80);
}

const store = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => current,
  getServer: () => EMPTY,
};

export function useAnnouncement(): Announcement {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

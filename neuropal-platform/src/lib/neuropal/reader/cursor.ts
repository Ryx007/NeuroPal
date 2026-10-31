"use client";
// The reading cursor (the word being read) as a tiny external store, so a
// moving highlight re-renders only the paragraph it is in — not the whole
// document — even in a book of a few hundred thousand words.
import { useSyncExternalStore } from "react";

export interface Cursor {
  get(): number;
  set(index: number): void;
  subscribe(listener: () => void): () => void;
}

export function createCursor(initial = 0): Cursor {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(index) {
      if (index === value) return;
      value = index;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Subscribe to a derived primitive of the cursor (re-renders only when it changes). */
export function useCursorValue<T extends string | number | boolean | null>(cursor: Cursor, select: (index: number) => T): T {
  return useSyncExternalStore(
    cursor.subscribe,
    () => select(cursor.get()),
    () => select(cursor.get()),
  );
}

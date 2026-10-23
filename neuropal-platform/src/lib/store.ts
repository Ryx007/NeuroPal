// Small external stores backed by Web Storage, read with useSyncExternalStore.
//
// - The server (static export) and the first client render use `fallback`,
//   so hydration always matches the exported HTML; React then re-renders
//   with the stored value.
// - Every storage access is wrapped: private windows, blocked site data or a
//   full quota fall back to an in-memory value for this page.
// - Other tabs' writes (the `storage` event) update this tab too.
import { useSyncExternalStore } from "react";

type Listener = () => void;
type Area = "local" | "session";

export interface StoredValue<T> {
  subscribe(listener: Listener): () => void;
  get(): T;
  getServer(): T;
  set(value: T): void;
  clear(): void;
}

function storageArea(area: Area): Storage | null {
  try {
    return area === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readRaw(area: Area, key: string): string | null {
  try {
    return storageArea(area)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeRaw(area: Area, key: string, raw: string | null): boolean {
  try {
    const s = storageArea(area);
    if (!s) return false;
    if (raw === null) s.removeItem(key);
    else s.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

export function createStoredValue<T>(options: {
  key: string;
  area: Area;
  fallback: T;
  parse: (raw: string) => T;
  serialize?: (value: T) => string;
}): StoredValue<T> {
  const { key, area, fallback, parse } = options;
  const serialize = options.serialize ?? ((v: T) => JSON.stringify(v));
  const listeners = new Set<Listener>();
  let loaded = false;
  let raw: string | null = null;
  let cache: { raw: string | null; value: T } | null = null;

  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    raw = readRaw(area, key);
  };
  const emit = () => listeners.forEach((l) => l());
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== key) return;
    raw = e.key === null ? null : e.newValue;
    emit();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && area === "local") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && area === "local") window.removeEventListener("storage", onStorage);
      };
    },
    get() {
      load();
      if (!cache || cache.raw !== raw) {
        let value = fallback;
        if (raw !== null) {
          try {
            value = parse(raw);
          } catch {
            value = fallback;
          }
        }
        cache = { raw, value };
      }
      return cache.value;
    },
    getServer() {
      return fallback;
    },
    set(value) {
      load();
      raw = serialize(value);
      writeRaw(area, key, raw);
      emit();
    },
    clear() {
      load();
      raw = null;
      writeRaw(area, key, null);
      emit();
    },
  };
}

export function useStored<T>(store: StoredValue<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

// ---- small shared hooks ---------------------------------------------------

const noop = () => () => {};

// false while rendering on the server / hydrating, true afterwards.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

function mediaStore(query: string) {
  return {
    subscribe(listener: Listener) {
      let mq: MediaQueryList | null = null;
      try {
        mq = window.matchMedia(query);
      } catch {
        return () => {};
      }
      mq.addEventListener("change", listener);
      return () => mq?.removeEventListener("change", listener);
    },
    get() {
      try {
        return window.matchMedia(query).matches;
      } catch {
        return false;
      }
    },
    getServer() {
      return false;
    },
  };
}

const reducedMotionStore = mediaStore("(prefers-reduced-motion: reduce)");

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(reducedMotionStore.subscribe, reducedMotionStore.get, reducedMotionStore.getServer);
}

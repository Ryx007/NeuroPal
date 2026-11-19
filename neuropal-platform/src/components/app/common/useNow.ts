"use client";
// The current time for rendering, as a shared ticking store (renders stay
// pure: no Date.now() in components). One clock per interval length.
import { useCallback, useSyncExternalStore } from "react";

interface Clock {
  now: number;
  listeners: Set<() => void>;
  timer: number | undefined;
}

const clocks = new Map<number, Clock>();

function clockFor(ms: number): Clock {
  let c = clocks.get(ms);
  if (!c) {
    c = { now: Date.now(), listeners: new Set(), timer: undefined };
    clocks.set(ms, c);
  }
  return c;
}

function subscribeClock(ms: number, listener: () => void) {
  const c = clockFor(ms);
  c.listeners.add(listener);
  if (c.listeners.size === 1) {
    const fresh = Date.now();
    if (fresh - c.now >= 1000) {
      c.now = fresh;
      queueMicrotask(() => c.listeners.forEach((l) => l()));
    }
    c.timer = window.setInterval(() => {
      c.now = Date.now();
      c.listeners.forEach((l) => l());
    }, ms);
  }
  return () => {
    c.listeners.delete(listener);
    if (c.listeners.size === 0) {
      window.clearInterval(c.timer);
      c.timer = undefined;
    }
  };
}

const serverNow = () => 0;

/** Milliseconds since the epoch, refreshed every `intervalMs` (0 before hydration). */
export function useNow(intervalMs = 30_000): number {
  const subscribe = useCallback((l: () => void) => subscribeClock(intervalMs, l), [intervalMs]);
  const get = useCallback(() => clockFor(intervalMs).now, [intervalMs]);
  return useSyncExternalStore(subscribe, get, serverNow);
}

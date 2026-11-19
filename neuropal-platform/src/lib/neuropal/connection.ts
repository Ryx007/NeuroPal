"use client";
// Is the browser online, and does the NeuroPal server answer? `request`
// reports every answer (any status) and every failed connection here; the
// shell shows a quiet notice from it. Timeouts are not counted: a slow AI
// reply is not an unreachable server.
import { useSyncExternalStore } from "react";
import { apiBaseStore, checkHealth } from "@/lib/api";

export type ServerState = "unknown" | "ok" | "unreachable";

export interface ConnectionState {
  /** navigator.onLine (true until the browser says otherwise). */
  online: boolean;
  server: ServerState;
  /** A health check is running (the notice's "Try again"). */
  checking: boolean;
}

const INITIAL: ConnectionState = { online: true, server: "unknown", checking: false };
let state: ConnectionState = INITIAL;
const listeners = new Set<() => void>();

function setState(patch: Partial<ConnectionState>) {
  const next = { ...state, ...patch };
  if (next.online === state.online && next.server === state.server && next.checking === state.checking) return;
  state = next;
  listeners.forEach((l) => l());
}

export function reportReachable() {
  setState({ server: "ok" });
}

export function reportUnreachable() {
  setState({ server: "unreachable" });
}

/** Ask the server's /healthz; resolves true when it answered. */
export async function checkServer(): Promise<boolean> {
  const base = apiBaseStore.get();
  if (!base || state.checking) return state.server === "ok";
  setState({ checking: true });
  const r = await checkHealth(base);
  setState({ checking: false, server: r.ok ? "ok" : "unreachable" });
  return r.ok;
}

function onOnline() {
  setState({ online: true });
  void checkServer();
}

function onOffline() {
  setState({ online: false });
}

export const connectionStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) {
      const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
      if (online !== state.online) state = { ...state, online };
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      }
    };
  },
  get: () => state,
  getServer: () => INITIAL,
};

export function useConnection(): ConnectionState {
  return useSyncExternalStore(connectionStore.subscribe, connectionStore.get, connectionStore.getServer);
}

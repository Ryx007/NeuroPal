"use client";
// Who is signed in, to which server — for React components.
import { useCallback } from "react";
import { apiBaseStore, sessionKept, sessionStore, type PublicUser } from "@/lib/api";
import { useHydrated, useStored } from "@/lib/store";
import { clearLocalChat } from "./palState";

export interface AppSessionState {
  /** false until the browser has read storage (render a quiet placeholder meanwhile). */
  ready: boolean;
  base: string;
  signedIn: boolean;
  user: PublicUser | null;
  /** The session is kept on this device ("Keep me signed in"), not just this tab. */
  kept: boolean;
  /** A single-user (LOCAL_MODE) server: nothing to sign out of there. */
  local: boolean;
  signOut: () => void;
}

/** Sign out on this device: the token and this browser's copy of the Pal chat go. */
export function signOutHere() {
  sessionStore.clear();
  clearLocalChat();
}

export function useAppSession(): AppSessionState {
  const ready = useHydrated();
  const base = useStored(apiBaseStore);
  const session = useStored(sessionStore);
  const signOut = useCallback(() => signOutHere(), []);
  const valid = !!session && session.base === base;
  return {
    ready,
    base,
    signedIn: valid,
    user: valid ? session.user : null,
    kept: valid && sessionKept(),
    local: valid && Boolean(session.local),
    signOut,
  };
}

/** The name Home greets with: the account's name, else nothing. */
export function displayName(user: PublicUser | null): string {
  const n = (user?.name || user?.displayName || "").trim();
  return n.split(/\s+/)[0] || "";
}

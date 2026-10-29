"use client";
// Who is signed in, to which server — for React components.
import { useCallback } from "react";
import { apiBaseStore, sessionStore, type PublicUser } from "@/lib/api";
import { useHydrated, useStored } from "@/lib/store";

export interface AppSessionState {
  /** false until the browser has read storage (render a quiet placeholder meanwhile). */
  ready: boolean;
  base: string;
  signedIn: boolean;
  user: PublicUser | null;
  signOut: () => void;
}

export function useAppSession(): AppSessionState {
  const ready = useHydrated();
  const base = useStored(apiBaseStore);
  const session = useStored(sessionStore);
  const signOut = useCallback(() => sessionStore.clear(), []);
  const valid = !!session && session.base === base;
  return { ready, base, signedIn: valid, user: valid ? session.user : null, signOut };
}

"use client";
// Who is signed in, to which server — for React components.
import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { apiBaseStore, sessionKept, sessionStore, type PublicUser } from "@/lib/api";
import { useHydrated, useStored } from "@/lib/store";
import { claimLocalData, claimStore, endSession, noticeStore, type SessionNotice } from "./localData";
import { accountKey, ownerStore } from "./owner";

export interface AppSessionState {
  /** false until the browser has read storage (render a quiet placeholder meanwhile). */
  ready: boolean;
  base: string;
  signedIn: boolean;
  user: PublicUser | null;
  /** owner.ts `accountKey` of the signed-in account (null when signed out). */
  account: string | null;
  /** The session is kept on this device ("Keep me signed in"), not just this tab. */
  kept: boolean;
  /** A single-user (LOCAL_MODE) server: nothing to sign out of there. */
  local: boolean;
  signOut: () => void;
}

/** Sign out on this device: this browser's personal things go, then the session (localData.ts). */
export function signOutHere() {
  endSession("signed-out");
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
    account: valid ? accountKey(session) : null,
    kept: valid && sessionKept(),
    local: valid && Boolean(session.local),
    signOut,
  };
}

/**
 * May this tab show the signed-in account's personal things?
 *   "ok"        yes (or nobody is signed in)
 *   "pending"   not yet: they are being made this account's (before paint)
 *   "elsewhere" another account signed in on this browser in another tab and
 *               holds them now; `claimLocalData(account)` takes them back
 */
export function useLocalData(account: string | null): "ok" | "pending" | "elsewhere" {
  const owner = useStored(ownerStore);
  const mine = useSyncExternalStore(claimStore.subscribe, claimStore.get, claimStore.getServer);
  // A session starting in this tab claims them before the screen paints.
  useLayoutEffect(() => {
    if (account && claimStore.get() !== account) claimLocalData(account);
  }, [account]);
  if (!account || owner === account) return "ok";
  return mine === account ? "elsewhere" : "pending";
}

/** How the last session ended here (for the sign-in screen), until the next one starts. */
export function useSessionNotice(): SessionNotice | null {
  return useSyncExternalStore(noticeStore.subscribe, noticeStore.get, noticeStore.getServer);
}

/** The name Home greets with: the account's name, else nothing. */
export function displayName(user: PublicUser | null): string {
  const n = (user?.name || user?.displayName || "").trim();
  return n.split(/\s+/)[0] || "";
}

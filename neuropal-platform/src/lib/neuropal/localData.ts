// What this browser keeps for the signed-in account, and the one way a
// session ends.
//
// Personal — goes when the session ends, and before another account's
// session can show anything:
//   Pal's chat · today (check-ins, anchors, the minimum day, the brain dump) ·
//   "Sit with me" and its notes · the upload queue · document tickets ·
//   Pal's settings, the Home layout and Undo in the look (the skin and its
//   colours stay as this device's look, unclaimed, so the next account's
//   own look wins over them).
// Kept — this device's preferences: reading voice, speed, fonts and
// shortcuts (prefs.ts), the server address.
//
// Modules with their own in-memory part (uploads, tickets, the look sync)
// add it with `onForget`; the stored parts are cleared here directly.
import { sessionStore } from "@/lib/api";
import { releaseLook } from "@/lib/appearanceStore";
import { dayStore } from "./day";
import { accountKey, currentSession, ownerStore } from "./owner";
import { clearLocalChat, sitStore } from "./palState";

type Forget = () => number | void;
const forgetters = new Set<Forget>();

/** Run `fn` whenever this browser forgets an account's things. It may return how many unfinished uploads it stopped. */
export function onForget(fn: Forget): () => void {
  forgetters.add(fn);
  return () => {
    forgetters.delete(fn);
  };
}

// ---- which account this tab claimed the personal things for (this tab only) ----

let claimed: string | null = null;
const claimListeners = new Set<() => void>();

function setClaimed(v: string | null) {
  if (claimed === v) return;
  claimed = v;
  claimListeners.forEach((l) => l());
}

export const claimStore = {
  subscribe(l: () => void) {
    claimListeners.add(l);
    return () => {
      claimListeners.delete(l);
    };
  },
  get: () => claimed,
  getServer: (): string | null => null,
};

function forgetTab(): number {
  setClaimed(null);
  let stopped = 0;
  for (const fn of [...forgetters]) {
    try {
      stopped += Number(fn()) || 0;
    } catch {
      /* the rest must still go */
    }
  }
  return stopped;
}

/** Forget everything personal this browser holds. Returns how many unfinished uploads were stopped. */
export function forgetLocalData(): number {
  // Closed first: from here on nothing can write personal things.
  ownerStore.clear();
  const stopped = forgetTab();
  clearLocalChat();
  sitStore.clear();
  dayStore.clear();
  releaseLook();
  return stopped;
}

/**
 * A session started in this tab (a sign-in, or a load with one): this
 * browser's personal things become `account`'s. Another account's go first,
 * before anything of them can show. Things from before this rule existed
 * (no owner yet) are kept for whoever signs in.
 */
export function claimLocalData(account: string) {
  const owner = ownerStore.get();
  if (owner !== account) {
    if (owner !== null) forgetLocalData();
    ownerStore.set(account);
  }
  setClaimed(account);
  clearSessionNotice();
}

// ---- how the session ended, for the sign-in screen ---------------------------------

export type SessionEnd = "signed-out" | "ended";

export interface SessionNotice {
  id: number;
  reason: SessionEnd;
  /** This browser's personal things were cleared. */
  cleared: boolean;
  /** Unfinished uploads that were stopped. */
  stopped: number;
}

let notice: SessionNotice | null = null;
let noticeId = 0;
const noticeListeners = new Set<() => void>();

function setNotice(next: SessionNotice | null) {
  notice = next;
  noticeListeners.forEach((l) => l());
}

export const noticeStore = {
  subscribe(l: () => void) {
    noticeListeners.add(l);
    return () => {
      noticeListeners.delete(l);
    };
  },
  get: () => notice,
  getServer: (): SessionNotice | null => null,
};

export function clearSessionNotice() {
  if (notice) setNotice(null);
}

/** Uploads stopped when the session changed without passing through `endSession`. */
export function noteStoppedUploads(n: number) {
  if (n <= 0 || currentSession()) return;
  setNotice({ id: ++noticeId, reason: notice?.reason ?? "ended", cleared: notice?.cleared ?? false, stopped: (notice?.stopped ?? 0) + n });
}

/**
 * The one way a session ends on this device: Sign out, Sign out everywhere,
 * Disconnect, and a 401 for the token that is still current. This browser's
 * personal things go first (unless another account holds them now, from
 * another tab), then the session; the app shows its sign-in screen.
 */
export function endSession(reason: SessionEnd) {
  const s = currentSession();
  const owner = ownerStore.get();
  const ours = !s || owner === null || owner === accountKey(s);
  const stopped = ours ? forgetLocalData() : forgetTab();
  sessionStore.clear();
  setNotice({ id: ++noticeId, reason, cleared: ours, stopped });
}

// Whose personal things this browser holds. Today (check-ins, anchors, the
// minimum day, the brain dump), Pal's chat and "Sit with me" are kept here
// for ONE account at a time — the owner — and are written only while the
// owner is signed in. Another account's session clears them first
// (localData.ts), so nothing of one account ever shows to another.
// No imports of the stores themselves: they import this.
import { apiBaseStore, sessionStore, type Session } from "@/lib/api";
import { createStoredValue } from "@/lib/store";

/** The signed-in session for the CURRENT server, or null. */
export function currentSession(): Session | null {
  const s = sessionStore.get();
  const base = apiBaseStore.get();
  return s && s.base === base ? s : null;
}

// cyrb53: a short one-way name, so storage never keeps the account's email
// or id in the clear.
function hash(text: string): string {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** One account on one server. A refreshed token is still the same account. */
export function accountKey(s: Session): string {
  const who = s.local ? "local" : String(s.user?.id || s.user?.email?.trim().toLowerCase() || "");
  return hash(`${s.base}|${who}`);
}

export function currentAccount(): string | null {
  const s = currentSession();
  return s ? accountKey(s) : null;
}

/** The account this browser's personal things belong to (null: nobody's yet). */
export const ownerStore = createStoredValue<string | null>({
  key: "np.app.owner.v1",
  area: "local",
  fallback: null,
  parse: (raw) => raw || null,
  serialize: (v) => v ?? "",
});

/**
 * Personal things may be written now: their owner is signed in. With
 * `account`, also only for that account — an answer that arrives after a
 * sign-out (or another account's sign-in) is dropped, not saved.
 */
export function personalOpen(account?: string | null): boolean {
  const now = currentAccount();
  return now !== null && ownerStore.get() === now && (account === undefined || account === now);
}

// Account: /api/auth/* (docs/BRAIN.md §4). The site's sign-in page uses
// `login` in lib/api.ts; the app signs in here, through `request`, so rate
// limits arrive with their seconds (ApiError.retryAfter).
import { ApiError, currentSession, request } from "./client";
import type { AuthConfig } from "./types";
import { updateSession, type PublicUser } from "@/lib/api";

export const authConfig = (signal?: AbortSignal) =>
  request<AuthConfig>("/auth/config", { auth: false, signal, timeoutMs: 8000 });

export const register = (email: string, password: string, name?: string, inviteCode?: string) =>
  request<{ token: string; user: PublicUser }>("/auth/register", {
    method: "POST",
    body: { json: { email, password, name, inviteCode } },
    auth: false,
  });

export const signIn = (email: string, password: string) =>
  request<{ token?: string; user?: PublicUser }>("/auth/login", {
    method: "POST",
    body: { json: { email, password } },
    auth: false,
  });

export interface MeReply extends PublicUser {
  /** Present when the server swapped a day-old token for a fresh one. */
  token?: string;
}

export const fetchMe = (signal?: AbortSignal) => request<MeReply>("/auth/me", { signal });

const publicUser = (u: PublicUser): PublicUser => ({ id: u.id, email: u.email, name: u.name, displayName: u.displayName });

/**
 * Ask the server who this session is. Keeps the user details fresh and takes
 * a refreshed token when the server offers one; a 401 ends the session
 * through the usual rule in `request`.
 */
export async function refreshSession(signal?: AbortSignal): Promise<void> {
  const sent = currentSession();
  if (!sent) return;
  const me = await fetchMe(signal);
  const now = currentSession();
  if (!now || now.token !== sent.token) return; // signed out or replaced meanwhile
  updateSession(me.token && !now.local ? { token: me.token, user: publicUser(me) } : { user: publicUser(me) });
}

/** Ends every session of the account (this one included). */
export const logoutEverywhere = () => request<{ ok: boolean }>("/auth/logout-all", { method: "POST" });

/**
 * Change the password. The server answers with a new token (every other
 * session ends), which replaces this one. A wrong current password is a 401
 * too, so that 401 doesn't sign anyone out: the session is checked on its own.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<{ token: string }> {
  try {
    const r = await request<{ token: string }>("/auth/password", {
      method: "POST",
      body: { json: { currentPassword, newPassword } },
      keepSessionOn401: true,
    });
    if (r?.token) updateSession({ token: r.token });
    return r;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await fetchMe().catch(() => undefined);
    throw e;
  }
}

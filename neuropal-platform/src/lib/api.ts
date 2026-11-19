// Talking to the visitor's own NeuroPal server (contract: docs/BRAIN.md §4 and
// docs/PLATFORM-PLAN.md §3.3). Every call is best effort and reports its
// failure in plain words. Credentials are never logged or stored; only the
// session token is kept: in sessionStorage for this tab (the default), or in
// localStorage when the person ticks "Keep me signed in on this device".
import { API_BASE_KEY, SESSION_KEY } from "./keys";
import { createStoredValue, type StoredValue } from "./store";

export interface PublicUser {
  id?: string;
  email?: string;
  name?: string;
  displayName?: string;
}

export interface Session {
  token: string;
  base: string;
  user: PublicUser | null;
  /** A single-user (LOCAL_MODE) server: no account, the token is a placeholder. */
  local?: boolean;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export type BaseParse = { ok: true; base: string } | { ok: false; error: string };

export function parseBase(input: string): BaseParse {
  const s = input.trim();
  if (!s) return { ok: false, error: "Enter your server’s address first, for example http://192.168.1.20:4000." };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `http://${s}`);
  } catch {
    return { ok: false, error: "That doesn’t look like a web address. Try something like http://192.168.1.20:4000." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "The address has to start with http:// or https://." };
  }
  return { ok: true, base: `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}` };
}

const envBase = (() => {
  const r = parseBase(process.env.NEXT_PUBLIC_API_BASE_URL || "");
  return r.ok ? r.base : "";
})();

/** Build-time default from NEXT_PUBLIC_API_BASE_URL (empty when unset). */
export const ENV_API_BASE = envBase;

export const apiBaseStore = createStoredValue<string>({
  key: API_BASE_KEY,
  area: "local",
  fallback: envBase,
  parse: (raw) => raw,
  serialize: (v) => v,
});

// ---- the session ------------------------------------------------------------
// Two places, never both at once:
//   tab  (sessionStorage, SESSION_KEY)       this tab only, gone when it closes
//   kept (localStorage, KEPT_SESSION_KEY)    "Keep me signed in on this device"
// `sessionStore` reads the tab copy first, then the kept one. Its `set` is the
// site's sign-in page (this tab only, exactly as before); the app signs in
// with `saveSession`, and refreshed tokens go through `updateSession`, which
// writes back to wherever the session already lives.
const KEPT_SESSION_KEY = "np.session.kept";

function parseSession(raw: string): Session | null {
  const o = JSON.parse(raw) as Partial<Session> | null;
  if (!o || typeof o.token !== "string" || !o.token) return null;
  const s: Session = { token: o.token, base: String(o.base || ""), user: (o.user as PublicUser) ?? null };
  if (o.local === true) s.local = true;
  return s;
}

const tabSession = createStoredValue<Session | null>({ key: SESSION_KEY, area: "session", fallback: null, parse: parseSession });
const keptSession = createStoredValue<Session | null>({ key: KEPT_SESSION_KEY, area: "local", fallback: null, parse: parseSession });

export const sessionStore: StoredValue<Session | null> = {
  subscribe(listener) {
    const offTab = tabSession.subscribe(listener);
    const offKept = keptSession.subscribe(listener);
    return () => {
      offTab();
      offKept();
    };
  },
  get: () => tabSession.get() ?? keptSession.get(),
  getServer: () => null,
  set(value) {
    if (!value) {
      tabSession.clear();
      keptSession.clear();
      return;
    }
    // New copy first, then the old one goes: no moment without a session.
    tabSession.set(value);
    keptSession.clear();
  },
  clear() {
    tabSession.clear();
    keptSession.clear();
  },
};

/** Sign-in from the app: `keep` = stay signed in on this device (localStorage). */
export function saveSession(value: Session, opts: { keep: boolean }) {
  if (opts.keep) {
    keptSession.set(value);
    tabSession.clear();
  } else {
    tabSession.set(value);
    keptSession.clear();
  }
}

/** Change the current session in place (a refreshed token, fresher user details). */
export function updateSession(patch: Partial<Session>) {
  const tab = tabSession.get();
  if (tab) {
    tabSession.set({ ...tab, ...patch });
    return;
  }
  const kept = keptSession.get();
  if (kept) keptSession.set({ ...kept, ...patch });
}

/** true when the current session is kept on this device (localStorage). */
export function sessionKept(): boolean {
  return !tabSession.get() && Boolean(keptSession.get());
}

export function hostOf(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}

/** Browsers block http:// requests from an https:// page. */
export function mixedContentProblem(base: string): string | null {
  if (typeof window === "undefined") return null;
  if (window.location.protocol === "https:" && base.startsWith("http:")) {
    return "This page was loaded over HTTPS, so your browser blocks requests to an http:// server. Open this site from your own server instead, or give the server an HTTPS address.";
  }
  return null;
}

export async function apiRequest<T>(
  base: string,
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null; timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const { method = "GET", body, token, timeoutMs = 8000 } = opts;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const envelope = data as { error?: unknown } | null;
      const message =
        envelope && typeof envelope.error === "string"
          ? envelope.error
          : `The server answered ${res.status}${res.statusText ? ` ${res.statusText}` : ""}.`;
      return { ok: false, status: res.status, data: data as T, error: message };
    }
    return { ok: true, status: res.status, data: data as T, error: null };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: null,
      error: aborted
        ? `No answer within ${Math.round(timeoutMs / 1000)} seconds. Is the server running, and can this device reach it?`
        : "Couldn’t reach the server. Check the address, that the server is running, and that this device can reach it (for example over your home Wi-Fi or Tailscale).",
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export const checkHealth = (base: string) =>
  apiRequest<{ status?: string; uptime?: number }>(base, "/healthz", { timeoutMs: 6000 });

export const fetchMe = (base: string, token?: string | null) =>
  apiRequest<PublicUser & { user?: PublicUser }>(base, "/api/auth/me", { token });

export const login = (base: string, email: string, password: string) =>
  apiRequest<{ token?: string; user?: PublicUser }>(base, "/api/auth/login", {
    method: "POST",
    body: { email, password },
  });

export const getAppearance = (base: string, token: string | null) =>
  apiRequest<{ appearance?: unknown }>(base, "/api/me/appearance", { token });

/** 409 = the server holds a newer look (last write wins by updatedAt); the body carries it. */
export const putAppearance = (base: string, token: string | null, appearance: unknown) =>
  apiRequest<{ appearance?: unknown }>(base, "/api/me/appearance", { method: "PUT", body: { appearance }, token });

export function userLabel(u: PublicUser | null | undefined): string {
  if (!u) return "your account";
  const name = u.name || u.displayName;
  if (name && u.email) return `${name} (${u.email})`;
  return name || u.email || "your account";
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${Math.max(1, m)} min`;
}

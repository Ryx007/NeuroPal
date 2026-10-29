// The web app's door to the server. Builds on lib/api.ts (the address and
// the session the site already keeps) and adds what an app needs: errors
// that throw, the session-ended rule, uploads, cancellation.
//
// 401 rule (same as every NeuroPal client): a 401 only ends the session when
// the request carried the token that is STILL current — a wrong password on
// sign-in, or a late reply to a request sent with an older token, never
// signs anyone out.
import { apiBaseStore, mixedContentProblem, sessionStore, type Session } from "@/lib/api";
import { reportReachable, reportUnreachable } from "./connection";

export class ApiError extends Error {
  /** 0 = no answer (offline, timeout, CORS, mixed content). */
  readonly status: number;
  /** Seconds to wait (429). */
  readonly retryAfter: number | null;
  /** The parsed reply body, when there was one. */
  readonly body: unknown;

  constructor(message: string, status: number, retryAfter: number | null = null, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.body = body;
  }

  get offline() {
    return this.status === 0;
  }
}

/** The signed-in session for the CURRENT server, or null. */
export function currentSession(): Session | null {
  const s = sessionStore.get();
  const base = apiBaseStore.get();
  return s && s.base === base ? s : null;
}

export function currentBase(): string {
  return apiBaseStore.get();
}

type Body = { json: unknown } | { form: FormData } | undefined;

export interface RequestOptions {
  method?: string;
  body?: Body;
  /** Query parameters; undefined/null/"" values are skipped. */
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  /** Default 20 s; uploads and AI calls pass longer. */
  timeoutMs?: number;
  /** false for sign-in/sign-up (never sends the session). */
  auth?: boolean;
  /**
   * true where a 401 means "a password you typed is wrong", not "the session
   * is over" (POST /auth/password). The caller then checks the session itself.
   */
  keepSessionOn401?: boolean;
}

function buildUrl(base: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${base}/api${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** One path segment, encoded (ids, EPUB paths split on "/"). */
export const seg = (s: string) => encodeURIComponent(s);

/** JSON request to /api<path>; resolves with the parsed body or throws ApiError. */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const base = currentBase();
  if (!base) throw new ApiError("Connect to your NeuroPal server first.", 0);
  const mixed = mixedContentProblem(base);
  if (mixed) throw new ApiError(mixed, 0);
  const session = opts.auth === false ? null : currentSession();
  const sentToken = session?.token ?? null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), opts.timeoutMs ?? 20000);
  const onAbort = () => controller.abort(opts.signal?.reason);
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  const headers: Record<string, string> = { Accept: "application/json" };
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  let body: BodyInit | undefined;
  if (opts.body && "json" in opts.body) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body.json);
  } else if (opts.body && "form" in opts.body) {
    body = opts.body.form; // the browser sets the multipart boundary
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(base, path, opts.query), {
      method: opts.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e; // the caller cancelled: not an error to show
    const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    if (timedOut) throw new ApiError("The server took too long to answer.", 0);
    reportUnreachable();
    throw new ApiError(
      isOffline() ? "You’re offline right now." : "Can’t reach your NeuroPal server right now.",
      0,
    );
  } finally {
    window.clearTimeout(timeout);
    opts.signal?.removeEventListener("abort", onAbort);
  }
  reportReachable();

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (res.ok) return data as T;

  const envelope = data as { error?: unknown; retryAfterSec?: unknown } | null;
  const message = typeof envelope?.error === "string" ? envelope.error : `The server answered ${res.status}.`;
  if (res.status === 401 && sentToken && !opts.keepSessionOn401 && currentSession()?.token === sentToken) {
    sessionStore.clear(); // the session is over: the app shows sign-in
  }
  const retryAfter =
    typeof envelope?.retryAfterSec === "number" ? envelope.retryAfterSec : Number(res.headers.get("Retry-After")) || null;
  throw new ApiError(message, res.status, retryAfter, data);
}

/** A URL to a server file for an <img>/<iframe> that can't send headers (pass a document ticket). */
export function fileUrl(path: string, query?: RequestOptions["query"]): string {
  return buildUrl(currentBase(), path, query);
}

function isOffline(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

/** Plain words for any error from `request`. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return e.retryAfter ? `Too many tries — wait ${e.retryAfter} s and try again.` : "Too many tries — wait a moment.";
    return e.message;
  }
  return "Something went wrong. Try again.";
}

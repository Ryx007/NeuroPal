// API endpoint resolution — single source of truth for the backend URL.
//
// P3 (sync): the Mini is reachable at more than one address, and which one
// works depends on where the device is:
//   - Tailscale MagicDNS (ryx-mac-mini.tail73ed8.ts.net) — works on-LAN and
//     off-LAN, survives DHCP drift, but needs Tailscale ON on the device
//   - the LAN IP — works at home even with Tailscale off, dies on cellular
// Candidates, in preference order:
//   1. web PRODUCTION build only: '' — a bare RELATIVE path. The front-end
//      is served by neuropal-backend/src/webServer.js (:8081), which
//      PROXIES /api, /healthz, /katex and /apk to the API (:4000) — so
//      everything the page needs is on the page's own origin and a
//      relative fetch always reaches the right backend, no matter what
//      domain, port, or protocol this build is deployed behind. Zero
//      config, ever: to move the API, repoint API_PROXY_TARGET on the web
//      server; the bundle contains no URLs to rebuild.
//   1b. web DEV only (`expo start --web`): the page's own hostname on
//      :4000 — Metro serves the dev bundle on its OWN port (8082, see
//      .claude/launch.json; 8081 belongs to the production web server) and
//      does NOT proxy, so a relative path would 404 against Metro. A
//      same-machine dev convenience only.
//   2. EXPO_PUBLIC_API_BASE_URL (MagicDNS — see .env) — native only in
//      practice (web never needs a baked address at all in production)
//   3. EXPO_PUBLIC_API_FALLBACK_URLS (comma-separated, e.g. the LAN IP)
// Exports start on the first candidate; a background /healthz probe switches
// to the first reachable one and re-points the axios instances via
// subscribeApi. Expo inlines EXPO_PUBLIC_* at bundle time — an APK must be
// rebuilt to CHANGE the candidate list; the probe only picks among them.
//
// '' is a LEGITIMATE candidate/host value (same-origin), not "unconfigured"
// — every check below uses `candidates.length` / array position, never
// plain truthiness on a host string, so a same-origin '' is never mistaken
// for "no backend known" (which is instead signalled by `apiConfigured`).

import { Platform } from 'react-native';

const clean = (u) => String(u || '').trim().replace(/\/+$/, '');

// Issue 0 (2026-07-17): the OWNER-SET override ends the
// rebuild-the-APK-when-the-IP-moves cycle. It lives in AsyncStorage, is
// editable from Settings, and always probes FIRST. The baked
// EXPO_PUBLIC_* values are only the default seed.
const OVERRIDE_KEY = 'neuropal-api-override';
let apiOverride = null;

function buildCandidates() {
    const list = [];
    if (apiOverride) list.push(clean(apiOverride));

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (!__DEV__) {
            // Production web: same origin as the page itself — see the
            // module header. '' is pushed directly (not through the
            // filter(Boolean) below) because empty string is the correct
            // value here, not a missing one.
            list.push('');
        } else if (window.location?.hostname) {
            list.push(`${window.location.protocol}//${window.location.hostname}:4000`);
        }
    }

    const envCandidates = [clean(process.env.EXPO_PUBLIC_API_BASE_URL)];
    for (const u of String(process.env.EXPO_PUBLIC_API_FALLBACK_URLS || '').split(',')) {
        envCandidates.push(clean(u));
    }
    list.push(...envCandidates.filter(Boolean));

    // De-dupe while preserving order. Set (not filter(Boolean)) so a
    // legitimate '' entry survives — Boolean-filtering it out would silently
    // drop the same-origin candidate.
    return [...new Set(list)];
}

let candidates = buildCandidates();

// False when no candidate exists at all — callers surface this as a visible
// configuration error instead of silently falling back to mock data.
export const apiConfigured = candidates.length > 0;

// Live bindings — reassigned when the probe picks a different host. Metro
// compiles `import { baseUrl }` to a property read at use time, so string
// interpolations pick the switch up on the next call; axios instances
// capture baseURL at create() and re-point through subscribeApi instead.
//
// Gated on `candidates.length`, NOT on apiHost's truthiness — apiHost can
// legitimately BE '' (same-origin web) while still fully configured; only
// an EMPTY candidate list means "no backend known at all".
export let apiHost = candidates.length > 0 ? candidates[0] : '';
export let baseUrl = candidates.length > 0 ? `${apiHost}/api/` : '';
export let socketUrl = apiHost;

// Image / file serving — both ride on the same `/api/documents/:id/raw`
// stream, but if you ever expose a raw `/uploads/` static host, point this
// at it.
export let documentImageUrl = candidates.length > 0 ? `${apiHost}/api/documents/` : '';

// ---- connection status (Settings indicator + axios re-pointing) -----------

const listeners = new Set();

// Mutated in place; subscribers must copy what they keep.
const status = {
    host: apiHost,
    state: apiConfigured ? 'checking' : 'unconfigured', // checking | ok | down | unconfigured
    checkedAt: null,
    candidates: candidates.map((url) => ({ url, ok: null, ms: null })),
    override: null,
};

export function getApiStatus() {
    return status;
}

// A candidate/host string for DISPLAY (Settings' candidate list, the
// offline banner). Every value this is called with is a real, attempted
// candidate — '' unambiguously means same-origin here (the true
// "nothing configured at all" state has zero candidates and never reaches
// UI that iterates a candidate list).
export function labelForCandidate(url) {
    return url ? String(url).replace(/^https?:\/\//, '') : 'this server';
}

// fn(status) fires after every probe round and after a host switch.
// Returns an unsubscribe function.
export function subscribeApi(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function notify() {
    listeners.forEach((fn) => {
        try {
            fn(status);
        } catch (e) {
            // a broken subscriber must not break the others
        }
    });
}

function setHost(host) {
    apiHost = host;
    baseUrl = `${host}/api/`;
    socketUrl = host;
    documentImageUrl = `${host}/api/documents/`;
    status.host = host;
}

async function probe(url, timeoutMs = 4000) {
    const started = Date.now();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const res = await fetch(`${url}/healthz`, { signal: controller?.signal });
        return { ok: res.ok, ms: Date.now() - started };
    } catch (e) {
        return { ok: false, ms: Date.now() - started };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

let inFlight = null;

// Probe every candidate in parallel and switch to the first healthy one in
// PREFERENCE order (not fastest — the MagicDNS name must win over the LAN IP
// whenever both answer, or devices would pin to an address that dies the
// moment they leave the house). Never throws; concurrent calls coalesce.
export function recheckApi() {
    if (candidates.length === 0) return Promise.resolve(status);
    if (inFlight) return inFlight;
    const roster = candidates; // snapshot — an override change mid-probe restarts
    status.state = 'checking';
    notify();
    inFlight = Promise.all(roster.map((u) => probe(u))).then((results) => {
        status.candidates = roster.map((url, i) => ({
            url,
            ok: results[i].ok,
            ms: results[i].ok ? results[i].ms : null,
        }));
        // Index-based, not `roster.find(...)` — a winning same-origin ('')
        // candidate is falsy and `find`'s result can't be distinguished from
        // "nothing matched" by truthiness alone.
        const winnerIdx = results.findIndex((r) => r.ok);
        if (winnerIdx >= 0 && roster[winnerIdx] !== apiHost) setHost(roster[winnerIdx]);
        status.state = winnerIdx >= 0 ? 'ok' : 'down';
        status.checkedAt = Date.now();
        inFlight = null;
        notify();
        return status;
    });
    return inFlight;
}

// ---- runtime override (Issue 0) --------------------------------------------

export function getApiOverride() {
    return apiOverride;
}

// Set (or clear with null/'') the owner's backend address. Persisted, applied
// to the live bindings IMMEDIATELY so the next request uses it, then probed.
export async function setApiOverride(url) {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const next = clean(url) || null;
    apiOverride = next;
    status.override = next;
    try {
        if (next) await AsyncStorage.setItem(OVERRIDE_KEY, next);
        else await AsyncStorage.removeItem(OVERRIDE_KEY);
    } catch (e) {
        // storage failure → override still applies for this session
    }
    candidates = buildCandidates();
    inFlight = null; // drop any stale probe so the new roster wins
    if (next) setHost(next);
    else if (candidates.length > 0) setHost(candidates[0]);
    notify();
    return recheckApi();
}

// Load the persisted override at startup, then run the first resolution.
// Until both land the app talks to candidates[0] (the baked preference).
// `apiReady` resolves once the override is known, so the session code never
// compares a token's server against a host that is about to change.
export const apiReady = (async () => {
    try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const stored = await AsyncStorage.getItem(OVERRIDE_KEY);
        if (stored) {
            apiOverride = clean(stored);
            status.override = apiOverride;
            candidates = buildCandidates();
            setHost(apiOverride);
        }
    } catch (e) {
        // no storage (tests/SSR) — baked candidates only
    }
    if (candidates.length > 0) recheckApi();
})();

// ---- session ----------------------------------------------------------------
//
// A session belongs to the server that issued it. It is stored together with
// that server's address and only ever sent there: after "Change server" (or a
// fallback address taking over) the other host gets no token at all and asks
// for its own sign-in, and switching back finds the old session intact.
//
// Native: expo-secure-store (Android Keystore / iOS Keychain), so the token is
// encrypted at rest and never restored from a backup onto another phone.
// Web: localStorage via AsyncStorage (no keystore in a browser).

// Old plain-token key (≤ 0.2.0, a single-user server: never a real session).
export const SESSION_KEY = 'neuropal-session';
const SESSION_RECORD_KEY = 'neuropal.session.v2';
// Set by a sign-out (or the server ending the session), cleared by the next
// sign-in: after a sign-out the app no longer opens offline without one.
const SIGNED_OUT_KEY = 'neuropal.signed-out';

function asyncStorage() {
    return require('@react-native-async-storage/async-storage').default;
}

function secureStore() {
    if (Platform.OS === 'web') return null;
    try {
        return require('expo-secure-store');
    } catch (e) {
        return null;
    }
}

async function readRecord() {
    try {
        const ss = secureStore();
        const raw = ss ? await ss.getItemAsync(SESSION_RECORD_KEY) : await asyncStorage().getItem(SESSION_RECORD_KEY);
        if (!raw) return null;
        const rec = JSON.parse(raw);
        return rec && typeof rec.token === 'string' && typeof rec.host === 'string' ? rec : null;
    } catch (e) {
        return null;
    }
}

async function writeRecord(rec) {
    const ss = secureStore();
    if (ss) {
        if (rec) await ss.setItemAsync(SESSION_RECORD_KEY, JSON.stringify(rec));
        else await ss.deleteItemAsync(SESSION_RECORD_KEY);
    } else if (rec) {
        await asyncStorage().setItem(SESSION_RECORD_KEY, JSON.stringify(rec));
    } else {
        await asyncStorage().removeItem(SESSION_RECORD_KEY);
    }
}

// A token left by an older build under the plain key is dropped unused.
(async () => {
    try {
        await asyncStorage().removeItem(SESSION_KEY);
    } catch (e) {
        // nothing to clean
    }
})();

// Header injection — runs before every axios request: `Authorization:
// Bearer <jwt>` when the active server is the one that issued the session.
export async function getHeaders() {
    try {
        const session = await getSessionToken();
        return session ? { Authorization: `Bearer ${session}` } : {};
    } catch (e) {
        return {};
    }
}

// The session for the server the app is talking to now, or null.
export async function getSessionToken() {
    await apiReady.catch(() => {});
    const rec = await readRecord();
    return rec && rec.host === apiHost ? rec.token : null;
}

// Keep a session from the active server (sign-in, refresh, password change).
export async function saveSessionToken(token, host = apiHost) {
    if (!token) return clearSession();
    await writeRecord({ host: clean(host), token: String(token) });
    try {
        await asyncStorage().removeItem(SIGNED_OUT_KEY);
    } catch (e) {
        // the flag only decides whether the app may open offline
    }
}

// End the session with the active server (sign-out, or the server said 401).
// A session that belongs to another server is left alone — this one never
// had it.
export async function clearSession() {
    await apiReady.catch(() => {});
    const rec = await readRecord();
    if (!rec || rec.host === apiHost) await writeRecord(null);
    try {
        await asyncStorage().setItem(SIGNED_OUT_KEY, '1');
    } catch (e) {
        // best effort
    }
}

// Does a 401 end the session we hold NOW? Not when the request went out with
// an older token, or with none while we have one (e.g. a request that left
// just before a sign-in finished): that answer is stale, and acting on it
// would throw away the fresh session.
export async function isCurrentSession401(error) {
    const h = error?.config?.headers;
    const raw = (h && (typeof h.get === 'function' ? h.get('Authorization') : h.Authorization || h.authorization)) || '';
    const sent = String(raw).replace(/^Bearer\s+/i, '');
    const current = await getSessionToken();
    return !current || sent === current;
}

// True after a sign-out until the next sign-in.
export async function wasSignedOut() {
    try {
        return (await asyncStorage().getItem(SIGNED_OUT_KEY)) === '1';
    } catch (e) {
        return false;
    }
}

// ---- "this server wants you to sign in again" -------------------------------
// Any API client that gets a 401 calls notifyUnauthorized(); the navigator
// listens and routes to the sign-in screen. A plain event (not a Redux import)
// keeps the HTTP layer free of a store dependency.
const unauthorizedListeners = new Set();

export function onUnauthorized(fn) {
    unauthorizedListeners.add(fn);
    return () => unauthorizedListeners.delete(fn);
}

export function notifyUnauthorized() {
    unauthorizedListeners.forEach((fn) => {
        try {
            fn();
        } catch (e) {
            // one broken listener must not break the others
        }
    });
}


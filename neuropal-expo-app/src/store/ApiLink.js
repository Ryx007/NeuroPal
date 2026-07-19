// API endpoint resolution — single source of truth for the backend URL.
//
// P3 (sync): the Mini is reachable at more than one address, and which one
// works depends on where the device is:
//   - Tailscale MagicDNS (ryx-mac-mini.tail73ed8.ts.net) — works on-LAN and
//     off-LAN, survives DHCP drift, but needs Tailscale ON on the device
//   - the LAN IP — works at home even with Tailscale off, dies on cellular
// Candidates, in preference order:
//   1. web only: the page's own hostname on :4000 — the backend serves the
//      web build itself, so whatever host delivered the bundle IS the API
//   2. EXPO_PUBLIC_API_BASE_URL (MagicDNS — see .env)
//   3. EXPO_PUBLIC_API_FALLBACK_URLS (comma-separated, e.g. the LAN IP)
// Exports start on the first candidate; a background /healthz probe switches
// to the first reachable one and re-points the axios instances via
// subscribeApi. Expo inlines EXPO_PUBLIC_* at bundle time — an APK must be
// rebuilt to CHANGE the candidate list; the probe only picks among them.

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
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
        list.push(`${window.location.protocol}//${window.location.hostname}:4000`);
    }
    list.push(clean(process.env.EXPO_PUBLIC_API_BASE_URL));
    for (const u of String(process.env.EXPO_PUBLIC_API_FALLBACK_URLS || '').split(',')) {
        list.push(clean(u));
    }
    return [...new Set(list.filter(Boolean))];
}

let candidates = buildCandidates();

// False when no candidate exists at all — callers surface this as a visible
// configuration error instead of silently falling back to mock data.
export const apiConfigured = candidates.length > 0;

// Live bindings — reassigned when the probe picks a different host. Metro
// compiles `import { baseUrl }` to a property read at use time, so string
// interpolations pick the switch up on the next call; axios instances
// capture baseURL at create() and re-point through subscribeApi instead.
export let apiHost = candidates[0] || '';
export let baseUrl = apiHost ? `${apiHost}/api/` : '';
export let socketUrl = apiHost;

// Image / file serving — both ride on the same `/api/documents/:id/raw`
// stream, but if you ever expose a raw `/uploads/` static host, point this
// at it.
export let documentImageUrl = `${apiHost}/api/documents/`;

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
        const winner = roster.find((u, i) => results[i].ok);
        if (winner && winner !== apiHost) setHost(winner);
        status.state = winner ? 'ok' : 'down';
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
    else if (candidates[0]) setHost(candidates[0]);
    notify();
    return recheckApi();
}

// Load the persisted override at startup, then run the first resolution.
// Until both land the app talks to candidates[0] (the baked preference).
(async () => {
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

// Local storage key — must match what `ApiRequest.js` reads/writes.
export const SESSION_KEY = 'neuropal-session';

// Header injection — runs before every axios request. Reads the JWT out of
// AsyncStorage and attaches it as `Authorization: Bearer <jwt>` (the
// backend accepts that AND `x-session: <jwt>`; we send the standard one).
export async function getHeaders() {
    try {
        const session = await getSessionToken();
        return session ? { Authorization: `Bearer ${session}` } : {};
    } catch (e) {
        return {};
    }
}

async function getSessionToken() {
    try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        return await AsyncStorage.getItem(SESSION_KEY);
    } catch (e) {
        return null;
    }
}

export async function saveSessionToken(token) {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (token) {
        await AsyncStorage.setItem(SESSION_KEY, token);
    } else {
        await AsyncStorage.removeItem(SESSION_KEY);
    }
}

export async function clearSession() {
    await saveSessionToken(null);
}

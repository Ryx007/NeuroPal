// API endpoint constants — single source of truth for the backend URL.
// Nginx on the server points `local.ryx007.science` at the Node API on
// `localhost:4000`, with TLS terminated at the proxy.
//
// To swap environments (laptop LAN, staging, prod), change ONLY this file.

const API_HOST = 'https://local.ryx007.science';

export const baseUrl = `${API_HOST}/api/`;
export const socketUrl = API_HOST;

// Image / file serving — both ride on the same `/api/documents/:id/raw`
// stream, but if you ever expose a raw `/uploads/` static host, point this
// at it.
export const documentImageUrl = `${API_HOST}/api/documents/`;

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

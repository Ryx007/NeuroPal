// API endpoint constants — single source of truth for the backend URL.
//
// The host comes from EXPO_PUBLIC_API_BASE_URL (.env / .env.example) — the
// Mac Mini's LAN address, e.g. http://192.168.3.169:4000. Expo inlines
// EXPO_PUBLIC_* at bundle time, so restart `expo start` after changing it.

const API_HOST = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');

// False when EXPO_PUBLIC_API_BASE_URL is missing — callers surface this as a
// visible configuration error instead of silently falling back to mock data.
export const apiConfigured = Boolean(API_HOST);
export const apiHost = API_HOST;

export const baseUrl = API_HOST ? `${API_HOST}/api/` : '';
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

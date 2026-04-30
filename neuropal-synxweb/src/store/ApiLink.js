// API endpoint constants — mirrors Synxweb's `src/store/ApiLink.js` shape.
// When the FastAPI backend (NeuroPal Plan §Phase 0) goes live, swap these
// for the real Railway/Render URLs. Keep them all in this single file so
// every other module reads the same source of truth.

export const baseUrl = 'https://neuropal-api.example.com/';

export const uploadUrl = baseUrl + 'documents/upload';
export const documentImageUrl = baseUrl + 'images/';

export const socketUrl = baseUrl;

// `getHeaders` runs before every axios request — the request interceptor in
// `ApiRequest.js` calls this and merges the result into config.headers.
export async function getHeaders() {
    let headers = {};
    try {
        const session = await getSessionToken();
        if (session) {
            headers = { 'x-session': session };
        }
    } catch (e) {
        // swallow — best-effort header attach
    } finally {
        return headers;
    }
}

// Async because RN AsyncStorage is async, unlike Synxweb's localStorage.
async function getSessionToken() {
    try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        return await AsyncStorage.getItem('neuropal-session');
    } catch (e) {
        return null;
    }
}

// Lightweight socket stub — synxweb-style API surface (`socket.on/off/disconnect`)
// without an actual socket.io-client dependency yet. The backend doesn't emit
// session-check events in this MVP; this exists so ApiRequest.js can call
// `socket.disconnect()` on 401 without crashing.
//
// When you wire real-time events (Phase 5 companion streaming, body-doubling
// rooms in Phase 3), swap this for `socket.io-client` + the synxweb config.

const listeners = new Map();

export const socket = {
    on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
    },
    off(event, handler) {
        listeners.get(event)?.delete(handler);
    },
    disconnect() {
        // no-op for now
    },
    emit(event, payload) {
        listeners.get(event)?.forEach((fn) => {
            try {
                fn(payload);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[socket]', event, e);
            }
        });
    },
};

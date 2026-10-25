import axios from 'axios';
import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import Toast from '../components/toast';

import { baseUrl, clearSession, getHeaders, isCurrentSession401, recheckApi, subscribeApi } from './ApiLink';
import { socket } from './Socket';
import { updateLogin } from './slices/authSlice';

// Single shared axios instance. The header interceptor reads the JWT from
// AsyncStorage on every request, so token rotation Just Works without the
// pages needing to reach for it.
//
// Response handling — the NeuroPal backend returns PLAIN objects with HTTP
// status codes carrying success/failure (no Synxweb-style `{status, data,
// message}` envelope). So:
//   2xx → resolve with response.data
//   4xx/5xx → axios throws; we extract `error.response.data.error` and
//             surface it as a toast (with the 401 → logout shortcut intact)

const axiosInstance = axios.create({
    baseURL: baseUrl,
    timeout: 30000,
});

// ApiLink's health probe may switch the active host (MagicDNS ↔ LAN IP);
// the instance captured baseURL at create(), so follow the switch.
subscribeApi(() => {
    axiosInstance.defaults.baseURL = baseUrl;
});

axiosInstance.interceptors.request.use(
    async (config) => {
        const headers = await getHeaders();
        config.headers = { ...config.headers, ...headers };
        return config;
    },
    (error) => Promise.reject(error),
);

export const useApiRequest = () => {
    const dispatch = useDispatch();

    const handleError = useCallback(
        (error) => {
            const status = error?.response?.status;
            const serverMsg = error?.response?.data?.error;
            // Sign-in calls answer 401 for a wrong password — that's the
            // message to show, not "session expired".
            const isAuthCall = /(^|\/)auth\//.test(String(error?.config?.url || ''));

            if (status === 401 && !isAuthCall) {
                // Only when the 401 is about the session we hold now — a
                // stale answer to an older request must not undo a sign-in.
                isCurrentSession401(error)
                    .catch(() => true)
                    .then((current) => {
                        if (!current) return;
                        dispatch(updateLogin(false));
                        clearSession().catch(() => {});
                        Toast.show({ type: 'error', text1: 'Session expired' });
                        try {
                            socket.disconnect();
                        } catch (e) {}
                    });
                return;
            }

            // no HTTP response at all → the active host may be wrong for
            // where this device is; re-probe so the next attempt can ride a
            // fallback (coalesced + fire-and-forget inside ApiLink)
            if (!status) recheckApi();

            Toast.show({
                type: 'error',
                text1: serverMsg || 'Network error',
                text2: !serverMsg ? error.message : undefined,
            });
        },
        [dispatch],
    );

    // GET — `endpoint` is relative to ApiLink.baseUrl
    //   fetchData('documents')              → GET /api/documents
    //   fetchData('documents/' + id)        → GET /api/documents/<id>
    //   fetchData('auth/me', { silent: true }) → no toast on error
    //   opts.rethrow → propagate the axios error to the caller instead of
    //   swallowing it into null (callers that render their own error state)
    const fetchData = useCallback(
        async (endpoint, opts = {}) => {
            try {
                const response = await axiosInstance.get(
                    endpoint,
                    opts.timeout ? { timeout: opts.timeout } : undefined,
                );
                return response.data;
            } catch (error) {
                if (!opts.silent) handleError(error);
                if (opts.rethrow) throw error;
                return null;
            }
        },
        [handleError],
    );

    const postData = useCallback(
        async (endpoint, data, opts = {}) => {
            try {
                const response = await axiosInstance.post(endpoint, data);
                return response.data;
            } catch (error) {
                if (!opts.silent) handleError(error);
                return null;
            }
        },
        [handleError],
    );

    // NOTE: file uploads do NOT live here. The axios/XHR FormData path
    // fails on Android with an opaque "Network Error" — use
    // services/network.js uploadDocument (expo-file-system on native,
    // real File on web) instead.

    return { fetchData, postData };
};

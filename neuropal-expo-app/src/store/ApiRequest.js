import axios from 'axios';
import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import Toast from 'react-native-toast-message';

import { baseUrl, clearSession, getHeaders } from './ApiLink';
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

            if (status === 401) {
                dispatch(updateLogin(false));
                clearSession().catch(() => {});
                Toast.show({ type: 'error', text1: 'Session expired' });
                try {
                    socket.disconnect();
                } catch (e) {}
                return;
            }

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
                const response = await axiosInstance.get(endpoint);
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

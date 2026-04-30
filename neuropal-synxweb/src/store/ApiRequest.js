import axios from 'axios';
import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import Toast from 'react-native-toast-message';

import { baseUrl, getHeaders, uploadUrl } from './ApiLink';
import { socket } from './Socket';
import { updateLogin } from './slices/configSlice';

// Single shared axios instance — header injection via interceptor matches
// Synxweb's `src/store/ApiRequest.js` line-for-line.
const axiosInstance = axios.create({
    baseURL: baseUrl,
});

axiosInstance.interceptors.request.use(
    async (config) => {
        const headers = await getHeaders();
        config.headers = { ...config.headers, ...headers };
        return config;
    },
    (error) => Promise.reject(error),
);

// Hook: returns { fetchData, postData, uploadData }. Pages use this for
// every backend call so we have ONE place to handle 401 / network errors /
// toast feedback. NeuroPal stub today — wire to FastAPI in Sprint 1.1.
export const useApiRequest = () => {
    const dispatch = useDispatch();

    const handleError = useCallback(
        (error) => {
            if (error.response && error.response.status === 401) {
                dispatch(updateLogin(false));
                try {
                    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                    AsyncStorage.removeItem('neuropal-session');
                } catch (e) {}
                Toast.show({ type: 'error', text1: 'Session expired' });
                socket.disconnect();
            } else {
                Toast.show({
                    type: 'error',
                    text1: 'Network error',
                    text2: error.message,
                });
            }
        },
        [dispatch],
    );

    const fetchData = useCallback(
        async (endpoint) => {
            try {
                const response = await axiosInstance.get(endpoint);
                if (!response.data.status) {
                    throw new Error(response.data.message);
                }
                return response.data;
            } catch (error) {
                handleError(error);
                return null;
            }
        },
        [handleError],
    );

    const postData = useCallback(
        async (endpoint, data) => {
            try {
                const response = await axiosInstance.post(endpoint, data);
                if (!response.data.status) {
                    throw new Error(response.data.message);
                }
                return response.data;
            } catch (error) {
                handleError(error);
                return null;
            }
        },
        [handleError],
    );

    const uploadData = useCallback(
        async (data) => {
            try {
                const response = await axiosInstance.post(uploadUrl, data, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                if (!response.data.status) {
                    throw new Error(response.data.message);
                }
                return response.data;
            } catch (error) {
                handleError(error);
                return null;
            }
        },
        [handleError],
    );

    return { fetchData, postData, uploadData };
};

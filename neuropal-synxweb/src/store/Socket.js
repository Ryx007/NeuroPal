import { io } from 'socket.io-client';

import { socketUrl } from './ApiLink';

// Module-scope singleton, identical to Synxweb's `src/store/Socket.js`.
// `autoConnect: false` means the socket is dormant until `setSocketUser`
// is called after a successful login.
const socketOptions = {
    withCredentials: true,
    path: '',
    autoConnect: false,
    transports: ['websocket'],
    query: {
        user: null,
        app: 'neuropal',
    },
};

export const socket = io(socketUrl, socketOptions);

export const setSocketUser = (userId) => {
    socket.io.opts.query = { user: userId, app: 'neuropal' };
    socket.disconnect();
    socket.connect();
};

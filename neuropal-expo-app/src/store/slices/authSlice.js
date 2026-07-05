import { createSlice } from '@reduxjs/toolkit';

// Auth state for the backend-connected build.
//
// Codex's other slices stay split (ui / home / library / reader / onboarding).
// This slice carries everything synxweb's mega-`configSlice` holds in the
// auth/tenant block — just enough for `ApiRequest.js` to dispatch
// `updateLogin(false)` on 401 and for `App.js`'s boot pipeline to hydrate
// the user object once `/api/auth/me` resolves.
//
//   loggedIn === null  — still booting, haven't checked yet
//   loggedIn === false — confirmed not logged in (no token / token revoked)
//   loggedIn === true  — `me` resolved, user is authenticated

const initialState = {
    loggedIn: null,
    userId: '',
    userName: '',
    email: '',
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        updateLogin(state, action) {
            state.loggedIn = action.payload;
        },
        updateUserId(state, action) {
            state.userId = action.payload || '';
        },
        updateUserName(state, action) {
            state.userName = action.payload || '';
        },
        updateEmail(state, action) {
            state.email = action.payload || '';
        },
        hydrateUser(state, action) {
            const u = action.payload || {};
            state.loggedIn = true;
            state.userId = u.id || u._id || '';
            state.userName = u.name || '';
            state.email = u.email || '';
        },
        resetAuth() {
            return { ...initialState, loggedIn: false };
        },
    },
});

export const {
    updateLogin,
    updateUserId,
    updateUserName,
    updateEmail,
    hydrateUser,
    resetAuth,
} = authSlice.actions;

export default authSlice.reducer;

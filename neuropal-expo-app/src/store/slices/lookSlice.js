import { createSlice } from "@reduxjs/toolkit";

import {
  HOME_DEFAULT,
  PAL_DEFAULT,
  SIGNAL_DEFAULT,
  normalizeHome,
  normalizePal,
  normalizeSignal,
} from "../../theme/tokens";

// v2 "Make it yours" state: which skin is on, the Signal settings, the Pal,
// the Home layout. Classic's theme/accent stay in uiSlice (unchanged since
// v1) — selectAppearance() joins both into the shared appearance object
// (docs/PLATFORM-PLAN.md §3.2) that is persisted, synced and undone as one.
//
// `updatedAt` is stamped on every LOCAL change; the backend keeps the newest
// copy (last write wins), so a stale device adopts instead of overwriting.

const initialState = {
  skin: "classic",
  signal: { ...SIGNAL_DEFAULT },
  suggestLooks: true,
  pal: { ...PAL_DEFAULT },
  home: { tiles: HOME_DEFAULT.tiles.map((t) => ({ ...t })), rules: [] },
  updatedAt: null,
  // One-time "two skins now" card on Home.
  introSeen: false,
};

const stamp = (state) => {
  state.updatedAt = new Date().toISOString();
};

const lookSlice = createSlice({
  name: "look",
  initialState,
  reducers: {
    hydrateLook(state, action) {
      const p = action.payload || {};
      state.skin = p.skin === "signal" ? "signal" : "classic";
      state.signal = normalizeSignal(p.signal);
      state.suggestLooks = p.suggestLooks !== false;
      state.pal = normalizePal(p.pal);
      state.home = normalizeHome(p.home);
      state.updatedAt = typeof p.updatedAt === "string" ? p.updatedAt : null;
      state.introSeen = Boolean(p.introSeen);
    },
    setSkin(state, action) {
      state.skin = action.payload === "signal" ? "signal" : "classic";
      stamp(state);
    },
    setSignal(state, action) {
      state.signal = normalizeSignal(action.payload);
      stamp(state);
    },
    patchSignal(state, action) {
      state.signal = normalizeSignal({ ...state.signal, ...action.payload });
      stamp(state);
    },
    setSuggestLooks(state, action) {
      state.suggestLooks = Boolean(action.payload);
      stamp(state);
    },
    patchPal(state, action) {
      state.pal = normalizePal({ ...state.pal, ...action.payload });
      stamp(state);
    },
    setHome(state, action) {
      state.home = normalizeHome(action.payload);
      stamp(state);
    },
    // Apply a whole appearance (preview → Apply, Undo, saved looks). The
    // classic half is dispatched to uiSlice by the thunk below.
    applyLookState(state, action) {
      const a = action.payload || {};
      state.skin = a.skin === "signal" ? "signal" : "classic";
      state.signal = normalizeSignal(a.signal);
      state.suggestLooks = a.suggestLooks !== false;
      state.pal = normalizePal(a.pal);
      state.home = normalizeHome(a.home);
      // `adopt` = this came FROM the server: keep its timestamp so we don't
      // immediately echo it back as a "newer" local change.
      state.updatedAt = action.meta?.adopt && a.updatedAt ? a.updatedAt : new Date().toISOString();
    },
    setIntroSeen(state) {
      state.introSeen = true;
    },
    // Classic theme/accent live in uiSlice and older screens (Tweaks sheet,
    // Settings) change them directly — the sync service stamps those edits
    // here so they still reach the server.
    touchLook(state) {
      stamp(state);
    },
  },
});

export const {
  hydrateLook,
  setSkin,
  setSignal,
  patchSignal,
  setSuggestLooks,
  patchPal,
  setHome,
  setIntroSeen,
  touchLook,
} = lookSlice.actions;

// RTK action creators take one argument; `adopt` rides in meta.
export const applyLookState = (appearance, { adopt = false } = {}) => ({
  type: lookSlice.actions.applyLookState.type,
  payload: appearance,
  meta: { adopt },
});

export default lookSlice.reducer;

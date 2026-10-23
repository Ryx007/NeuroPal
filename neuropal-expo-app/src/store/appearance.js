import { createSelector } from "@reduxjs/toolkit";

import { normalizeAppearance } from "../theme/tokens";
import { applyLookState } from "./slices/lookSlice";
import { setAccent, setTheme } from "./slices/uiSlice";

export const selectLook = (state) => state.look;

// The shared appearance object (docs/PLATFORM-PLAN.md §3.2): Classic's
// theme/accent from uiSlice + everything v2 from lookSlice. Memoised so
// subscribers can compare by identity.
export const selectAppearance = createSelector(
  [(s) => s.look, (s) => s.ui.theme, (s) => s.ui.accent],
  (look, theme, accent) =>
    normalizeAppearance({
      skin: look.skin,
      classic: { theme, accent },
      signal: look.signal,
      suggestLooks: look.suggestLooks,
      pal: look.pal,
      home: look.home,
      updatedAt: look.updatedAt,
    })
);

// Apply a whole appearance in one go — used by the studio's Apply, Undo,
// saved looks and the server-sync adopt path.
export function applyAppearance(appearance, opts) {
  return (dispatch) => {
    const a = normalizeAppearance(appearance);
    dispatch(setTheme(a.classic.theme));
    dispatch(setAccent(a.classic.accent));
    dispatch(applyLookState(a, opts));
  };
}

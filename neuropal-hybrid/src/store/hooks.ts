import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";

import type { AppDispatch, RootState } from "./index";

/**
 * Typed Redux hooks — drop-in replacement for raw `useDispatch` /
 * `useSelector`. Always import these from `@/store/hooks` so TypeScript
 * narrows state paths correctly.
 *
 * (This is the hybrid's answer to Codex's `mapStateToProps` request:
 * same statically-typed state access, but with hooks rather than HOCs.
 * If you decide later you want `connect()`, it's still available — the
 * store and slices remain 100% compatible.)
 */
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

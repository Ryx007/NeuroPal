"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { paletteVars, resolvePalette, skinAttributes, type Appearance, type Palette } from "@/lib/appearance";
import {
  APPEARANCE_KEY,
  appearanceStore,
  commitAppearance,
  editAppearance,
  historyStore,
  undoAppearance,
  writeCssCache,
} from "@/lib/appearanceStore";
import { readRaw, useHydrated, usePrefersReducedMotion, useStored } from "@/lib/store";

interface AppearanceContextValue {
  appearance: Appearance;
  palette: Palette;
  reducedMotion: boolean;
  hydrated: boolean;
  canUndo: boolean;
  commit: typeof commitAppearance;
  edit: typeof editAppearance;
  undo: typeof undoAppearance;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const appearance = useStored(appearanceStore);
  const history = useSyncExternalStore(historyStore.subscribe, historyStore.get, historyStore.getServer);
  const reducedMotion = usePrefersReducedMotion();
  const hydrated = useHydrated();
  const palette = useMemo(() => resolvePalette(appearance), [appearance]);

  // Apply the look to <html>: data-* attributes pick the skin's rules in
  // globals.css, inline custom properties carry the resolved palette.
  useIsomorphicLayoutEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(skinAttributes(appearance, palette, reducedMotion))) root.setAttribute(k, v);
    for (const [k, v] of Object.entries(paletteVars(palette))) root.style.setProperty(k, v);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.surface);
  }, [hydrated, appearance, palette, reducedMotion]);

  // Keep the no-flash cache in step when token values change between deploys.
  useEffect(() => {
    if (hydrated && readRaw("local", APPEARANCE_KEY) !== null) writeCssCache(appearance);
  }, [hydrated, appearance]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      palette,
      reducedMotion,
      hydrated,
      canUndo: history.length > 0,
      commit: commitAppearance,
      edit: editAppearance,
      undo: undoAppearance,
    }),
    [appearance, palette, reducedMotion, hydrated, history],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const v = useContext(AppearanceContext);
  if (!v) throw new Error("useAppearance must be used inside <AppearanceProvider>");
  return v;
}

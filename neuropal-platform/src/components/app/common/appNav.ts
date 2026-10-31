"use client";
// Where the person was in the app before this page (for the calming steps'
// "I'm OK for now": back to that page, or Home after a fresh load).
let current: string | null = null;
let previous: string | null = null;

/** The shell calls this on every route change. */
export function rememberPath(path: string) {
  if (path === current) return;
  previous = current;
  current = path;
}

/** The in-app page before the current one (null after a fresh load). */
export function previousAppPath(): string | null {
  return previous;
}

/** The app's routes (trailing slash: the static export serves folders). */
export const ROUTES = {
  home: "/app/",
  library: "/app/library/",
  pal: "/app/pal/",
  settings: "/app/settings/",
  calm: "/app/calm/",
  read: "/app/read/",
} as const;

/** The reader for one document. */
export const readerHref = (id: string) => `/app/read/?doc=${encodeURIComponent(id)}`;

/** Ask the shell to open the keyboard shortcuts list (window event). */
export const SHORTCUTS_EVENT = "np:shortcuts";

/**
 * CSS custom property on <html>: the narrow-screen bottom bar's height in px
 * ("0px" when the sidebar shows instead). The shell keeps it current; use
 * `bottom: var(--np-app-bottom-bar, 0px)` for anything docked to the bottom.
 */
export const BOTTOM_BAR_VAR = "--np-app-bottom-bar";

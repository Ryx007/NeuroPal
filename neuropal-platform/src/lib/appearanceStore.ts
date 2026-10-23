// The visitor's look: persisted in this browser, applied to the whole site,
// with an in-memory undo history (this tab only).
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  paletteVars,
  resolvePalette,
  skinAttributes,
  type Appearance,
} from "./appearance";
import { APPEARANCE_CSS_KEY, APPEARANCE_KEY } from "./keys";
import { createStoredValue, writeRaw } from "./store";

export { APPEARANCE_KEY };

export const appearanceStore = createStoredValue<Appearance>({
  key: APPEARANCE_KEY,
  area: "local",
  fallback: DEFAULT_APPEARANCE,
  parse: (raw) => normalizeAppearance({ skin: "signal", ...JSON.parse(raw) }),
});

const EMPTY: Appearance[] = [];
let history: Appearance[] = EMPTY;
let lastKey: string | null = null;
let lastAt = 0;
const historyListeners = new Set<() => void>();

export const historyStore = {
  subscribe(listener: () => void) {
    historyListeners.add(listener);
    return () => historyListeners.delete(listener);
  },
  get: () => history,
  getServer: () => EMPTY,
};

function setHistory(next: Appearance[]) {
  history = next;
  historyListeners.forEach((l) => l());
}

const lookKey = (a: Appearance) => JSON.stringify([a.skin, a.classic, a.signal, a.suggestLooks]);

export function writeCssCache(a: Appearance) {
  const p = resolvePalette(a);
  writeRaw("local", APPEARANCE_CSS_KEY, JSON.stringify({ attrs: skinAttributes(a, p, false), vars: paletteVars(p) }));
}

function save(a: Appearance, at: number) {
  const stamped = { ...a, updatedAt: new Date(at).toISOString() };
  appearanceStore.set(stamped);
  writeCssCache(stamped);
}

/**
 * Apply a new look site-wide and remember the old one for Undo.
 * `coalesce` merges rapid edits of one control (a hue drag) into one step.
 */
export function commitAppearance(next: Appearance, opts: { coalesce?: string } = {}): boolean {
  const prev = appearanceStore.get();
  const normalized = normalizeAppearance(next);
  if (lookKey(prev) === lookKey(normalized)) return false;
  const now = Date.now();
  const merge = Boolean(opts.coalesce) && opts.coalesce === lastKey && now - lastAt < 1500;
  lastKey = opts.coalesce ?? null;
  lastAt = now;
  if (!merge) setHistory([...history, prev].slice(-20));
  save(normalized, now);
  return true;
}

/** Edit the latest stored look (not a possibly stale render snapshot). */
export function editAppearance(mutate: (current: Appearance) => Appearance, opts: { coalesce?: string } = {}): boolean {
  return commitAppearance(mutate(appearanceStore.get()), opts);
}

export function undoAppearance(): boolean {
  if (!history.length) return false;
  const prev = history[history.length - 1];
  setHistory(history.slice(0, -1));
  lastKey = null;
  save(prev, Date.now());
  return true;
}

// The visitor's look: persisted in this browser, applied to the whole site,
// with an in-memory undo history (this tab only). Signed in to the app, it
// also follows the account (lib/neuropal/lookSync.ts), with the rules below.
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  paletteVars,
  resolvePalette,
  skinAttributes,
  type Appearance,
} from "./appearance";
import { APPEARANCE_CSS_KEY, APPEARANCE_KEY } from "./keys";
import { createStoredValue, readRaw, writeRaw } from "./store";

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

// ---- the look and the server ---------------------------------------------------
// One look object per account (docs/PLATFORM-PLAN.md §3.2), last write wins by
// `updatedAt`. The web edits the skin and its colours and Pal's name, talk
// style, voice and "points you to people"; only the apps arrange Home and
// build Pal's shape, colour and face.

const WEB_PAL_FIELDS = new Set(["name", "talk", "voice", "people"]);
const sameValue = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/** The same look, whenever and wherever it was saved. */
export function sameLookContent(a: Appearance, b: Appearance): boolean {
  return sameValue({ ...normalizeAppearance(a), updatedAt: null }, { ...normalizeAppearance(b), updatedAt: null });
}

/**
 * The copy of this browser's look to save on the server (the app's sync and
 * the studio's Save). Without `base`: this browser's choices, with what only
 * the apps edit taken from the server's copy. With `base` (the copy last
 * seen on the server): each part from whichever side changed it since, so a
 * change made on the phone meanwhile isn't overwritten. `force` stamps it
 * now, newer than whatever the server holds.
 */
export function lookForServer(
  local: Appearance,
  remote: Appearance | null,
  base: Appearance | null = null,
  opts: { force?: boolean } = {},
): Appearance {
  const updatedAt = opts.force || !local.updatedAt ? new Date().toISOString() : local.updatedAt;
  if (!remote) return normalizeAppearance({ ...local, updatedAt });
  const pick = <T>(ours: T, theirs: T, was: T | undefined, webEdits: boolean): T =>
    base ? (sameValue(ours, was) ? theirs : ours) : webEdits ? ours : theirs;
  const pal: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(local.pal), ...Object.keys(remote.pal)])) {
    pal[k] = pick(local.pal[k], remote.pal[k], base?.pal[k], WEB_PAL_FIELDS.has(k));
  }
  return normalizeAppearance({
    skin: pick(local.skin, remote.skin, base?.skin, true),
    classic: pick(local.classic, remote.classic, base?.classic, true),
    signal: pick(local.signal, remote.signal, base?.signal, true),
    suggestLooks: pick(local.suggestLooks, remote.suggestLooks, base?.suggestLooks, true),
    pal,
    home: pick(local.home, remote.home, base?.home, false),
    updatedAt,
  });
}

/** Take the server's copy as it is: its own edit time, and not an Undo step. */
export function adoptAppearance(a: Appearance) {
  const next = normalizeAppearance(a);
  lastKey = null;
  appearanceStore.set(next);
  writeCssCache(next);
}

/**
 * The account's session ended here. The look stays as this device's, but
 * unclaimed: Pal's settings and the Home layout go back to the defaults, the
 * edit time goes (so the next account's own look wins over it), and Undo
 * forgets the steps.
 */
export function releaseLook() {
  setHistory(EMPTY);
  lastKey = null;
  if (readRaw("local", APPEARANCE_KEY) === null) return;
  const a = appearanceStore.get();
  appearanceStore.set(normalizeAppearance({ ...a, pal: DEFAULT_APPEARANCE.pal, home: DEFAULT_APPEARANCE.home, updatedAt: null }));
}

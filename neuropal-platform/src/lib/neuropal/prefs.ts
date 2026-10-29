// On-device app preferences (not part of the synced look): how the reader
// reads and looks, and the keyboard shortcuts. Settings edits them; the
// reader reads them. Owned by the shell/Settings work; add fields freely,
// don't rename.
import { createStoredValue, useStored } from "@/lib/store";
import { CLASSIC_THEMES, SIGNAL_BASES } from "@/lib/tokens/index.js";

export type ReaderBackground = "theme" | "paper" | "sepia" | "dusk" | "night";

/** Library order: last read first, newest added first, or by title. */
export type LibrarySort = "recent" | "newest" | "title";

export interface AppPrefs {
  /** SpeechSynthesisVoice.voiceURI; null = the browser's default voice for the language. */
  voiceURI: string | null;
  /** Read-aloud speed in words per minute (mapped onto utterance.rate by `rateForWpm`). */
  wordsPerMinute: number;
  /** 0.5–2 (utterance.pitch). */
  pitch: number;
  /** CSS font-family for reading; null = the skin's body font. See READER_FONTS. */
  readerFont: string | null;
  /** px */
  readerFontSize: number;
  /** unitless line-height */
  readerLineHeight: number;
  readerBackground: ReaderBackground;
  /** Keep the spoken word in view while reading aloud. */
  followAlong: boolean;
  /** Single-key shortcuts (g h, c, ?, and the reader's Space / arrows). Off for anyone they get in the way of (WCAG 2.1.4). */
  shortcuts: boolean;
  /** How the Library lists documents. */
  librarySort: LibrarySort;
  /** Reader: the chapters panel open where it docks beside the text (wide screens). */
  readerChaptersOpen: boolean;
}

export const DEFAULT_PREFS: AppPrefs = {
  voiceURI: null,
  wordsPerMinute: 180,
  pitch: 1,
  readerFont: null,
  readerFontSize: 20,
  readerLineHeight: 1.7,
  readerBackground: "theme",
  followAlong: true,
  shortcuts: true,
  librarySort: "recent",
  readerChaptersOpen: true,
};

const clamp = (n: unknown, lo: number, hi: number, d: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;

export function normalizePrefs(input: unknown): AppPrefs {
  const o = (input && typeof input === "object" ? input : {}) as Partial<AppPrefs>;
  const bgs: ReaderBackground[] = ["theme", "paper", "sepia", "dusk", "night"];
  const sorts: LibrarySort[] = ["recent", "newest", "title"];
  return {
    voiceURI: typeof o.voiceURI === "string" ? o.voiceURI : null,
    wordsPerMinute: clamp(o.wordsPerMinute, 80, 450, DEFAULT_PREFS.wordsPerMinute),
    pitch: clamp(o.pitch, 0.5, 2, DEFAULT_PREFS.pitch),
    readerFont: typeof o.readerFont === "string" && o.readerFont ? o.readerFont : null,
    readerFontSize: clamp(o.readerFontSize, 14, 40, DEFAULT_PREFS.readerFontSize),
    readerLineHeight: clamp(o.readerLineHeight, 1.2, 2.4, DEFAULT_PREFS.readerLineHeight),
    readerBackground: bgs.includes(o.readerBackground as ReaderBackground) ? (o.readerBackground as ReaderBackground) : "theme",
    followAlong: typeof o.followAlong === "boolean" ? o.followAlong : true,
    shortcuts: typeof o.shortcuts === "boolean" ? o.shortcuts : true,
    librarySort: sorts.includes(o.librarySort as LibrarySort) ? (o.librarySort as LibrarySort) : DEFAULT_PREFS.librarySort,
    readerChaptersOpen: typeof o.readerChaptersOpen === "boolean" ? o.readerChaptersOpen : DEFAULT_PREFS.readerChaptersOpen,
  };
}

export const prefsStore = createStoredValue<AppPrefs>({
  key: "np.app.prefs.v1",
  area: "local",
  fallback: DEFAULT_PREFS,
  parse: (raw) => normalizePrefs(JSON.parse(raw)),
});

export const usePrefs = () => useStored(prefsStore);

export function setPrefs(patch: Partial<AppPrefs>) {
  prefsStore.set(normalizePrefs({ ...prefsStore.get(), ...patch }));
}

// ---- speech ------------------------------------------------------------------

/** Words per minute a voice speaks at utterance.rate = 1 (typical for system voices). */
export const WPM_AT_RATE_1 = 180;

/** utterance.rate for a words-per-minute setting (the reader and Settings' "Hear it" share it). */
export function rateForWpm(wpm: number): number {
  const r = (Number.isFinite(wpm) ? wpm : DEFAULT_PREFS.wordsPerMinute) / WPM_AT_RATE_1;
  return Math.min(3, Math.max(0.45, Math.round(r * 100) / 100));
}

// ---- reading look --------------------------------------------------------------

export interface ReaderFontOption {
  id: string;
  label: string;
  /** CSS font-family, or null for the skin's body font. */
  family: string | null;
  /** Only offered when the font is installed on this device. */
  local?: boolean;
}

// The web fonts the site already loads (next/font variables on <html>), plus
// system families. OpenDyslexic isn't bundled: it is offered when installed.
export const READER_FONTS: ReaderFontOption[] = [
  { id: "skin", label: "Skin default", family: null },
  { id: "atkinson", label: "Atkinson Hyperlegible", family: 'var(--font-atkinson-next), "Atkinson Hyperlegible Next", system-ui, sans-serif' },
  { id: "inter", label: "Inter", family: 'var(--font-inter), "Inter", system-ui, sans-serif' },
  { id: "serif", label: "Serif", family: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
  { id: "mono", label: "Hyperlegible Mono", family: 'var(--font-atkinson-mono), "Atkinson Hyperlegible Mono", ui-monospace, monospace' },
  { id: "dyslexic", label: "OpenDyslexic", family: '"OpenDyslexic", "OpenDyslexic3", "Open Dyslexic", sans-serif', local: true },
];

export interface ReaderSurface {
  background: string;
  color: string;
  /** Secondary text (page numbers, captions). */
  muted: string;
}

// Reading backgrounds come from token values (Classic themes, a Signal base),
// so every pair already reads at AA or better. "theme" = the skin's surface.
const surface = (t: { surface: string; onSurface: string; onSurfaceVariant: string }): ReaderSurface => ({
  background: t.surface,
  color: t.onSurface,
  muted: t.onSurfaceVariant,
});

export const READER_SURFACES: Record<Exclude<ReaderBackground, "theme">, ReaderSurface> = {
  paper: surface(CLASSIC_THEMES.light),
  sepia: surface(CLASSIC_THEMES.sepia),
  dusk: surface(SIGNAL_BASES.Warm),
  night: { background: CLASSIC_THEMES.dark.surfaceLowest, color: CLASSIC_THEMES.dark.onSurface, muted: CLASSIC_THEMES.dark.onSurfaceVariant },
};

export const READER_BACKGROUND_LABELS: Record<ReaderBackground, string> = {
  theme: "Match the skin",
  paper: "Paper",
  sepia: "Sepia",
  dusk: "Dusk",
  night: "Night",
};

/** Colours for a reading background, or null for the skin's own surface. */
export function readerSurface(bg: ReaderBackground): ReaderSurface | null {
  return bg === "theme" ? null : READER_SURFACES[bg];
}

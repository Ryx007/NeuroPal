// On-device app preferences (not part of the synced look): how the reader
// reads and looks. Settings edits them; the reader reads them.
// Owned by the shell/Settings work; add fields freely, don't rename.
import { createStoredValue, useStored } from "@/lib/store";

export type ReaderBackground = "theme" | "paper" | "sepia" | "dusk" | "night";

export interface AppPrefs {
  /** SpeechSynthesisVoice.voiceURI; null = the browser's default voice for the language. */
  voiceURI: string | null;
  /** Read-aloud speed in words per minute (mapped onto utterance.rate). */
  wordsPerMinute: number;
  /** 0.5–2 (utterance.pitch). */
  pitch: number;
  /** CSS font-family for reading; null = the skin's body font. */
  readerFont: string | null;
  /** px */
  readerFontSize: number;
  /** unitless line-height */
  readerLineHeight: number;
  readerBackground: ReaderBackground;
  /** Keep the spoken word in view while reading aloud. */
  followAlong: boolean;
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
};

const clamp = (n: unknown, lo: number, hi: number, d: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;

export function normalizePrefs(input: unknown): AppPrefs {
  const o = (input && typeof input === "object" ? input : {}) as Partial<AppPrefs>;
  const bgs: ReaderBackground[] = ["theme", "paper", "sepia", "dusk", "night"];
  return {
    voiceURI: typeof o.voiceURI === "string" ? o.voiceURI : null,
    wordsPerMinute: clamp(o.wordsPerMinute, 80, 450, DEFAULT_PREFS.wordsPerMinute),
    pitch: clamp(o.pitch, 0.5, 2, DEFAULT_PREFS.pitch),
    readerFont: typeof o.readerFont === "string" && o.readerFont ? o.readerFont : null,
    readerFontSize: clamp(o.readerFontSize, 14, 40, DEFAULT_PREFS.readerFontSize),
    readerLineHeight: clamp(o.readerLineHeight, 1.2, 2.4, DEFAULT_PREFS.readerLineHeight),
    readerBackground: bgs.includes(o.readerBackground as ReaderBackground) ? (o.readerBackground as ReaderBackground) : "theme",
    followAlong: typeof o.followAlong === "boolean" ? o.followAlong : true,
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

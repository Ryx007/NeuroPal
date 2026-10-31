// Typed doors into the generated token package (src/lib/tokens, plain JS) for
// the parts the app screens use: Pal's look and voice lines, and the Home
// layout. Values and rules stay in the tokens; this file only adds types.
import * as Tokens from "@/lib/tokens/index.js";

export type PalShape = "Pebble" | "Bean" | "Box" | "Moon";
export type TalkStyle = "Gentle" | "Direct" | "Nerdy";

export interface PalLook {
  name: string;
  shape: PalShape | string;
  colour: string;
  eyes: string;
  mouth: string;
  extra: string;
  talk: TalkStyle | string;
  voice: string;
  people: boolean;
}

export type PalMood = "okay" | "off" | "over";

export type HomeTileId = "state" | "anchor" | "focus" | "mvd" | "reading" | "pal";
export type TileSize = "S" | "M" | "L";

export interface HomeTile {
  id: HomeTileId;
  size: TileSize;
  hidden: boolean;
}

const T = Tokens as unknown as {
  normalizePal(input: unknown): PalLook;
  palLine(pal: unknown, task?: string): string;
  palSay(pal: unknown, key: string, vars?: Record<string, string | number>): string;
  palFaceInk(bodyHex: string): string;
  palVisor(bodyHex: string, accentHex: string): string;
  palDescription(pal: unknown): string;
  effectiveTiles(home: unknown, date?: Date): HomeTile[];
  homeForSkin(home: unknown, skin: string): unknown;
  PAL_OPTIONS: {
    shape: Record<string, string>;
    colour: Record<string, string>;
    eyes: string[];
    mouth: string[];
    extra: string[];
    talk: Record<string, string>;
    voice: Record<string, [number, number]>;
  };
  HOME_TILES: Record<HomeTileId, { name: string; short: string }>;
};

export const PAL_OPTIONS = T.PAL_OPTIONS;
export const HOME_TILES = T.HOME_TILES;
export const TALK_STYLES = Object.keys(T.PAL_OPTIONS.talk) as TalkStyle[];

export const normalizePal = (input: unknown): PalLook => T.normalizePal(input);
/** The talk-style nudge ("No rush. Want to try two minutes on {task}?"). */
export const palLine = (pal: unknown, task?: string): string => T.palLine(pal, task);
/** One of Pal's assistant lines in the user's talk style (falls back to Gentle). */
export const palSay = (pal: unknown, key: string, vars?: Record<string, string | number>): string => T.palSay(pal, key, vars);
export const palFaceInk = (bodyHex: string): string => T.palFaceInk(bodyHex);
export const palVisor = (bodyHex: string, accentHex: string): string => T.palVisor(bodyHex, accentHex);
export const palDescription = (pal: unknown): string => T.palDescription(pal);

/** The tiles Home shows today, in order (the skin's default until arranged; day rules applied). */
export function homeTiles(home: unknown, skin: string, date: Date): HomeTile[] {
  return T.effectiveTiles(T.homeForSkin(home, skin), date);
}

/** The voice preset's [rate, pitch] for Pal's spoken lines. */
export function palVoice(pal: PalLook): { rate: number; pitch: number } {
  const v = T.PAL_OPTIONS.voice[pal.voice] ?? T.PAL_OPTIONS.voice.Soft ?? [1, 1];
  return { rate: v[0], pitch: v[1] };
}

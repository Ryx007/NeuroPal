"use client";
// The browser's speech voices (speechSynthesis), as a store: the list often
// arrives a moment after load ("voiceschanged"). Plus a tiny "say this" for
// samples. The reader owns real read-aloud; this only previews settings.
import { useSyncExternalStore } from "react";

export interface VoiceOption {
  uri: string;
  name: string;
  lang: string;
  isDefault: boolean;
  local: boolean;
}

const EMPTY: VoiceOption[] = [];
let cache: { key: string; list: VoiceOption[] } = { key: "", list: EMPTY };

export function speechAvailable(): boolean {
  try {
    return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
  } catch {
    return false;
  }
}

function readVoices(): VoiceOption[] {
  if (!speechAvailable()) return EMPTY;
  const raw = window.speechSynthesis.getVoices();
  const key = raw.map((v) => v.voiceURI).join("|");
  if (key !== cache.key) {
    cache = {
      key,
      list: raw.map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, isDefault: v.default, local: v.localService })),
    };
  }
  return cache.list;
}

const voicesStore = {
  subscribe(l: () => void) {
    if (!speechAvailable()) return () => {};
    window.speechSynthesis.addEventListener("voiceschanged", l);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", l);
  },
  get: readVoices,
  getServer: () => EMPTY,
};

export function useVoices(): VoiceOption[] {
  return useSyncExternalStore(voicesStore.subscribe, voicesStore.get, voicesStore.getServer);
}

/** Speak a short sample. Resolves when it ends (or fails); returns false without speech. */
export function speakSample(text: string, opts: { voiceURI: string | null; rate: number; pitch: number; onEnd?: () => void }): boolean {
  if (!speechAvailable()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new window.SpeechSynthesisUtterance(text);
  const voice = opts.voiceURI ? synth.getVoices().find((v) => v.voiceURI === opts.voiceURI) : undefined;
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  u.rate = opts.rate;
  u.pitch = opts.pitch;
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  synth.speak(u);
  return true;
}

export function stopSpeaking() {
  if (speechAvailable()) window.speechSynthesis.cancel();
}

/** Is a font installed on this device? (Compares text widths against fallbacks.) */
export function fontInstalled(family: string): boolean {
  try {
    const c = document.createElement("canvas").getContext("2d");
    if (!c) return false;
    const sample = "mmmmmmmmmmlliWWQ@#0";
    return ["monospace", "serif", "sans-serif"].some((fallback) => {
      c.font = `72px ${fallback}`;
      const base = c.measureText(sample).width;
      c.font = `72px "${family}", ${fallback}`;
      return c.measureText(sample).width !== base;
    });
  } catch {
    return false;
  }
}

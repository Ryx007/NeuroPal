"use client";
// The browser's speech voices, as a React hook. Browsers fill the list late
// (Chrome after `voiceschanged`), so this subscribes instead of reading once.
import { useSyncExternalStore } from "react";
import { speechSupported } from "./tts";

const EMPTY: SpeechSynthesisVoice[] = [];
let cache: SpeechSynthesisVoice[] = EMPTY;
const listeners = new Set<() => void>();

function read(): SpeechSynthesisVoice[] {
  try {
    return window.speechSynthesis.getVoices() ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function refresh() {
  const next = read();
  const same = next.length === cache.length && next.every((v, i) => v.voiceURI === cache[i]?.voiceURI);
  if (same) return;
  cache = next.length ? next : EMPTY;
  listeners.forEach((l) => l());
}

const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1 && speechSupported()) {
      window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
      refresh();
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && speechSupported()) window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
    };
  },
  get: () => cache,
  getServer: () => EMPTY,
};

export function useVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

const GOOD = /natural|neural|online|enhanced|premium|siri|google/i;

/** Voices for a language first (better-sounding ones on top), then the rest. */
export function groupVoices(voices: SpeechSynthesisVoice[], lang: string) {
  const base = (lang || "en").toLowerCase().split("-")[0];
  const score = (v: SpeechSynthesisVoice) => (GOOD.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  const sort = (list: SpeechSynthesisVoice[]) => [...list].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  const matching = sort(voices.filter((v) => (v.lang || "").toLowerCase().split("-")[0] === base));
  const others = sort(voices.filter((v) => (v.lang || "").toLowerCase().split("-")[0] !== base));
  return { matching, others };
}

export function voiceLabel(v: SpeechSynthesisVoice): string {
  const where = v.localService ? "" : " · online";
  return `${v.name}${v.lang ? ` (${v.lang})` : ""}${where}`;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type {
  AccentChoice,
  Density,
  ReaderFont,
  ReaderLayout,
  ThemeChoice,
  TweaksState,
  Voice,
} from "@/models/types";

interface TweaksStore extends TweaksState {
  setTheme: (v: ThemeChoice) => void;
  setAccent: (v: AccentChoice) => void;
  setReaderFont: (v: ReaderFont) => void;
  setReaderLayout: (v: ReaderLayout) => void;
  setDensity: (v: Density) => void;
  setFontSize: (v: number) => void;
  setLineSpacing: (v: number) => void;
  setWpm: (v: number) => void;
  setVoice: (v: Voice) => void;
}

export const useTweaks = create<TweaksStore>()(
  persist(
    (set) => ({
      theme: "dark",
      accent: "blue",
      readerFont: "inter",
      readerLayout: "split",
      density: "calm",
      fontSize: 20,
      lineSpacing: 1.7,
      wpm: 225,
      voice: "soft",
      setTheme: (v) => set({ theme: v }),
      setAccent: (v) => set({ accent: v }),
      setReaderFont: (v) => set({ readerFont: v }),
      setReaderLayout: (v) => set({ readerLayout: v }),
      setDensity: (v) => set({ density: v }),
      setFontSize: (v) => set({ fontSize: v }),
      setLineSpacing: (v) => set({ lineSpacing: v }),
      setWpm: (v) => set({ wpm: v }),
      setVoice: (v) => set({ voice: v }),
    }),
    {
      name: "np.tweaks.v1",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

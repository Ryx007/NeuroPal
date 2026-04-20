import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import {
  MockAnchors,
  MockDocuments,
  MockMvd,
  MockSeedChat,
} from "@/data/mock";
import type {
  ChatMessage,
  MvdTask,
  NervousState,
  NpDocument,
  OnboardingAnswers,
} from "@/models/types";

// ---------------- Onboarding -----------------------------------------------

interface OnboardingStore {
  conditions: string[];
  energyPattern?: "morning" | "night" | "variable";
  primaryUse?: "reading" | "regulation" | "both";
  completed: boolean;
  toggleCondition: (id: string) => void;
  setEnergy: (v: OnboardingAnswers["energyPattern"]) => void;
  setPrimaryUse: (v: OnboardingAnswers["primaryUse"]) => void;
  complete: () => void;
}

export const useOnboarding = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      conditions: [],
      energyPattern: undefined,
      primaryUse: undefined,
      completed: false,
      toggleCondition: (id) => {
        const list = get().conditions;
        set({
          conditions: list.includes(id)
            ? list.filter((x) => x !== id)
            : [...list, id],
        });
      },
      setEnergy: (v) => set({ energyPattern: v }),
      setPrimaryUse: (v) => set({ primaryUse: v }),
      complete: () => set({ completed: true }),
    }),
    {
      name: "np.onboarding.v1",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ---------------- Nervous system state -------------------------------------

interface NervousStore {
  state?: NervousState;
  set: (s: NervousState) => void;
  clear: () => void;
}

export const useNervousState = create<NervousStore>((set) => ({
  state: undefined,
  set: (s) => set({ state: s }),
  clear: () => set({ state: undefined }),
}));

// ---------------- MVD ------------------------------------------------------

interface MvdStore {
  tasks: MvdTask[];
  toggle: (id: string) => void;
  remaining: () => number;
}

export const useMvd = create<MvdStore>((set, get) => ({
  tasks: MockMvd(),
  toggle: (id) => {
    set({
      tasks: get().tasks.map((t) =>
        t.id === id ? { ...t, done: !t.done } : t
      ),
    });
  },
  remaining: () => get().tasks.filter((t) => !t.done).length,
}));

// ---------------- Documents ------------------------------------------------

interface DocumentsStore {
  docs: NpDocument[];
  add: (d: NpDocument) => void;
  findById: (id?: string) => NpDocument;
}

export const useDocuments = create<DocumentsStore>((set, get) => ({
  docs: MockDocuments,
  add: (d) => set({ docs: [d, ...get().docs] }),
  findById: (id) => {
    const { docs } = get();
    return docs.find((d) => d.id === id) ?? docs[0];
  },
}));

// ---------------- Anchors --------------------------------------------------

export const useAnchors = create<{ anchors: typeof MockAnchors }>(() => ({
  anchors: MockAnchors,
}));

// ---------------- Reader chat (stub RAG response) --------------------------

interface ReaderChatStore {
  messages: ChatMessage[];
  ask: (args: { paragraphId: string; question: string }) => void;
}

export const useReaderChat = create<ReaderChatStore>((set, get) => ({
  messages: MockSeedChat,
  ask: ({ paragraphId, question }) => {
    const msg: ChatMessage = {
      id: `c-${Date.now()}`,
      paragraphId,
      question,
      answer:
        "Pending Claude API call. When the RAG pipeline is wired up this answer will be grounded in the surrounding chunks and return source page references.",
      citations: [],
      at: new Date(),
    };
    set({ messages: [...get().messages, msg] });
  },
}));

// ---------------- Reader playback (karaoke TTS) ----------------------------

interface ReaderPlaybackStore {
  playing: boolean;
  wordIndex: number;
  totalWords: number;
  progress: () => number;
  setTotalWords: (n: number) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  setWord: (i: number) => void;
  advance: () => void;
}

export const useReaderPlayback = create<ReaderPlaybackStore>((set, get) => ({
  playing: false,
  wordIndex: 0,
  totalWords: 0,
  progress: () => {
    const { wordIndex, totalWords } = get();
    return totalWords === 0 ? 0 : wordIndex / totalWords;
  },
  setTotalWords: (n) => set({ totalWords: n }),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  reset: () => set({ playing: false, wordIndex: 0 }),
  setWord: (i) => set({ wordIndex: i }),
  advance: () => {
    const { wordIndex, totalWords } = get();
    if (wordIndex + 1 >= totalWords) {
      set({ playing: false });
      return;
    }
    set({ wordIndex: wordIndex + 1 });
  },
}));

import type { Interest, Level } from "@/content/interference";
import { LEARN_PREFS_KEY } from "./keys";
import { createStoredValue } from "./store";

// Per-visitor lesson preferences, remembered in this browser only.
export interface LearnPrefs {
  level: Level;
  interest: Interest;
}

const LEVEL_IDS: Level[] = ["simple", "standard", "technical"];
const INTEREST_IDS: Interest[] = ["music", "games", "cooking"];

export const DEFAULT_LEARN_PREFS: LearnPrefs = { level: "simple", interest: "music" };

export const learnPrefsStore = createStoredValue<LearnPrefs>({
  key: LEARN_PREFS_KEY,
  area: "local",
  fallback: DEFAULT_LEARN_PREFS,
  parse: (raw) => {
    const o = JSON.parse(raw) as Partial<LearnPrefs> | null;
    return {
      level: o && LEVEL_IDS.includes(o.level as Level) ? (o.level as Level) : DEFAULT_LEARN_PREFS.level,
      interest: o && INTEREST_IDS.includes(o.interest as Interest) ? (o.interest as Interest) : DEFAULT_LEARN_PREFS.interest,
    };
  },
});

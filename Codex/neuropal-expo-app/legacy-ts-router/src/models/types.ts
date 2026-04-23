/**
 * Domain models for the NeuroPal MVP.
 *
 * These map 1:1 to the eventual Supabase tables in the App Development
 * Plan (Phase 1.1 / 3). Everything here is pure TypeScript so the same
 * shapes can be reused from a Supabase client or an offline store.
 */

export type DocumentType = "pdf" | "epub" | "docx" | "txt" | "arxiv";
export type AnchorStatus = "done" | "current" | "pending";
export type NervousState = "green" | "yellow" | "red";

export interface NpDocument {
  id: string;
  title: string;
  /** authors / journal / source */
  subtitle: string;
  type: DocumentType;
  /** 0..1 */
  progress: number;
  pageCount: number;
  lastOpened?: Date;
  sections?: DocumentSection[];
}

export interface DocumentSection {
  id: string;
  heading: string;
  paragraphs: string[];
}

export interface TimeOfDayLite {
  hour: number;
  minute: number;
}

export interface Anchor {
  id: string;
  title: string;
  subtitle: string;
  time: TimeOfDayLite;
  status: AnchorStatus;
  /** MaterialIcons name */
  icon: string;
}

export interface MvdTask {
  id: string;
  title: string;
  subtitle: string;
  done: boolean;
}

export interface ChatMessage {
  id: string;
  /** which paragraph the answer anchors to */
  paragraphId: string;
  question: string;
  answer: string;
  citations: string[];
  at: Date;
}

export const formatTime12 = (t: TimeOfDayLite): string => {
  const h = t.hour % 12 === 0 ? 12 : t.hour % 12;
  const m = t.minute.toString().padStart(2, "0");
  const suffix = t.hour >= 12 ? "PM" : "AM";
  return `${h}:${m} ${suffix}`;
};

// ---- Tweak surface ---------------------------------------------------------

export type ThemeChoice = "dark" | "sepia" | "light" | "contrast";
export type AccentChoice = "blue" | "cyan" | "purple" | "green";
export type ReaderFont =
  | "inter"
  | "atkinson"
  | "dyslexic"
  | "lora"
  | "fraunces";
export type ReaderLayout = "split" | "focus" | "paginated";
export type Density = "calm" | "dense";
export type Voice = "soft" | "natural" | "deep";

export interface TweaksState {
  theme: ThemeChoice;
  accent: AccentChoice;
  readerFont: ReaderFont;
  readerLayout: ReaderLayout;
  density: Density;
  fontSize: number;
  lineSpacing: number;
  wpm: number;
  voice: Voice;
}

// ---- Onboarding -----------------------------------------------------------

export interface OnboardingAnswers {
  conditions: Set<string>;
  energyPattern?: "morning" | "night" | "variable";
  primaryUse?: "reading" | "regulation" | "both";
  completed: boolean;
}

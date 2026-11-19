// Pal as an assistant — the local brain of the Pal page (a port of the Expo
// app's services/palAssistant.js). Pure functions only (no React, no store,
// no network), so every basic works offline:
//   suggestionsFor()   "What now?": ONE next step for this moment, with a reason
//   localBreakdown()   "Break it down" without the server (template steps)
//   cleanSteps()       the same rules for steps that come from the server
//   looksLikeCrisis()  the safety net for "Talk" (crisis.ts; also server-side)
//   chatContext()      what POST /api/pal/chat gets to know
// Copy is short, kind and plain; Pal never diagnoses.
import { CRISIS_REPLY, looksLikeCrisis } from "./crisis";
import { hhmm, minutesUntil, type Anchor, type DayTask, type NervousState } from "./day";
import { normalizePal, palLine, palSay, type PalLook, type PalMood } from "./look";
import { docId, type NPDocument, type PalChatContext } from "./types";

export { CRISIS_REPLY, looksLikeCrisis };

export const SIT_LENGTHS = [10, 25, 45];
/** "Within 30 min" (the anchor rule) and how early Pal calls time before it. */
export const ANCHOR_WINDOW_MIN = 30;
const ANCHOR_LEAD_MIN = 5;

export type PalTool = "now" | "breakdown" | "dump" | "sit" | "talk";

// ---- time ---------------------------------------------------------------------

/** "night" = 22:00–05:59: no new deep work, wind down instead. */
export function partOfDay(date: Date): "night" | "morning" | "afternoon" | "evening" {
  const h = date.getHours();
  if (h < 6 || h >= 22) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

/** The first not-done anchor starting within the next `windowMin` minutes. */
export function upcomingAnchor(anchors: Anchor[], now: Date, windowMin = ANCHOR_WINDOW_MIN): { anchor: Anchor; minutes: number } | null {
  const sorted = anchors
    .filter((a) => a.status !== "done")
    .map((a) => ({ anchor: a, minutes: minutesUntil(a, now) }))
    .filter((x) => x.minutes >= 0 && x.minutes <= windowMin)
    .sort((x, y) => x.minutes - y.minutes);
  return sorted[0] ?? null;
}

/** The reading item to suggest: the most recently read unfinished document. */
export function unfinishedReading(docs: NPDocument[]): NPDocument | null {
  const list = docs.filter((d) => {
    const p = Number(d.readingProgress ?? 0);
    return docId(d) && p > 0 && p < 1;
  });
  if (!list.length) return null;
  const at = (d: NPDocument) => Date.parse(d.lastReadAt || "") || 0;
  return list.reduce((a, b) => (at(b) > at(a) ? b : a));
}

/** The document to resume on Home: the most recently read one (unfinished first). */
export function resumeDocument(docs: NPDocument[]): NPDocument | null {
  const unfinished = unfinishedReading(docs);
  if (unfinished) return unfinished;
  const read = docs.filter((d) => d.lastReadAt && docId(d));
  if (!read.length) return null;
  return read.reduce((a, b) => ((Date.parse(b.lastReadAt || "") || 0) > (Date.parse(a.lastReadAt || "") || 0) ? b : a));
}

// Long titles are cut at a word, never mid-word.
export function shorten(s: string, n = 42): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > n * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
}

const quoted = (s: string) => `“${shorten(s)}”`;

// ---- "What now?" ------------------------------------------------------------------

export type SuggestionAction =
  | { type: "calm" }
  | { type: "open"; tool: "dump" | "breakdown" }
  | { type: "ack" }
  | { type: "sit"; minutes: number; label: string; taskId?: string; anchorId?: string }
  | { type: "read"; docId: string; minutes: number; label: string };

export interface Suggestion {
  id: string;
  title: string;
  why: string;
  action: SuggestionAction;
}

export interface SuggestionInput {
  state: NervousState | null;
  now: Date;
  anchors: Anchor[];
  tasks: DayTask[];
  reading: NPDocument | null;
  pal: PalLook;
}

/** The candidate next steps for this moment, best first. The page shows one; "Something else" moves on. */
export function suggestionsFor({ state, now, anchors, tasks, reading, pal }: SuggestionInput): Suggestion[] {
  const p = normalizePal(pal);
  const open = tasks.filter((t) => !t.done && t.title.trim());
  const night = partOfDay(now) === "night";
  const out: Suggestion[] = [];
  const add = (s: Suggestion) => {
    if (!out.some((x) => x.id === s.id)) out.push(s);
  };

  const water: Suggestion = {
    id: "water",
    title: "Get a glass of water",
    why: "Small and physical helps when your head is loud.",
    action: { type: "ack" },
  };
  const dump: Suggestion = {
    id: "dump",
    title: night ? "Write down tomorrow’s first step, then stop" : "Empty your head for two minutes",
    why: night ? "It’s late. Nothing big tonight; tomorrow can start from here." : "Getting thoughts out makes room to pick one.",
    action: { type: "open", tool: "dump" },
  };
  // A bit off: the talk-style "two minutes on …" line; the sit runs up to 10
  // minutes and can end any time.
  const smallStep = (t: DayTask, why: string): Suggestion => ({
    id: `task:${t.id}`,
    title: palLine(p, quoted(t.title)),
    why,
    action: { type: "sit", minutes: 10, label: t.title.trim(), taskId: t.id },
  });

  if (state === "red") {
    add({
      id: "calm",
      title: "Take a 2-minute reset",
      why: "You said you’re overwhelmed. Body first; everything else can wait.",
      action: { type: "calm" },
    });
    add(water);
    add({ id: "sit-quiet", title: "Sit with me for 10 minutes", why: "No task. Just quiet company.", action: { type: "sit", minutes: 10, label: "" } });
    return out;
  }

  if (state === "yellow") {
    if (night) add({ ...dump, why: "It’s late and you’re a bit off. Rest counts as a step." });
    open.forEach((t, i) =>
      add(smallStep(t, i === 0 ? "You’re a bit off, so the next thing on today’s list. Two minutes counts." : "Another small one from today’s list.")),
    );
    if (!open.length) {
      add({
        id: "smallest",
        title: "Pick the smallest thing you can do",
        why: "Today’s list is done. If you want more, keep it tiny.",
        action: { type: "open", tool: "breakdown" },
      });
    }
    add(water);
    add(dump);
    return out;
  }

  // green, or not checked in yet (treated as okay; the panel offers a check-in)
  const soon = upcomingAnchor(anchors, now);
  if (soon) {
    const { anchor, minutes } = soon;
    const at = hhmm(anchor.time);
    if (minutes <= ANCHOR_LEAD_MIN + 2) {
      add({
        id: `anchor:${anchor.id}`,
        title: `Get ready for ${quoted(anchor.title)}`,
        why: minutes <= 0 ? `It’s at ${at}, right about now.` : `It starts in ${minutes} min, at ${at}.`,
        action: { type: "ack" },
      });
    } else {
      const sit = Math.min(25, minutes - ANCHOR_LEAD_MIN);
      add({
        id: `anchor:${anchor.id}`,
        title: `One small thing before ${quoted(anchor.title)}`,
        why: `It starts in ${minutes} min, so nothing big. I’ll call time ${ANCHOR_LEAD_MIN} min before.`,
        action: { type: "sit", minutes: sit, label: `Before ${anchor.title.trim()}`, anchorId: anchor.id },
      });
    }
  }
  if (night) add(dump);
  if (reading) {
    const pct = Math.round(Number(reading.readingProgress ?? 0) * 100);
    add({
      id: `read:${docId(reading)}`,
      title: palSay(p, "focus", { task: quoted(reading.title) }),
      why: `A good window for focus. You left off at ${pct}%.`,
      action: { type: "read", docId: docId(reading), minutes: 25, label: `Reading ${reading.title.trim()}` },
    });
  }
  open.forEach((t, i) =>
    add({
      id: `task:${t.id}`,
      title: palSay(p, "focus", { task: quoted(t.title) }),
      why: i === 0 && !reading ? "A good window for focus. Stop whenever it’s done." : "Next on today’s list. Stop whenever it’s done.",
      action: { type: "sit", minutes: 25, label: t.title.trim(), taskId: t.id },
    }),
  );
  add(dump);
  if (!open.length && !reading) {
    add({
      id: "smallest",
      title: "Pick one small thing for today",
      why: "Nothing is waiting. Break something down, or rest.",
      action: { type: "open", tool: "breakdown" },
    });
  }
  add(water);
  return out;
}

/** The greeting under Pal's name. */
export function helloFor(pal: PalLook, state: NervousState | null): string {
  const key = state === "red" ? "helloOver" : state === "yellow" ? "helloOff" : state === "green" ? "helloOkay" : "helloUnset";
  return palSay(pal, key);
}

/** The check-in → Pal's face. */
export function moodFor(state: NervousState | null): PalMood {
  return state === "red" ? "over" : state === "yellow" ? "off" : "okay";
}

// ---- "Break it down" ------------------------------------------------------------------

export const STEP_MAX_WORDS = 12;
export const STEPS_MIN = 3;
export const STEPS_MAX = 7;
export const TASK_MAX_CHARS = 500;
export const MESSAGE_MAX_CHARS = 1000;

const words = (s: string) => String(s).trim().split(/\s+/).filter(Boolean);
// A step cut at 12 words must not end on a dangling "and" / "the".
const DANGLING = /\s+(?:and|or|but|the|a|an|to|of|with|for|about|that|which|then|so)$/i;

/** Server or template steps → 3–7 clean steps of ≤ 12 words (null if fewer than 3 survive). */
export function cleanSteps(raw: unknown): string[] | null {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const o = item as { text?: unknown; step?: unknown; title?: unknown } | null;
    const value = typeof item === "string" ? item : o && typeof o === "object" ? o.text || o.step || o.title || "" : "";
    let s = String(value)
      .replace(/\s+/g, " ")
      .replace(/^\s*(?:step\s*)?(?:\d+|[a-z])[.):\]-]\s+/i, "")
      .replace(/^\s*[-*•·–—]+\s*/, "")
      .trim();
    if (!s) continue;
    const w = words(s);
    if (w.length > STEP_MAX_WORDS) {
      s = w.slice(0, STEP_MAX_WORDS).join(" ").replace(/[,;:–—-]+$/, "");
      while (DANGLING.test(s)) s = s.replace(DANGLING, "");
    }
    s = s.charAt(0).toUpperCase() + s.slice(1);
    const key = s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length === STEPS_MAX) break;
  }
  return out.length >= STEPS_MIN ? out : null;
}

// Checked in order, verbs first: "read the paper" is reading, "write the paper"
// is writing. Ambiguous nouns alone ("the paper") get the generic one.
const TEMPLATES: { match: RegExp; steps: string[] }[] = [
  {
    match: /\b(write|writing|draft|drafting|essay|report|thesis|blog|cv|cover letter|summari[sz]e)\b/i,
    steps: [
      "Open the document",
      "Write one messy sentence, any sentence",
      "List three points you want to make",
      "Write the first point, badly is fine",
      "Take a two-minute break",
      "Write the next point",
      "Read it once and fix one thing",
    ],
  },
  {
    match: /\b(read|reading|study|studying|revise|revision|review|learn|lecture|lectures|textbook|exam|exams)\b/i,
    steps: [
      "Open the reading at your page",
      "Read only the headings first",
      "Read one section, nothing more",
      "Write one line about what it said",
      "Stretch for a minute",
      "Read the next section",
    ],
  },
  {
    match: /\b(email|e-mail|mail|message|reply|text|letter|dm)\b/i,
    steps: ["Open the message", "Write one sentence saying what you need", "Add one sentence of detail", "Read it once", "Send it as it is"],
  },
  {
    match: /\b(call|phone|ring)\b/i,
    steps: ["Find the number", "Write one line about why you’re calling", "Pick a quiet spot", "Press call", "Say your line, then listen"],
  },
  {
    match: /\b(clean|cleaning|tidy|dishes|laundry|wash|washing|room|desk|kitchen|vacuum|hoover|bathroom)\b/i,
    steps: [
      "Put on something to listen to",
      "Pick up five things and put them away",
      "Clear one surface",
      "Take the rubbish out",
      "Do five more minutes, then stop",
    ],
  },
  {
    match: /\b(apply|application|form|forms|tax|taxes|bill|bills|paperwork|admin|insurance|bank|appointment)\b/i,
    steps: [
      "Open the form or website",
      "Find the first box you can fill",
      "Fill in only the easy parts",
      "Write down what you’re missing",
      "Save it, even if it isn’t finished",
    ],
  },
  {
    match: /\b(cook|cooking|dinner|lunch|breakfast|meal|food|groceries|shopping|shop)\b/i,
    steps: [
      "Get out one pan or one bag",
      "Pick the simplest option you have",
      "Get the ingredients or the list ready",
      "Do the first step of the recipe",
      "Tidy one thing while you wait",
    ],
  },
];

const GENERIC = [
  "Get out what you need for it",
  "Do the first tiny part for two minutes",
  "Decide the next small piece",
  "Do that piece",
  "Check: done, or one more piece?",
];

/** Offline steps for any task: a template picked by keywords, else a start-small sequence. */
export function localBreakdown(task: string): string[] {
  const hit = TEMPLATES.find((x) => x.match.test(String(task || "")));
  return cleanSteps(hit ? hit.steps : GENERIC) || GENERIC.slice();
}

/** Why the steps on screen are Pal's offline ones (said under the list). */
export const OFFLINE_STEPS_NOTE = {
  offline: "No server right now, so these are Pal’s offline steps.",
  limited: "Pal has done a lot of thinking for now, so these are offline steps.",
  error: "The server didn’t answer well, so these are offline steps.",
  quick: "Quick steps, made in this browser.",
} as const;

export type OfflineReason = keyof typeof OFFLINE_STEPS_NOTE;

// ---- "Talk" -----------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Chat context for POST /api/pal/chat — only what helps a short reply. */
export function chatContext({ state, now, anchors, tasks, pal }: { state: NervousState | null; now: Date; anchors: Anchor[]; tasks: DayTask[]; pal: PalLook }): PalChatContext {
  const p = normalizePal(pal);
  const pending = anchors
    .filter((a) => a.status !== "done")
    .map((a) => ({ a, m: minutesUntil(a, now) }))
    .filter((x) => x.m >= 0)
    .sort((x, y) => x.m - y.m)[0];
  return {
    state: state === "green" || state === "yellow" || state === "red" ? state : null,
    localTime: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    nextAnchor: pending ? { title: pending.a.title.slice(0, 80), at: hhmm(pending.a.time), inMinutes: pending.m } : null,
    minimumDay: tasks
      .filter((t) => !t.done)
      .map((t) => t.title.slice(0, 80))
      .filter(Boolean)
      .slice(0, 8),
    palName: p.name,
    talkStyle: p.talk,
    people: p.people,
  };
}

// ---- "Sit with me" -------------------------------------------------------------------------

/** "12 min left" (minutes, not ticking seconds: calm). */
export function leftLabel(endsAt: number, now: number): string {
  const ms = endsAt - now;
  if (ms <= 0) return "time’s up";
  if (ms < 60000) return "under a minute left";
  return `${Math.ceil(ms / 60000)} min left`;
}

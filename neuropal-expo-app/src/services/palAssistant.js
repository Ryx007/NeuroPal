// Pal as an assistant — the local brain of the buddy sheet. Pure functions
// only (no React, no store, no network), so every basic works offline:
//   suggestionsFor()  "What now?": ONE next step for this moment, with a reason
//   localBreakdown()  "Break it down" without the server (template steps)
//   cleanSteps()      the same rules for steps that come from the server
//   looksLikeCrisis() deterministic safety net for "Talk" (also server-side)
// Copy is short, kind and plain; Pal never diagnoses (docs/HANDOFF.md §9).

import { normalizePal, palLine, palSay } from "../theme/tokens";

export const SIT_LENGTHS = [10, 25, 45];
// "Within 30 min" (the anchor rule) and how early Pal calls time before it.
export const ANCHOR_WINDOW_MIN = 30;
const ANCHOR_LEAD_MIN = 5;

const pad2 = (n) => String(n).padStart(2, "0");
export const clockOf = (time) => `${pad2(time.hour)}:${pad2(time.minute)}`;

// "night" = 22:00–05:59: no new deep work, wind down instead.
export function partOfDay(date = new Date()) {
  const h = date.getHours();
  if (h < 6 || h >= 22) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export function minutesUntil(anchor, now = new Date()) {
  return anchor.time.hour * 60 + anchor.time.minute - (now.getHours() * 60 + now.getMinutes());
}

// The first not-done anchor starting within the next `windowMin` minutes.
export function upcomingAnchor(anchors, now = new Date(), windowMin = ANCHOR_WINDOW_MIN) {
  const list = (Array.isArray(anchors) ? anchors : []).filter((a) => a && a.time && a.status !== "done");
  const sorted = list
    .map((a) => ({ a, m: minutesUntil(a, now) }))
    .filter((x) => x.m >= 0 && x.m <= windowMin)
    .sort((x, y) => x.m - y.m);
  return sorted.length ? { anchor: sorted[0].a, minutes: sorted[0].m } : null;
}

// The reading item to suggest: the most recently read unfinished document.
export function unfinishedReading(docs) {
  const list = (Array.isArray(docs) ? docs : []).filter((d) => {
    const p = Number(d?.readingProgress ?? d?.progress ?? 0);
    return d && d.id && p > 0 && p < 1;
  });
  if (!list.length) return null;
  const at = (d) => Date.parse(d.lastReadAt || d.lastOpened || "") || 0;
  return list.reduce((a, b) => (at(b) > at(a) ? b : a));
}

// Long titles are cut at a word, never mid-word.
const shorten = (s, n = 42) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > n * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
};
const quoted = (s) => `“${shorten(s)}”`;

// ---- "What now?" ------------------------------------------------------------
// Returns the candidate next steps for this moment, best first. The sheet
// shows one; "Something else" moves to the next. Each has:
//   { id, title, why, action }
// action.type: 'calm' (calming steps screen) | 'sit' (body doubling, minutes,
// label, taskId?) | 'read' (open the reader + a focus block) | 'open' (another
// panel of the sheet) | 'ack' (a plain "go for it").
export function suggestionsFor({ state, now = new Date(), anchors = [], tasks = [], reading = null, pal } = {}) {
  const p = normalizePal(pal);
  const open = (Array.isArray(tasks) ? tasks : []).filter((t) => t && !t.done && String(t.title || "").trim());
  const night = partOfDay(now) === "night";
  const out = [];
  const add = (s) => {
    if (!out.some((x) => x.id === s.id)) out.push(s);
  };

  const water = {
    id: "water",
    title: "Get a glass of water",
    why: "Small and physical helps when your head is loud.",
    action: { type: "ack" },
  };
  const dump = {
    id: "dump",
    title: night ? "Write down tomorrow’s first step, then stop" : "Empty your head for two minutes",
    why: night ? "It’s late. Nothing big tonight; tomorrow can start from here." : "Getting thoughts out makes room to pick one.",
    action: { type: "open", section: "dump" },
  };
  // A bit off: the talk-style "two minutes on …" line; the sit runs up to 10
  // minutes and can end any time.
  const smallStep = (t, why) => ({
    id: `task:${t.id}`,
    title: palLine(p, quoted(t.title)),
    why,
    action: { type: "sit", minutes: 10, label: String(t.title).trim(), taskId: t.id },
  });

  if (state === "red") {
    add({
      id: "calm",
      title: "Take a 2-minute reset",
      why: "You said you’re overwhelmed. Body first; everything else can wait.",
      action: { type: "calm" },
    });
    add(water);
    add({
      id: "sit-quiet",
      title: "Sit with me for 10 minutes",
      why: "No task. Just quiet company.",
      action: { type: "sit", minutes: 10, label: "" },
    });
    return out;
  }

  if (state === "yellow") {
    if (night) {
      add({ ...dump, why: "It’s late and you’re a bit off. Rest counts as a step." });
    }
    open.forEach((t, i) =>
      add(
        smallStep(
          t,
          i === 0 ? "You’re a bit off, so the next thing on today’s list. Two minutes counts." : "Another small one from today’s list."
        )
      )
    );
    if (!open.length) {
      add({
        id: "smallest",
        title: "Pick the smallest thing you can do",
        why: "Today’s list is done. If you want more, keep it tiny.",
        action: { type: "open", section: "breakdown" },
      });
    }
    add(water);
    add(dump);
    return out;
  }

  // green, or not checked in yet (treated as okay; the panel offers a
  // check-in above the suggestion)
  const soon = upcomingAnchor(anchors, now);
  if (soon) {
    const { anchor, minutes } = soon;
    const at = clockOf(anchor.time);
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
        action: { type: "sit", minutes: sit, label: `Before ${String(anchor.title).trim()}`, anchorId: anchor.id },
      });
    }
  }
  if (night) add(dump);
  if (reading) {
    const pct = Math.round(Number(reading.readingProgress ?? reading.progress ?? 0) * 100);
    add({
      id: `read:${reading.id}`,
      title: palSay(p, "focus", { task: quoted(reading.title) }),
      why: `A good window for focus. You left off at ${pct}%.`,
      action: { type: "read", docId: reading.id, minutes: 25, label: `Reading ${String(reading.title).trim()}` },
    });
  }
  open.forEach((t, i) =>
    add({
      id: `task:${t.id}`,
      title: palSay(p, "focus", { task: quoted(t.title) }),
      why: i === 0 && !reading ? "A good window for focus. Stop whenever it’s done." : "Next on today’s list. Stop whenever it’s done.",
      action: { type: "sit", minutes: 25, label: String(t.title).trim(), taskId: t.id },
    })
  );
  add(dump);
  if (!open.length && !reading) {
    add({
      id: "smallest",
      title: "Pick one small thing for today",
      why: "Nothing is waiting. Break something down, or rest.",
      action: { type: "open", section: "breakdown" },
    });
  }
  add(water);
  return out;
}

// The greeting under Pal's name in the sheet header.
export function helloFor(pal, state) {
  const key = state === "red" ? "helloOver" : state === "yellow" ? "helloOff" : state === "green" ? "helloOkay" : "helloUnset";
  return palSay(pal, key);
}

// home.nervousState → Pal's face.
export function moodFor(state) {
  return state === "red" ? "over" : state === "yellow" ? "off" : "okay";
}

// ---- "Break it down" --------------------------------------------------------
export const STEP_MAX_WORDS = 12;
export const STEPS_MIN = 3;
export const STEPS_MAX = 7;
export const TASK_MAX_CHARS = 500;

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);
// A step cut at 12 words must not end on a dangling "and" / "the".
const DANGLING = /\s+(?:and|or|but|the|a|an|to|of|with|for|about|that|which|then|so)$/i;

// Server or template steps → 3–7 clean steps of ≤ 12 words (null if fewer
// than 3 survive). Strips numbering/bullets, trailing filler, duplicates.
export function cleanSteps(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const text = typeof item === "string" ? item : item && typeof item === "object" ? item.text || item.step || item.title || "" : "";
    let s = String(text)
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

// Checked in order, verbs first: "read the paper" is reading, "write the
// paper" is writing. Ambiguous nouns alone ("the paper") get the generic one.
const TEMPLATES = [
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
    steps: [
      "Open the message",
      "Write one sentence saying what you need",
      "Add one sentence of detail",
      "Read it once",
      "Send it as it is",
    ],
  },
  {
    match: /\b(call|phone|ring)\b/i,
    steps: [
      "Find the number",
      "Write one line about why you’re calling",
      "Pick a quiet spot",
      "Press call",
      "Say your line, then listen",
    ],
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

// Offline steps for any task: a template picked by keywords, else a generic
// start-small sequence. Always 3–7 steps of ≤ 12 words; step one takes less
// than two minutes.
export function localBreakdown(task) {
  const t = String(task || "");
  const hit = TEMPLATES.find((x) => x.match.test(t));
  return cleanSteps(hit ? hit.steps : GENERIC) || GENERIC.slice();
}

// ---- "Talk" safety net -------------------------------------------------------
// Keep in sync with neuropal-backend/src/routes/pal.js (CRISIS). A match is
// answered with CRISIS_REPLY and the calming-steps button, never the model.
// English plus the languages the app's people write in (Italian, Spanish,
// French, German, romanised Hindi/Bengali). A safety net, not a clinical
// test: it can miss things, and the app says so.
const CRISIS =
  /\b(suicid\w*|suizid\w*|kill(?:ing)? my ?self|(?<![\d.,]\s?)kms|end(?:ing)? (?:it all|my life|myself)|(?:want(?:ed)?|going|gonna|plan(?:ning)?|ready) to end it|take my (?:own )?life|want(?:ed)? to die|wish i (?:was|were) dead|better off (?:dead|without me)|no reason to (?:live|go on)|don'?t want to (?:live|be alive|exist|be here|wake up)|(?:nobody|no one|no-one) would (?:miss|care about|notice) me|can'?t go on|hang(?:ing)? my ?self|jump(?:ing)? (?:off|from) (?:a|the|this|my) (?:bridge|building|roof|cliff|balcony|tower)|(?:took|take|taking|swallow(?:ed|ing)?) (?:all|a bunch|too many|the whole (?:bottle|pack|box)) (?:of )?(?:my |the |those )?(?:pills|meds|tablets)|self[- ]?harm\w*|hurt(?:ing)? my ?self|cut(?:ting)? my ?self|overdos\w*|uccider(?:mi|si)|ammazzarmi|farla finita|voglio morire|vorrei morire|togliermi la vita|farmi del male|non voglio (?:pi[uù] )?vivere|quiero morir(?:me)?|matarme|quitarme la vida|je veux mourir|me tuer|en finir avec (?:la vie|tout)|ich will (?:nicht mehr leben|sterben)|mich umbringen|khudkushi|aa?tm(?:a|o)?h(?:a|o)tya|marna chaht[ai]|mar jaa?na chaht[ai]|more jete chai)\b/i;

// Normalised exactly like the server (pal.js): runs of whitespace — tabs,
// newlines, non-breaking spaces — become one space, so "kill  myself" or a
// pasted NBSP can't slip past the pattern.
export function looksLikeCrisis(text) {
  return CRISIS.test(String(text || "").replace(/\s+/g, " ").trim().replace(/[’‘]/g, "'"));
}

export const CRISIS_REPLY =
  "I’m really glad you told me. I can’t help with this on my own, and you deserve real support right now. If you might act on these thoughts or you’re in danger, call your local emergency number now, or go to someone you trust. The calming steps in the app are one tap away.";

// Chat context for POST /api/pal/chat — only what helps a short reply.
export function chatContext({ state, now = new Date(), anchors = [], tasks = [], pal } = {}) {
  const p = normalizePal(pal);
  const pending = (Array.isArray(anchors) ? anchors : [])
    .filter((a) => a && a.time && a.status !== "done")
    .map((a) => ({ a, m: minutesUntil(a, now) }))
    .filter((x) => x.m >= 0)
    .sort((x, y) => x.m - y.m)[0];
  return {
    state: state === "green" || state === "yellow" || state === "red" ? state : null,
    localTime: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    nextAnchor: pending ? { title: String(pending.a.title).slice(0, 80), at: clockOf(pending.a.time), inMinutes: pending.m } : null,
    minimumDay: (Array.isArray(tasks) ? tasks : [])
      .filter((t) => t && !t.done)
      .map((t) => String(t.title || "").slice(0, 80))
      .filter(Boolean)
      .slice(0, 8),
    palName: p.name,
    talkStyle: p.talk,
    people: p.people,
  };
}

// The quiz the server writes: Markdown with numbered questions, each tagged
// **[easy]** / **[medium]** / **[hard]** and followed by an "**Answer:**"
// line (neuropal-backend/src/routes/study.js asks for exactly that). Models
// drift from it, so this reads the common variants and gives up (null) when
// the text doesn't hold the shape; the quiz is then shown as it came.
// Pure (no imports): scripts/qa/web-study.mjs loads it directly.

export interface QuizItem {
  n: number;
  /** easy / medium / hard, when the model tagged it. */
  level: string | null;
  /** Markdown. */
  question: string;
  /** Markdown. */
  answer: string;
}

export interface ParsedQuiz {
  /** Anything before the first question ("Here are ten questions…"). */
  intro: string;
  items: QuizItem[];
}

// Every pattern is anchored or bounded and has no nested repeats: model text can be long and odd.
const LEVEL_TAG = /[[(](easy|medium|hard)[\])]/i;
const QUESTION_HEAD = /^(?:(?:question|q)\s*(\d{1,2})\s*[.):]?|(\d{1,2})\s*[.):])/i;
const ANSWER_HEAD = /^(?:answer|ans\.?|a(?=\s*[:：]))\s*(?:\*\*|__|\*|_)?\s*[:：.]/i;
const INLINE_ANSWER = /(?:\*\*|__)\s*answer\s*[:：]?\s*(?:\*\*|__)\s*[:：]?|\banswer\s*[:：]/i;

const escapeRe = (s: string) => s.replace(/[*_]/g, (c) => `\\${c}`);

/** A line without its block marks (heading #, quote >, list bullet) and the emphasis it opens with. */
function bare(line: string): { text: string; wrap: string } {
  let s = line
    .trimStart()
    .replace(/^(?:#{1,6}\s+|>\s?)/, "")
    .replace(/^[-*+]\s+(?=\S)/, "");
  let wrap = "";
  const m = /^(\*\*|__|\*|_)(?=\S)/.exec(s);
  if (m) {
    wrap = m[1];
    s = s.slice(wrap.length);
  }
  return { text: s, wrap };
}

function questionNumber(line: string): number | null {
  const m = QUESTION_HEAD.exec(bare(line).text);
  if (!m) return null;
  return Number(m[1] ?? m[2]);
}

function answerRest(line: string): string | null {
  const b = bare(line);
  const m = ANSWER_HEAD.exec(b.text);
  if (!m) return null;
  let rest = b.text.slice(m[0].length);
  // "**Answer:** …" — the emphasis that opened before "Answer" closes right after it.
  if (b.wrap) rest = rest.replace(new RegExp(`^\\s*${escapeRe(b.wrap)}`), "");
  return rest.trim();
}

function questionText(line: string): { text: string; level: string | null } {
  const b = bare(line);
  let s = b.text.replace(QUESTION_HEAD, "");
  let wrap = b.wrap;
  const closer = new RegExp(`^\\s*${escapeRe(wrap || "**")}`);
  if (wrap && closer.test(s)) {
    // "**1.** What…": the emphasis only held the number.
    s = s.replace(closer, "");
    wrap = "";
  }
  let level: string | null = null;
  const tag = LEVEL_TAG.exec(s);
  if (tag) {
    level = tag[1].toLowerCase();
    let start = tag.index;
    let end = tag.index + tag[0].length;
    // The tag's own emphasis ("**[easy]**") and a dash or colon after it go too.
    while (start > 0 && /[*_]/.test(s[start - 1])) start -= 1;
    while (end < s.length && /[*_]/.test(s[end])) end += 1;
    while (end < s.length && /[\s:–—-]/.test(s[end])) end += 1;
    s = `${s.slice(0, start)} ${s.slice(end)}`;
  }
  s = s.replace(/\s+/g, " ").trim();
  if (wrap) s = s.replace(new RegExp(`\\s*${escapeRe(wrap)}$`), "");
  // A bold run the tag cut in half: drop the stray marker.
  if ((s.match(/\*\*/g) ?? []).length % 2 === 1) s = s.replace(/\*\*(?=[^*]*$)/, "");
  return { text: s.trim(), level };
}

/**
 * The quiz as questions with their answers, or null when the text doesn't
 * hold that shape. Numbers inside an answer ("1. … 2. …" steps) don't start
 * questions: when the questions carry level tags only tagged lines do, and
 * otherwise only the next number in sequence.
 */
export function parseQuiz(markdown: string): ParsedQuiz | null {
  const lines = String(markdown ?? "")
    .slice(0, 60000)
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const tagged = lines.filter((l) => questionNumber(l) !== null && LEVEL_TAG.test(l)).length;
  const byTag = tagged >= 2;
  const intro: string[] = [];
  const drafts: { n: number; level: string | null; q: string[]; a: string[] | null }[] = [];

  for (const line of lines) {
    const n = questionNumber(line);
    const cur = drafts[drafts.length - 1];
    if (n !== null && (byTag ? LEVEL_TAG.test(line) : !cur || n === cur.n + 1)) {
      const { text, level } = questionText(line);
      const split = INLINE_ANSWER.exec(text);
      if (split && split.index > 0) {
        drafts.push({ n, level, q: [text.slice(0, split.index).trim()], a: [text.slice(split.index + split[0].length).trim()] });
      } else {
        drafts.push({ n, level, q: [text], a: null });
      }
      continue;
    }
    if (!cur) {
      intro.push(line);
      continue;
    }
    if (cur.a === null) {
      const rest = answerRest(line);
      if (rest !== null) cur.a = [rest];
      else cur.q.push(line);
    } else cur.a.push(line);
  }

  const items: QuizItem[] = drafts.map((d) => ({
    n: d.n,
    level: d.level,
    question: d.q.join("\n").trim(),
    answer: (d.a ?? []).join("\n").trim(),
  }));
  const answered = items.filter((i) => i.answer && i.question).length;
  if (items.length === 0 || answered < Math.ceil(items.length / 2)) return null;
  return { intro: intro.join("\n").trim(), items: items.filter((i) => i.question) };
}

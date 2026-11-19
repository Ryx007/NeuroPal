// The reader's model of a document: chapters, display paragraphs, and ONE
// flat word stream that the highlight, read-aloud, resume point and Ask
// citations all share.
//
// Built from GET /documents/:id/text exactly the way the Expo app builds it
// (store/slices/readerSlice.js textToSections + ReaderScreen's word memo),
// so a word index means the same word on the phone and on the web:
//   - canonical paragraphs = text.split(/\n{2,}/), trimmed, empties dropped
//     (the server's toc/pageMap index this list);
//   - real chapters from `toc` when ≥ 2 anchors hold, else detected headings,
//     else "Part N of M" groups of 40 paragraphs;
//   - paragraphs over 180 words split into display pieces (never inside $…$).
// Differences are display-only: chapters are not cut into "(cont. N)" parts
// (the web shows the whole document), and a chapter's own heading paragraph
// is drawn as its heading instead of twice.
import type { DocumentText, TocEntry } from "../types";
import { blockMathOf, isUnicodeMathParagraph, splitParagraphMathSafe, tokenizeMathParagraph } from "./math";

const MAX_PARAGRAPH_WORDS = 180;
const SECTION_PARAGRAPHS = 40;
const MIN_CHAPTER_PARAGRAPHS = 5;

export type ParagraphKind = "text" | "math" | "umath";

export interface ReaderParagraph {
  /** Display index (global). */
  index: number;
  text: string;
  /** Index in the server's canonical paragraph list. */
  canonical: number;
  section: number;
  /** Word range [start, end). */
  start: number;
  end: number;
  kind: ParagraphKind;
  latex: string | null;
  /** Drawn as its chapter's heading (it is the heading line itself). */
  asHeading: boolean;
}

export interface ReaderSection {
  index: number;
  title: string;
  /** "Part 3 of 9", or the document title of an unstructured document. */
  synthetic: boolean;
  /** Display paragraph range [first, last). */
  first: number;
  last: number;
  /** Word range [start, end). */
  start: number;
  end: number;
  /** The first paragraph is the heading line (TOC documents). */
  headingInText: boolean;
}

export interface ReaderModel {
  title: string;
  sections: ReaderSection[];
  paragraphs: ReaderParagraph[];
  /** What is shown per word. */
  words: string[];
  /** What the voice says per word ("" = silent). */
  speech: string[];
  /** Display paragraph per word. */
  paraOf: Int32Array;
  /** First word of each display paragraph. */
  paraStarts: Int32Array;
  /** 1 where a word ends a sentence. */
  sentenceEnd: Uint8Array;
  /** Real page starts: display paragraph index → page number. */
  pageStarts: Map<number, number>;
  /** pageMap in display paragraph terms, ascending. */
  pageAnchors: { page: number; paragraph: number }[];
  pageCount: number;
  totalWords: number;
}

interface Raw {
  text: string;
  origin: number;
}

interface Chapter {
  title: string;
  synthetic: boolean;
  paras: Raw[];
}

function isHeadingParagraph(p: string): boolean {
  if (p.length > 70 || /[.!?,;]$/.test(p)) return false;
  return (
    /^(chapter|part|appendix|preface|introduction|bibliography|epilogue|prologue)\b/i.test(p) ||
    /^\d{1,2}\.?\s+[A-Z]/.test(p) ||
    (/^[A-Z]/.test(p) && p === p.toUpperCase() && /[A-Z]{3}/.test(p))
  );
}

function expand(paras: Raw[]): Raw[] {
  const out: Raw[] = [];
  for (const p of paras) {
    const n = p.text.split(" ").length;
    if (n <= MAX_PARAGRAPH_WORDS || blockMathOf(p.text)) out.push(p);
    else for (const piece of splitParagraphMathSafe(p.text, MAX_PARAGRAPH_WORDS)) out.push({ text: piece, origin: p.origin });
  }
  return out;
}

/** Real chapters from the server's toc (null when the anchors don't hold). */
function chaptersFromToc(rough: Raw[], toc: TocEntry[], pageCount: number, pageMap: DocumentText["pageMap"], title: string): Chapter[] | null {
  const paragraphForPage = (page: number): number | null => {
    if (!Array.isArray(pageMap) || pageMap.length === 0) return null;
    let hit: number | null = null;
    for (const e of pageMap) {
      if (e.page <= page) hit = e.startParagraph;
      else break;
    }
    return hit;
  };
  const raw = toc.map((entry, i) => {
    let exact: number | null =
      typeof entry.startParagraph === "number" && entry.startParagraph >= 0 ? Math.min(entry.startParagraph, rough.length - 1) : null;
    if (exact === null && entry.startPage) {
      const mapped = paragraphForPage(entry.startPage);
      if (mapped !== null) exact = Math.min(mapped, rough.length - 1);
    }
    const est =
      exact === null && entry.startPage && pageCount > 0
        ? Math.min(rough.length - 1, Math.round(((entry.startPage - 1) / pageCount) * rough.length))
        : null;
    return { title: entry.title || `Chapter ${i + 1}`, exact, est };
  });

  const anchors: { idx: number; title: string }[] = [];
  raw.forEach((a, i) => {
    let idx = a.exact;
    if (idx === null && a.est !== null) {
      let lo = -1;
      for (let j = i - 1; j >= 0; j--) {
        const e = raw[j].exact;
        if (e !== null) {
          lo = e;
          break;
        }
      }
      let hi = rough.length;
      for (let j = i + 1; j < raw.length; j++) {
        const e = raw[j].exact;
        if (e !== null) {
          hi = e;
          break;
        }
      }
      idx = Math.max(lo + 1, Math.min(a.est, hi - 1));
    }
    if (idx === null) return;
    if (anchors.length > 0 && idx <= anchors[anchors.length - 1].idx) return;
    anchors.push({ idx, title: a.title });
  });
  if (anchors.length < 2) return null;

  const chapters: Chapter[] = [];
  if (anchors[0].idx > 0) chapters.push({ title: title || "Front matter", synthetic: !title, paras: rough.slice(0, anchors[0].idx) });
  anchors.forEach((a, i) => {
    const end = anchors[i + 1]?.idx ?? rough.length;
    chapters.push({ title: a.title, synthetic: false, paras: rough.slice(a.idx, end) });
  });
  return chapters.filter((c) => c.paras.length > 0).length >= 2 ? chapters.filter((c) => c.paras.length > 0) : null;
}

/** Detected headings, else fixed-size parts (documents without a toc). */
function syntheticChapters(rough: Raw[], title: string): Chapter[] {
  type Ch = { heading: Raw | null; paras: Raw[] };
  const chapters: Ch[] = [];
  let current: Ch = { heading: null, paras: [] };
  for (const p of rough) {
    if (isHeadingParagraph(p.text) && current.paras.length > 0) {
      chapters.push(current);
      current = { heading: p, paras: [] };
      continue;
    }
    if (isHeadingParagraph(p.text) && !current.heading && current.paras.length === 0) {
      current.heading = p;
      continue;
    }
    const n = p.text.split(" ").length;
    if (n <= MAX_PARAGRAPH_WORDS || blockMathOf(p.text)) current.paras.push(p);
    else for (const piece of splitParagraphMathSafe(p.text, MAX_PARAGRAPH_WORDS)) current.paras.push({ text: piece, origin: p.origin });
  }
  if (current.paras.length > 0 || current.heading) chapters.push(current);

  // Slivers (front-matter lines, contents fragments) merge into the chapter before.
  const merged: Ch[] = [];
  for (const ch of chapters) {
    const prev = merged[merged.length - 1];
    if (prev && ch.paras.length < MIN_CHAPTER_PARAGRAPHS) {
      if (ch.heading) prev.paras.push(ch.heading);
      prev.paras.push(...ch.paras);
    } else {
      merged.push({ heading: ch.heading, paras: [...ch.paras] });
    }
  }

  const totalParas = merged.reduce((n, c) => n + c.paras.length, 0);
  const structured = merged.length >= 3 && merged.length <= Math.max(6, totalParas / 15);
  if (structured) {
    // The heading lines are chapter titles here, not part of the text (as on the phone).
    return merged.map((ch) => ({
      title: ch.heading?.text || title || "Document",
      synthetic: !ch.heading,
      paras: ch.paras,
    }));
  }
  const paras = merged.flatMap((c) => (c.heading ? [c.heading, ...c.paras] : c.paras));
  const totalParts = Math.max(1, Math.ceil(paras.length / SECTION_PARAGRAPHS));
  const out: Chapter[] = [];
  for (let i = 0; i < paras.length; i += SECTION_PARAGRAPHS) {
    out.push({
      title: totalParts === 1 ? title || "Document" : `Part ${out.length + 1} of ${totalParts}`,
      synthetic: true,
      paras: paras.slice(i, i + SECTION_PARAGRAPHS),
    });
  }
  return out.length ? out : [{ title: title || "Document", synthetic: true, paras: [] }];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Does this paragraph read as the chapter's own heading line? (the server's rule) */
function isTitleLine(paragraph: string, title: string): boolean {
  const p = norm(paragraph);
  const t = norm(title);
  if (t.length < 3) return false;
  return p === t || (p.startsWith(t) && p.length <= t.length + 24);
}

// ---- sentences --------------------------------------------------------------

const ABBREVIATIONS = new Set([
  "e.g.", "i.e.", "etc.", "fig.", "figs.", "eq.", "eqs.", "ref.", "refs.", "al.", "dr.", "mr.", "mrs.", "ms.",
  "prof.", "vs.", "cf.", "approx.", "no.", "nos.", "vol.", "pp.", "p.", "sec.", "secs.", "ch.", "st.", "jr.",
  "sr.", "dept.", "univ.", "ed.", "eds.", "resp.", "viz.", "ca.", "tab.", "thm.", "lem.", "def.", "prop.",
]);

function endsSentence(word: string, next: string | undefined): boolean {
  if (!/[.!?…]["”’)\]]*$/.test(word)) return false;
  const bare = word.replace(/["”’)\]]+$/, "").toLowerCase();
  if (/[!?…]$/.test(bare)) return true;
  if (ABBREVIATIONS.has(bare.replace(/^["“‘(\[]+/, ""))) return false;
  if (/^[A-Za-z]\.$/.test(bare.replace(/^["“‘(\[]+/, ""))) return false; // an initial
  if (next && /^[a-z]/.test(next)) return false; // "approx. three"
  return true;
}

// ---- the model ----------------------------------------------------------------

export function buildReaderModel(data: Pick<DocumentText, "text" | "toc" | "pageMap" | "pageCount" | "title">): ReaderModel {
  const title = data.title || "";
  const rough: Raw[] = (data.text || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => ({ text: p.replace(/\s+/g, " ").trim(), origin: i }));
  const pageCount = data.pageCount || 0;
  const pageMap = Array.isArray(data.pageMap) ? data.pageMap : [];

  let chapters: Chapter[] | null = null;
  let fromToc = false;
  if (Array.isArray(data.toc) && data.toc.length >= 2 && rough.length > 0) {
    chapters = chaptersFromToc(rough, data.toc, pageCount, pageMap, title);
    fromToc = !!chapters;
    if (chapters) chapters = chapters.map((c) => ({ ...c, paras: expand(c.paras) }));
  }
  if (!chapters) chapters = syntheticChapters(rough, title);

  const sections: ReaderSection[] = [];
  const paragraphs: ReaderParagraph[] = [];
  const words: string[] = [];
  const speech: string[] = [];
  const paraIndexOfWord: number[] = [];

  chapters.forEach((ch, si) => {
    const first = paragraphs.length;
    const start = words.length;
    ch.paras.forEach((p, k) => {
      const pStart = words.length;
      const latex = blockMathOf(p.text);
      let kind: ParagraphKind = "text";
      if (latex || isUnicodeMathParagraph(p.text)) {
        kind = latex ? "math" : "umath";
        words.push("[equation]");
        speech.push("equation");
      } else {
        for (const tok of tokenizeMathParagraph(p.text)) {
          words.push(tok.display);
          speech.push(tok.latex ? "equation" : tok.display);
        }
      }
      const index = paragraphs.length;
      for (let w = pStart; w < words.length; w++) paraIndexOfWord.push(index);
      paragraphs.push({
        index,
        text: p.text,
        canonical: p.origin,
        section: si,
        start: pStart,
        end: words.length,
        kind,
        latex,
        asHeading: fromToc && k === 0 && kind === "text" && isTitleLine(p.text, ch.title),
      });
    });
    sections.push({
      index: si,
      title: ch.title,
      synthetic: ch.synthetic,
      first,
      last: paragraphs.length,
      start,
      end: words.length,
      headingInText: fromToc && paragraphs[first]?.asHeading === true,
    });
  });

  const total = words.length;
  const paraOf = Int32Array.from(paraIndexOfWord);
  const paraStarts = Int32Array.from(paragraphs.map((p) => p.start));
  const sentenceEnd = computeSentenceEnds(words, paraOf);

  // Real page anchors → the first display paragraph at/after each canonical start.
  const pageStarts = new Map<number, number>();
  const pageAnchors: { page: number; paragraph: number }[] = [];
  if (pageMap.length && paragraphs.length) {
    let cursor = 0;
    const sorted = [...pageMap].sort((a, b) => a.startParagraph - b.startParagraph || a.page - b.page);
    for (const e of sorted) {
      while (cursor < paragraphs.length && paragraphs[cursor].canonical < e.startParagraph) cursor++;
      if (cursor >= paragraphs.length) break;
      if (!pageStarts.has(cursor)) pageStarts.set(cursor, e.page);
      pageAnchors.push({ page: e.page, paragraph: cursor });
    }
  }

  return { title, sections, paragraphs, words, speech, paraOf, paraStarts, sentenceEnd, pageStarts, pageAnchors, pageCount, totalWords: total };
}

/** Sentence ends over any word stream (paragraph ends always end one). */
export function computeSentenceEnds(words: readonly string[], paraOf: Int32Array | readonly number[]): Uint8Array {
  const total = words.length;
  const out = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const lastOfParagraph = i === total - 1 || paraOf[i + 1] !== paraOf[i];
    if (lastOfParagraph) out[i] = 1;
    else if (words[i] !== "[equation]" && words[i] !== "[image]" && endsSentence(words[i], words[i + 1])) out[i] = 1;
  }
  return out;
}

/** What the paragraph and sentence helpers need of a stream. */
export type StreamShape = Pick<ReaderModel, "sentenceEnd" | "totalWords" | "paraOf" | "paraStarts">;

// ---- navigation helpers ---------------------------------------------------------

export function sentenceStartAt(model: Pick<ReaderModel, "sentenceEnd">, i: number): number {
  let s = Math.max(0, i);
  while (s > 0 && !model.sentenceEnd[s - 1]) s--;
  return s;
}

/** "Previous" like a media player: to the sentence start, or the one before if already there. */
export function previousSentence(model: Pick<ReaderModel, "sentenceEnd">, i: number): number {
  const s = sentenceStartAt(model, i);
  if (i - s >= 2 || s === 0) return s;
  return sentenceStartAt(model, s - 1);
}

export function nextSentence(model: Pick<ReaderModel, "sentenceEnd" | "totalWords">, i: number): number {
  let e = Math.max(0, i);
  while (e < model.totalWords - 1 && !model.sentenceEnd[e]) e++;
  return Math.min(model.totalWords - 1, e + 1);
}

export function sentenceRange(model: Pick<ReaderModel, "sentenceEnd" | "totalWords">, i: number): [number, number] {
  const s = sentenceStartAt(model, i);
  let e = Math.max(0, i);
  while (e < model.totalWords - 1 && !model.sentenceEnd[e]) e++;
  return [s, e + 1];
}

export function previousParagraphStart(model: StreamShape, i: number): number {
  if (!model.totalWords) return 0;
  const k = model.paraOf[Math.max(0, Math.min(i, model.totalWords - 1))];
  const start = model.paraStarts[k] ?? 0;
  if (i - start >= 2 || k === 0) return start;
  return model.paraStarts[k - 1] ?? 0;
}

export function nextParagraphStart(model: StreamShape, i: number): number {
  if (!model.totalWords) return 0;
  const k = model.paraOf[Math.max(0, Math.min(i, model.totalWords - 1))];
  const next = model.paraStarts[k + 1];
  return next !== undefined ? next : (model.paraStarts[k] ?? 0);
}

export function sectionOfWord(model: ReaderModel, i: number): number {
  const p = model.paragraphs[model.paraOf[Math.max(0, Math.min(i, model.totalWords - 1))]];
  return p ? p.section : 0;
}

/** The real page a display paragraph sits on (pageMap), or null. */
export function pageOfParagraph(model: ReaderModel, paragraph: number): number | null {
  let hit: number | null = null;
  for (const a of model.pageAnchors) {
    if (a.paragraph <= paragraph) hit = a.page;
    else break;
  }
  return hit;
}

/** First display paragraph of a real page (pageMap), or a proportional estimate. */
export function paragraphOfPage(model: ReaderModel, page: number): number {
  let hit: number | null = null;
  for (const a of model.pageAnchors) {
    if (a.page <= page) hit = a.paragraph;
    else break;
  }
  if (hit !== null) return hit;
  if (model.pageCount > 0 && model.paragraphs.length) {
    return Math.min(model.paragraphs.length - 1, Math.max(0, Math.floor(((page - 1) / model.pageCount) * model.paragraphs.length)));
  }
  return 0;
}

/** Words of one sentence, for the "where am I" announcement. */
export function sentenceText(model: Pick<ReaderModel, "sentenceEnd" | "totalWords" | "words">, i: number): string {
  const [s, e] = sentenceRange(model, i);
  return model.words
    .slice(s, Math.min(e, s + 60))
    .filter((w) => w !== "[image]")
    .join(" ");
}

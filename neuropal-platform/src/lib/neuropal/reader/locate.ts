// Finding a cited passage in the text: answers cite an excerpt (and maybe a
// page); the reader scrolls to the paragraph that holds it.

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export interface TextIndex {
  hay: string;
  /** Start offset of each paragraph in `hay`. */
  offsets: number[];
}

export function buildTextIndex(paragraphs: readonly string[]): TextIndex {
  const offsets: number[] = [];
  let hay = "";
  for (const p of paragraphs) {
    offsets.push(hay.length);
    hay += norm(p);
  }
  return { hay, offsets };
}

function paragraphAt(index: TextIndex, at: number): number {
  const o = index.offsets;
  let lo = 0;
  let hi = o.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (o[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The paragraph an excerpt starts in, or null when it can't be found. */
export function findExcerpt(index: TextIndex, excerpt: string | undefined | null): number | null {
  const needle = norm(String(excerpt || ""));
  if (needle.length < 12 || !index.hay) return null;
  const tries = [needle, needle.slice(0, 120), needle.slice(0, 64), needle.slice(0, 32)];
  // the middle of a long excerpt survives a garbled start
  if (needle.length > 60) tries.push(needle.slice(Math.floor(needle.length / 3), Math.floor(needle.length / 3) + 40));
  for (const t of tries) {
    if (t.length < 12) continue;
    const at = index.hay.indexOf(t);
    if (at >= 0) return paragraphAt(index, at);
  }
  return null;
}

/** Does this text contain the excerpt (for searching EPUB chapters)? */
export function textHasExcerpt(text: string, excerpt: string): boolean {
  const needle = norm(excerpt);
  if (needle.length < 12) return false;
  const hay = norm(text);
  return hay.includes(needle) || hay.includes(needle.slice(0, 64)) || hay.includes(needle.slice(0, 32));
}

export const normalizeForSearch = norm;

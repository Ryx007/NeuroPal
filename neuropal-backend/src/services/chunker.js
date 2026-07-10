// Paragraph-aware chunker.
//
//   • Split fullText on double newlines → raw paragraphs
//   • Merge small ones until target size (~2000 chars / ~500 tokens)
//   • Overlap ~200 chars with the previous chunk so cross-boundary facts
//     don't fall through the cracks at retrieval time
//   • Never split mid-sentence — when we have to cut, back up to the
//     nearest `.`, `!`, or `?`
//
// Return: [{ text, chunkIndex, pageEstimate, paragraphIndex, tokenEstimate }]

const TARGET_CHARS = 2000;
const OVERLAP_CHARS = 200;

// ---- math atomicity (P1) ---------------------------------------------------
// Equations arrive as $…$ / $$…$$ islands (arxiv-latex + nougat tiers). A
// split inside a pair breaks rendering AND retrieval, so every cut point —
// sentence boundaries, length cuts, overlap tails — must land outside them.

// Sorted, non-overlapping [start, end) spans of $$…$$ and $…$ in `text`.
// Inline pairing is Pandoc-style: the opening $ must not be followed by
// whitespace and the closing $ must not be preceded by it — a currency
// dollar ("$10 for compute") therefore can't consume a real equation's
// opener. Single newlines are allowed inside (hard-wrapped sources); blank
// lines are not.
function mathSpans(text) {
    const spans = [];
    const re = /\$\$[\s\S]*?\$\$|\$(?!\s)(?:[^$\n]|\n(?!\s*\n))*?(?<!\s)\$/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        spans.push([m.index, m.index + m[0].length]);
    }
    return spans;
}

function spanContaining(pos, spans) {
    for (const span of spans) {
        if (pos >= span[0] && pos < span[1]) return span;
        if (span[0] > pos) break; // sorted — no later span can contain pos
    }
    return null;
}

// Entirely ONE display-math block (allowing whitespace padding)? The body
// must not itself contain $$ — '$$eq$$ prose $$eq2$$' is NOT atomic and
// must go through normal splitting.
function isDisplayMathBlock(text) {
    return /^\$\$(?:(?!\$\$)[\s\S])+\$\$$/.test(text.trim());
}

// The RAG overlap tail, adjusted so it never starts mid-equation: if the
// natural cut lands inside a math span, start the tail at the span opening
// (whole equation included) unless that balloons the tail — then start
// after the span instead.
const MAX_TAIL_CHARS = 800;

function takeTailMathSafe(text, n) {
    if (!text) return '';
    if (text.length <= n) return text;
    let start = text.length - n;
    const span = spanContaining(start, mathSpans(text));
    if (span) {
        start = text.length - span[0] <= MAX_TAIL_CHARS ? span[0] : span[1];
    }
    return text.slice(start);
}

function chunkText(fullText) {
    if (!fullText || typeof fullText !== 'string') return [];

    // A $$ block whose BODY contains blank lines would be severed by the
    // paragraph split below into two halves each holding an unpaired $$ —
    // collapse internal blank lines first so display math stays one
    // paragraph (nougat output can carry these; LaTeX sources can't).
    const normalized = fullText.replace(/\$\$[\s\S]*?\$\$/g, (m) =>
        m.replace(/\n{2,}/g, '\n'),
    );
    const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) {
        return splitByLength(fullText, 0).map((piece, i) => buildChunk(piece, i, 0));
    }

    const out = [];
    let buf = '';
    let bufStartParaIdx = 0;
    let paragraphIdx = 0;

    const flush = () => {
        if (!buf) return;
        const idx = out.length;
        let text = buf;

        // Prepend overlap from the previous chunk for continuity (RAG
        // retrieval only) — record its length so readers can strip it and
        // reconstruct clean, duplicate-free text.
        let overlapChars = 0;
        if (idx > 0) {
            const prev = out[out.length - 1].text;
            const tail = takeTailMathSafe(prev, OVERLAP_CHARS);
            overlapChars = tail.length + 2; // + the joining \n\n
            text = `${tail}\n\n${text}`;
        }

        out.push(buildChunk(text, idx, bufStartParaIdx, overlapChars));
        buf = '';
    };

    for (const para of paragraphs) {
        if (!buf) bufStartParaIdx = paragraphIdx;

        // A display equation is atomic no matter how long it is — an
        // oversized chunk beats a broken one.
        if (para.length > TARGET_CHARS && isDisplayMathBlock(para)) {
            flush();
            buf = para;
            bufStartParaIdx = paragraphIdx;
            flush();
            paragraphIdx += 1;
            continue;
        }

        // Long single paragraph — flush whatever's queued, then chop the
        // paragraph itself into target-sized pieces on sentence boundaries.
        if (para.length > TARGET_CHARS) {
            flush();
            const pieces = splitByLength(para, paragraphIdx);
            for (const piece of pieces) {
                buf = piece;
                bufStartParaIdx = paragraphIdx;
                flush();
            }
            paragraphIdx += 1;
            continue;
        }

        // Would adding this paragraph push us over the target? Flush and
        // start fresh with the current paragraph.
        if (buf.length + 2 + para.length > TARGET_CHARS) {
            flush();
            bufStartParaIdx = paragraphIdx;
            buf = para;
        } else {
            buf = buf ? `${buf}\n\n${para}` : para;
        }
        paragraphIdx += 1;
    }
    flush();
    return out;
}

function buildChunk(text, chunkIndex, paragraphIndex, overlapChars = 0) {
    return {
        text,
        chunkIndex,
        pageEstimate: Math.floor(chunkIndex / 3) + 1,
        paragraphIndex,
        tokenEstimate: Math.ceil(text.length / 4),
        overlapChars,
    };
}

// Cut a single oversized string into target-sized pieces at sentence
// boundaries when possible.
function splitByLength(text, paragraphIndex) {
    const pieces = [];
    let remaining = text;
    while (remaining.length > TARGET_CHARS) {
        // spans recomputed per iteration — slicing shifts every offset
        const spans = mathSpans(remaining);
        let cut = findSentenceBoundary(remaining, TARGET_CHARS, spans);
        if (cut <= 0) cut = TARGET_CHARS;
        // never cut inside an equation: push the cut to the span's end
        const span = spanContaining(cut, spans) || spanContaining(cut - 1, spans);
        if (span) cut = span[1];
        if (cut >= remaining.length) break;
        pieces.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
    }
    if (remaining.length > 0) pieces.push(remaining);
    return pieces;
}

// Walk backwards from `approx` looking for ., !, ? that sit OUTSIDE math
// spans. Falls back to `approx` if nothing found in the look-back window.
function findSentenceBoundary(text, approx, spans = []) {
    const lookback = Math.max(0, approx - 400);
    for (let i = Math.min(approx, text.length - 1); i >= lookback; i--) {
        const c = text[i];
        if ((c === '.' || c === '!' || c === '?') && !spanContaining(i, spans)) {
            return i + 1;
        }
    }
    return approx;
}

module.exports = { chunkText };

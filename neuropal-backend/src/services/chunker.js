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

function chunkText(fullText) {
    if (!fullText || typeof fullText !== 'string') return [];

    const paragraphs = fullText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
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

        // Prepend overlap from the previous chunk for continuity.
        if (idx > 0) {
            const prev = out[out.length - 1].text;
            const tail = takeTail(prev, OVERLAP_CHARS);
            text = `${tail}\n\n${text}`;
        }

        out.push(buildChunk(text, idx, bufStartParaIdx));
        buf = '';
    };

    for (const para of paragraphs) {
        if (!buf) bufStartParaIdx = paragraphIdx;

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

function buildChunk(text, chunkIndex, paragraphIndex) {
    return {
        text,
        chunkIndex,
        pageEstimate: Math.floor(chunkIndex / 3) + 1,
        paragraphIndex,
        tokenEstimate: Math.ceil(text.length / 4),
    };
}

// Cut a single oversized string into target-sized pieces at sentence
// boundaries when possible.
function splitByLength(text, paragraphIndex) {
    const pieces = [];
    let remaining = text;
    while (remaining.length > TARGET_CHARS) {
        let cut = findSentenceBoundary(remaining, TARGET_CHARS);
        if (cut <= 0) cut = TARGET_CHARS;
        pieces.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
    }
    if (remaining.length > 0) pieces.push(remaining);
    return pieces;
}

// Walk backwards from `approx` looking for ., !, ?. Falls back to `approx`
// if nothing found in the look-back window.
function findSentenceBoundary(text, approx) {
    const lookback = Math.max(0, approx - 400);
    for (let i = Math.min(approx, text.length - 1); i >= lookback; i--) {
        const c = text[i];
        if (c === '.' || c === '!' || c === '?') return i + 1;
    }
    return approx;
}

function takeTail(text, n) {
    if (!text) return '';
    if (text.length <= n) return text;
    return text.slice(text.length - n);
}

module.exports = { chunkText };

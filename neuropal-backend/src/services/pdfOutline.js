// P2 — real PDF structure. Reads the embedded outline (/Outlines) via
// pdfjs-dist and resolves each entry to a page. Falls back to detecting
// heading-shaped lines at page tops when no outline exists. Never fabricates
// titles: a junk outline (stitched-download bookmarks like "fulltext_3.pdf")
// gets its titles re-derived from the destination page's text, or an honest
// "pp. X–Y" label.

// Filename-ish / boilerplate bookmark titles that carry no meaning.
const JUNK_TITLE =
    /\.(pdf|jpe?g|png|indd|docx?)$|^(untitled|bookmark|section)\s*\d*$|^\d+$|^p(age)?\.?\s*\d+$|^(fulltext|front-?matter|cover(-image)?)([_-]\w+)*$/i;

// extractPdfOutline(buf) → [{ title, pageIndex }] | []   (never throws)
async function extractPdfOutline(buf) {
    let task;
    try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        task = pdfjs.getDocument({
            data: new Uint8Array(buf),
            useSystemFonts: true,
            isEvalSupported: false,
        });
        const doc = await task.promise;
        const outline = await doc.getOutline();
        if (!outline || outline.length === 0) return [];

        // top level only — a book's chapter list, not every subsection
        const entries = [];
        for (const item of outline) {
            let pageIndex = null;
            try {
                const dest =
                    typeof item.dest === 'string'
                        ? await doc.getDestination(item.dest)
                        : item.dest;
                if (dest && dest[0]) pageIndex = await doc.getPageIndex(dest[0]);
            } catch (e) {
                // unresolvable destination — keep the title, drop the page
            }
            const title = String(item.title || '').trim();
            if (title || pageIndex !== null) entries.push({ title, pageIndex });
        }
        return entries;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[pdf-outline] read failed:', err.message);
        return [];
    } finally {
        // destroying the TASK also frees the doc AND the transferred
        // file-sized buffer — doc.destroy alone leaks when getDocument
        // itself rejected
        try {
            await task?.destroy();
        } catch (e) {
            // already gone
        }
    }
}

// Turn raw outline entries + per-page text into TOC drafts with honest
// titles. `pages` is pdf-parse's per-page text array (may be shorter than
// the outline expects — guard).
function outlineToToc(entries, pages, pageCount) {
    if (!entries || entries.length < 2) return [];

    const junkRatio =
        entries.filter((e) => JUNK_TITLE.test(e.title)).length / entries.length;
    const junky = junkRatio > 0.5;

    const toc = [];
    entries.forEach((e, i) => {
        if (e.pageIndex === null && (junky || !e.title)) return; // nothing usable
        let title = junky || !e.title ? null : e.title;
        if (!title && e.pageIndex !== null) {
            title = pageTitle(pages?.[e.pageIndex]);
        }
        if (!title && e.pageIndex !== null) {
            const from = e.pageIndex + 1;
            const to =
                entries[i + 1]?.pageIndex != null
                    ? entries[i + 1].pageIndex
                    : pageCount || from;
            title = `pp. ${from}–${Math.max(from, to)}`;
        }
        if (!title) return;
        toc.push({
            title: title.slice(0, 300),
            order: toc.length,
            startParagraph: null,
            startPage: e.pageIndex !== null ? e.pageIndex + 1 : null,
        });
    });
    return toc.length >= 2 ? toc : [];
}

// First heading-looking line of a page's text.
function pageTitle(pageText) {
    if (!pageText) return null;
    const lines = pageText
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 4);
    for (const line of lines) {
        if (line.length >= 4 && line.length <= 80 && !/[.;:]$/.test(line) && /[A-Za-z]{3}/.test(line)) {
            return line;
        }
    }
    return null;
}

// No outline at all: scan page tops for chapter-shaped headings.
// Deliberately strict — a noisy result is worse than the synthetic parts.
// Two branches with DIFFERENT case rules: "chapter/part/appendix N" is
// legitimately any-case, but the numbered form ("3. Wave Mechanics") must
// keep its capital anchor or digit-led prose at page tops matches.
const HEADING_WORD = /^(?:chapter|part|appendix)\s+[\dIVXLCivxlc]+[.:]?\s*.{0,60}$/i;
const HEADING_NUMBERED = /^\d{1,2}\.?\s+[A-Z][^.!?]{3,60}$/;
const isHeadingLine = (l) => HEADING_WORD.test(l) || HEADING_NUMBERED.test(l);

function detectHeadings(pages, pageCount) {
    if (!pages || pages.length === 0) return [];
    const candidates = [];
    pages.forEach((pageText, idx) => {
        const top = (pageText || '')
            .split('\n')
            .map((l) => l.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 3);
        for (const line of top) {
            if (isHeadingLine(line)) {
                // running heads GLUE the page number onto the title
                // ("CHAPTER 1. THE WAVE FUNCTION11") — strip digits only when
                // fused to a letter; a spaced number is the chapter number
                // itself ("CHAPTER 1") and must survive
                const title = line.replace(/(?<=[a-zA-Z])\d{1,4}$/, '').trim();
                if (title) candidates.push({ title, page: idx + 1 });
                break;
            }
        }
    });

    // Running heads repeat their title on (at least) every chapter page —
    // and verso/recto books ALTERNATE two heads, so dedupe must be global,
    // not adjacent-only. Chapters never legitimately repeat a title.
    const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const seen = new Set();
    const toc = [];
    for (const c of candidates) {
        const key = norm(c.title);
        if (seen.has(key)) continue;
        seen.add(key);
        toc.push({
            title: c.title.slice(0, 300),
            order: toc.length,
            startParagraph: null,
            startPage: c.page,
        });
    }
    // too few = not structure; too many = noise that survived dedupe
    if (toc.length < 2 || toc.length > Math.max(8, (pageCount || pages.length) / 3)) {
        return [];
    }
    return toc;
}

module.exports = { extractPdfOutline, outlineToToc, detectHeadings };

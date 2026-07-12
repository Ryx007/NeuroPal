const fs = require('fs/promises');

// File → plain text. Returns { text, pageCount, wordCount }.
//
//   pdf:  pdf-parse; when the result looks like a SCANNED pdf (image-only
//         pages, no text layer) and opts.allowOcr is set, falls back to
//         tesseract OCR via services/ocr.js
//   txt:  raw UTF-8 read; pageCount estimated as 1 page per 3000 chars
//   epub: real extraction — unzip, walk the OPF spine in reading order,
//         strip each XHTML chapter to plain text (chapters joined by blank
//         lines so the chunker sees them as paragraph boundaries)
//   docx: warning + raw UTF-8 fallback (real DOCX parser is a later upgrade)
//
// opts: { allowOcr?: boolean, onOcrProgress?: (done, total) => void }
// OCR is opt-in because it is minutes-slow — the ingest pipeline enables
// it; the query route's raw-file fallback must stay fast and does not.

// Under this many extractable chars per page, a PDF is treated as scanned.
// Real text pages run 1500-3500 chars; scans yield 0 (or a few chars of
// metadata/watermark junk).
const SCANNED_PDF_CHARS_PER_PAGE = 100;

// pdf-parse with a per-page collector (same line-building logic as its
// default renderer) — the pages[] feed outline titles, heading detection and
// P4 page anchors BY PAGE INDEX, so a failed page still occupies its slot.
async function parsePdfWithPages(buf) {
    const pdfParse = require('pdf-parse'); // lazy: heavy native bindings
    const pages = [];
    const data = await pdfParse(buf, {
        pagerender: (pageData) =>
            pageData
                .getTextContent()
                .then((tc) => {
                    let lastY;
                    let pageText = '';
                    for (const item of tc.items) {
                        if (lastY === item.transform[5] || lastY === undefined) {
                            pageText += item.str;
                        } else {
                            pageText += `\n${item.str}`;
                        }
                        lastY = item.transform[5];
                    }
                    pages.push(pageText);
                    return pageText;
                })
                .catch(() => {
                    pages.push('');
                    return '';
                }),
    });
    return { data, pages };
}

async function extractText(filePath, docType, opts = {}) {
    const buf = await fs.readFile(filePath);

    // ---- P1 Tier A: arXiv → author's LaTeX source (perfect math) ----------
    // The on-disk file stays the PDF (original-pages view, page renders);
    // only the READING TEXT comes from the .tex. A null result (pdf-only
    // submission, network failure) falls through to the PDF tiers below.
    if (opts.arxivId) {
        const { extractArxivLatex } = require('./arxivLatex');
        const latex = await extractArxivLatex(opts.arxivId);
        if (latex) {
            let pageCount = Math.max(1, Math.ceil(latex.text.length / 3000));
            let pagesText;
            try {
                // Full text-layer pass (not just metadata): the per-page text
                // lets resolvePageAnchors fingerprint the LaTeX-derived
                // reading text against the real PDF pages — prose lines match
                // after normalization even though the math renders differ.
                const parsed = await parsePdfWithPages(buf);
                if (parsed.data.numpages) pageCount = parsed.data.numpages;
                pagesText = parsed.pages;
            } catch (e) {
                // keep the estimate; no page anchors
            }
            return {
                text: latex.text,
                pageCount,
                wordCount: latex.wordCount,
                extractor: 'arxiv-latex',
                pagesText,
                // \section titles — the ingest resolver anchors them to
                // their heading paragraphs in the final text
                toc: (latex.sections || []).map((title, i) => ({
                    title,
                    order: i,
                    startParagraph: null,
                    startPage: null,
                })),
            };
        }
        // eslint-disable-next-line no-console
        console.warn(`[extractor] no LaTeX source for arXiv:${opts.arxivId} — falling back to PDF tiers`);
    }

    if (docType === 'pdf' || docType === 'arxiv') {
        const { data, pages } = await parsePdfWithPages(buf);

        // P2: the embedded outline is the authoritative chapter structure —
        // read it once here; every PDF-tier return below carries it.
        const { extractPdfOutline, outlineToToc, detectHeadings } = require('./pdfOutline');
        const outlineEntries = await extractPdfOutline(buf);

        let text;
        try {
            text = pages.length > 0 ? cleanPdfPages(pages) : data.text || '';
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[extractor] pdf cleanup failed, using raw text:', e.message || e);
            text = data.text || '';
        }
        const pageCount = data.numpages || pages.length || 0;
        const pdfToc =
            outlineToToc(outlineEntries, pages, pageCount) ||
            [];
        const fallbackToc = pdfToc.length > 0 ? pdfToc : detectHeadings(pages, pageCount);

        const density = text.trim().length / Math.max(1, pageCount);
        if (density >= SCANNED_PDF_CHARS_PER_PAGE || !opts.allowOcr) {
            if (density < SCANNED_PDF_CHARS_PER_PAGE) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[extractor] "${filePath.split('/').pop()}" looks scanned ` +
                        `(${Math.round(density)} chars/page) but OCR is not enabled for this call`,
                );
            }

            // ---- P1 Tier B: born-digital math PDF → nougat microservice --
            // Gated on opts.allowMath (ingest only — the query raw-file
            // fallback must stay fast) and on a glyph-density probe so prose
            // books never pay the neural-extraction cost.
            // opts.forceMath (Issue 3) BYPASSES the probe: some textbook PDFs
            // encode equations as unextractable objects — the text layer is
            // clean prose with the math simply MISSING (Griffiths 3rd ed.
            // measured 0.37 glyphs/1000 with 13 '=' signs in 850k chars), so
            // no text-side heuristic can see them. The owner forces Nougat
            // per document from the library card instead.
            if (opts.allowMath) {
                const { extractWithNougat, mathDensity } = require('./mathserve');
                const glyphs = mathDensity(text);
                const threshold = parseFloat(process.env.MATH_DENSITY_MIN || '1.5');
                if (glyphs >= threshold || opts.forceMath) {
                    // eslint-disable-next-line no-console
                    console.log(
                        opts.forceMath
                            ? `[extractor] forceMath — nougat regardless of density (${glyphs.toFixed(2)}/1000)`
                            : `[extractor] math density ${glyphs.toFixed(2)}/1000 ≥ ${threshold} — trying nougat`,
                    );
                    const nougat = await extractWithNougat(filePath, {
                        onProgress: opts.onOcrProgress,
                    });
                    // sanity guard: a degenerate/truncated neural output
                    // must not replace a healthy text layer
                    if (nougat && nougat.text.length > text.length * 0.3) {
                        const nougatToc =
                            fallbackToc.length > 0
                                ? fallbackToc
                                : (nougat.headings || []).map((title, i) => ({
                                      title,
                                      order: i,
                                      startParagraph: null,
                                      startPage: null,
                                  }));
                        return {
                            text: nougat.text,
                            pageCount,
                            wordCount: countWords(nougat.text),
                            extractor: 'nougat',
                            // mathserve's per-page markdown (exact match with
                            // the joined text); the pdf text layer is a
                            // usable fallback for older mathserve builds
                            pagesText: nougat.pagesText || pages,
                            toc: nougatToc,
                        };
                    }
                    if (nougat) {
                        // eslint-disable-next-line no-console
                        console.warn(
                            `[extractor] nougat output suspiciously short (${nougat.text.length} vs ${text.length} chars) — keeping pdf-parse text`,
                        );
                    }
                }
            }
            return {
                text,
                pageCount,
                wordCount: countWords(text),
                extractor: 'pdf-parse',
                pagesText: pages,
                toc: fallbackToc,
            };
        }

        // Scanned PDF → OCR.
        const { ocrPdf, isOcrAvailable } = require('./ocr');
        if (!(await isOcrAvailable())) {
            throw new Error(
                'this PDF appears to be scanned (no text layer) and OCR tools are missing — ' +
                    'run `brew install tesseract poppler` on the backend host',
            );
        }
        // eslint-disable-next-line no-console
        console.log(
            `[extractor] scanned PDF detected (${Math.round(density)} chars/page) — running OCR`,
        );
        const ocr = await ocrPdf(filePath, { onProgress: opts.onOcrProgress });
        return {
            text: ocr.text,
            pageCount: ocr.pageCount || pageCount,
            wordCount: countWords(ocr.text),
            extractor: 'ocr',
            pagesText: ocr.pagesText,
            toc: fallbackToc,
        };
    }

    if (docType === 'txt') {
        const text = buf.toString('utf-8');
        return {
            text,
            pageCount: Math.max(1, Math.ceil(text.length / 3000)),
            wordCount: countWords(text),
            extractor: 'txt',
        };
    }

    if (docType === 'epub') {
        return { ...extractEpub(buf), extractor: 'epub' };
    }

    if (docType === 'md') {
        const text = stripMarkdown(buf.toString('utf-8'));
        return {
            text,
            pageCount: Math.max(1, Math.ceil(text.length / 3000)),
            wordCount: countWords(text),
            extractor: 'md',
        };
    }

    if (docType === 'docx') {
        const mammoth = require('mammoth');
        const { value } = await mammoth.extractRawText({ buffer: buf });
        const text = (value || '').trim();
        if (!text) throw new Error('docx contained no extractable text');
        return {
            text,
            pageCount: Math.max(1, Math.ceil(text.length / 3000)),
            wordCount: countWords(text),
            extractor: 'docx',
        };
    }

    if (docType === 'pptx') {
        return { ...extractPptx(buf), extractor: 'pptx' };
    }

    if (docType === 'djvu') {
        return { ...(await extractDjvu(filePath)), extractor: 'djvu' };
    }

    const text = buf.toString('utf-8');
    return {
        text,
        pageCount: Math.max(1, Math.ceil(text.length / 3000)),
        wordCount: countWords(text),
        extractor: 'raw',
    };
}

// ---- PDF text cleanup --------------------------------------------------------
//
// Raw PDF text extraction interleaves page furniture into the prose — the
// running header ("CHAPTER 3  THE HARMONIC OSCILLATOR"), the footer, and
// the page number land mid-sentence on every page boundary, and TTS reads
// them aloud. This pass:
//   1. drops running headers/footers (normalized lines that repeat at the
//      top/bottom of ≥30% of pages) and standalone page numbers
//   2. repairs end-of-line hyphenation ("electro-\nmagnetic")
//   3. reflows hard-wrapped lines into paragraphs (blank line, sentence
//      end + capital start, or a heading-like line breaks a paragraph)

const FURNITURE_MIN_PAGES = 8;
const FURNITURE_RATIO = 0.3;
const EDGE_LINES = 2; // how many lines at each page edge are furniture candidates

function cleanPdfPages(pages) {
    const pageLines = pages.map((p) =>
        p.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()),
    );

    // 1) find repeated page-edge lines (digits collapsed so "Chapter 3 · 87"
    // and "Chapter 3 · 88" count as the same running head)
    const freq = new Map();
    const normalize = (l) => l.toLowerCase().replace(/\d+/g, '#').trim();
    if (pageLines.length >= FURNITURE_MIN_PAGES) {
        for (const lines of pageLines) {
            const nonEmpty = lines.filter(Boolean);
            const edges = [
                ...nonEmpty.slice(0, EDGE_LINES),
                ...nonEmpty.slice(-EDGE_LINES),
            ];
            for (const edge of new Set(edges.map(normalize))) {
                if (!edge || edge.length > 80) continue;
                freq.set(edge, (freq.get(edge) || 0) + 1);
            }
        }
    }
    const furniture = new Set(
        [...freq.entries()]
            .filter(([, n]) => n >= Math.max(3, pageLines.length * FURNITURE_RATIO))
            .map(([l]) => l),
    );
    const isPageNumber = (l) => /^(\d{1,4}|[ivxlcdm]{1,7})$/i.test(l);

    const allLines = [];
    for (const lines of pageLines) {
        const nonEmptyIdx = lines
            .map((l, i) => (l ? i : -1))
            .filter((i) => i >= 0);
        const edgeSet = new Set([
            ...nonEmptyIdx.slice(0, EDGE_LINES),
            ...nonEmptyIdx.slice(-EDGE_LINES),
        ]);
        lines.forEach((line, i) => {
            if (!line) {
                allLines.push('');
                return;
            }
            if (edgeSet.has(i) && (furniture.has(normalize(line)) || isPageNumber(line))) {
                return; // page furniture — drop
            }
            allLines.push(line);
        });
        allLines.push(''); // page boundary is a soft paragraph hint
    }

    // 2+3) de-hyphenate and reflow into paragraphs
    const paragraphs = [];
    let current = '';
    const flush = () => {
        const p = current.trim();
        if (p) paragraphs.push(p);
        current = '';
    };
    const isHeading = (l) =>
        l.length <= 60 &&
        !/[.!?,;:]$/.test(l) &&
        (/^(chapter|part|section|appendix)\b/i.test(l) ||
            /^\d+(\.\d+)*\s+\S/.test(l) ||
            (/^[A-Z]/.test(l) && l === l.toUpperCase() && /[A-Z]{3}/.test(l)));

    for (const line of allLines) {
        if (!line) {
            // blank: only break if the current buffer looks sentence-complete —
            // page boundaries often split mid-sentence
            if (current && /[.!?:"'’”)\]]$/.test(current.trim())) flush();
            continue;
        }
        if (isHeading(line)) {
            flush();
            paragraphs.push(line);
            continue;
        }
        if (current.endsWith('-') && /^[a-z]/.test(line)) {
            current = current.slice(0, -1) + line; // re-join hyphenated word
        } else {
            current = current ? `${current} ${line}` : line;
        }
        if (/[.!?]["'’”)\]]?$/.test(line) && line.length > 35) {
            flush();
        }
    }
    flush();

    return paragraphs.join('\n\n');
}

// ---- EPUB ------------------------------------------------------------------
//
// An EPUB is a ZIP: META-INF/container.xml points at the OPF package file,
// whose <manifest> maps ids to hrefs and whose <spine> lists chapter ids in
// reading order. The container/OPF are machine-generated XML with a rigid
// shape, so light regex parsing is dependable here; the chapter XHTML is
// reduced to text with block-level tags becoming paragraph breaks.

function extractEpub(buf) {
    const AdmZip = require('adm-zip'); // lazy — only loaded for EPUB uploads
    const zip = new AdmZip(buf);
    const readEntry = (name) => {
        const clean = name.replace(/^\/+/, '');
        const entry = zip.getEntry(clean);
        return entry ? zip.readAsText(entry) : null;
    };

    const container = readEntry('META-INF/container.xml');
    if (!container) throw new Error('EPUB: META-INF/container.xml missing');
    // XML allows single- OR double-quoted attributes.
    const opfPath = (container.match(/full-path=["']([^"']+)["']/) || [])[1];
    if (!opfPath) throw new Error('EPUB: rootfile path not found in container.xml');
    const opf = readEntry(opfPath);
    if (!opf) throw new Error(`EPUB: package file not found at ${opfPath}`);
    const opfDir = opfPath.includes('/')
        ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1)
        : '';

    const manifest = {};
    for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
        const tag = m[0];
        const id = (tag.match(/\bid=["']([^"']+)["']/) || [])[1];
        const href = (tag.match(/\bhref=["']([^"']+)["']/) || [])[1];
        if (id && href) manifest[id] = href;
    }

    const spineIds = [...opf.matchAll(/<itemref\b[^>]*\bidref=["']([^"']+)["']/g)].map(
        (m) => m[1],
    );

    // Titles come from the navigation document: EPUB3 nav.xhtml (manifest
    // properties="nav") or EPUB2 toc.ncx — keyed by href so they line up
    // with spine items. Absent both, the chapter's first line stands in.
    const { titles: navTitles, byBase: navTitlesByBase } = epubNavTitles(opf, opfDir, readEntry);

    const chapters = []; // { text, title, href }
    for (const id of spineIds) {
        const href = manifest[id];
        if (!href) continue;
        // Strip the fragment BEFORE decoding (an encoded %23 is part of the
        // filename, not a fragment) and tolerate sloppy hrefs with raw '%'
        // (decodeURIComponent throws) — one bad chapter must not fail the book.
        const rawPath = (opfDir + href).split('#')[0];
        let entryPath = rawPath;
        try {
            entryPath = decodeURIComponent(rawPath);
        } catch (e) {
            // keep rawPath
        }
        const html = readEntry(entryPath) ?? readEntry(rawPath);
        if (!html) continue;
        const text = htmlToText(html).trim();
        if (text) {
            chapters.push({ text, href: href.split('#')[0], title: null });
        }
    }
    if (chapters.length === 0) {
        throw new Error('EPUB: no readable chapters found in the spine');
    }

    // Real structure (P2): a TOC entry per spine chapter, anchored by its
    // paragraph offset in the joined text — the boundaries the old
    // chapters.join used to throw away.
    const toc = [];
    let paraCursor = 0;
    chapters.forEach((ch, i) => {
        const abs = resolveZipPath(opfDir, ch.href);
        const title =
            navTitles.get(abs) ||
            navTitlesByBase.get(abs.split('/').pop()) ||
            firstLineTitle(ch.text) ||
            `Chapter ${i + 1}`;
        toc.push({ title, order: i, startParagraph: paraCursor, startPage: null });
        paraCursor += ch.text.split(/\n{2,}/).filter((x) => x.trim()).length;
    });

    const text = chapters.map((c) => c.text).join('\n\n');
    return {
        text,
        pageCount: Math.max(1, Math.ceil(text.length / 3000)),
        wordCount: countWords(text),
        toc,
    };
}

// href → title from nav.xhtml (EPUB3) or toc.ncx (EPUB2). Hrefs inside the
// nav/ncx are relative to THAT document's directory (which can differ from
// the OPF's) — everything is normalized to zip-absolute paths, with a
// basename fallback for sloppy producers. Titles are entity-decoded.
function decodeEntities(str) {
    return str
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function dirOf(p) {
    return p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
}

// resolve a relative href against a base dir into a normalized zip path
function resolveZipPath(baseDir, href) {
    const raw = (baseDir + href.split('#')[0]).split('/');
    const out = [];
    for (const seg of raw) {
        if (!seg || seg === '.') continue;
        if (seg === '..') out.pop();
        else out.push(seg);
    }
    return out.join('/');
}

function epubNavTitles(opf, opfDir, readEntry) {
    const titles = new Map(); // zip-absolute path → title
    const byBase = new Map(); // basename fallback
    const put = (docDir, href, title) => {
        const t = decodeEntities(title).replace(/\s+/g, ' ').trim();
        if (!href || !t) return;
        const abs = resolveZipPath(docDir, href);
        if (abs && !titles.has(abs)) titles.set(abs, t);
        const base = abs.split('/').pop();
        if (base && !byBase.has(base)) byBase.set(base, t);
    };

    // EPUB3 nav document — scope to the epub:type="toc" <nav> when present
    // (landmarks/page-list navs would otherwise pollute the chapter list)
    const navHref = (opf.match(/<item\b[^>]*properties=["'][^"']*\bnav\b[^"']*["'][^>]*>/) || [])[0]
        ?.match(/\bhref=["']([^"']+)["']/)?.[1];
    if (navHref) {
        const navPath = resolveZipPath(opfDir, navHref);
        const nav = readEntry(navPath);
        if (nav) {
            const navDir = dirOf(navPath);
            const tocScope =
                (nav.match(/<nav\b[^>]*epub:type=["']toc["'][\s\S]*?<\/nav>/) || [])[0] || nav;
            for (const m of tocScope.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g)) {
                put(navDir, m[1], m[2].replace(/<[^>]+>/g, ' '));
            }
            if (titles.size > 0) return { titles, byBase };
        }
    }

    // EPUB2 ncx
    const ncxHref = (opf.match(/<item\b[^>]*media-type=["']application\/x-dtbncx\+xml["'][^>]*>/) || [])[0]
        ?.match(/\bhref=["']([^"']+)["']/)?.[1];
    if (ncxHref) {
        const ncxPath = resolveZipPath(opfDir, ncxHref);
        const ncx = readEntry(ncxPath);
        if (ncx) {
            const ncxDir = dirOf(ncxPath);
            for (const m of ncx.matchAll(/<navPoint[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content[^>]*src=["']([^"']+)["']/g)) {
                put(ncxDir, m[2], m[1]);
            }
        }
    }
    return { titles, byBase };
}

// A chapter's opening line, if it looks like a title rather than prose.
function firstLineTitle(text) {
    const first = text.split(/\n/, 1)[0].trim();
    if (first.length >= 2 && first.length <= 120 && !/[.!?,;:]$/.test(first)) {
        return first;
    }
    return null;
}

function htmlToText(html) {
    let s = String(html);
    s = s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ');
    const body = s.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
    if (body) s = body[1];
    // Closing block tags end a paragraph; line-level tags become newlines.
    s = s.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article|figcaption|dt|dd)>/gi, '\n\n');
    s = s.replace(/<(br|hr)\b[^>]*\/?>/gi, '\n');
    s = s.replace(/<[^>]+>/g, ' ');
    s = decodeEntities(s);
    s = s.replace(/[ \t]+/g, ' ');
    s = s.replace(/ *\n */g, '\n');
    s = s.replace(/\n{3,}/g, '\n\n');
    return s;
}

const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', hellip: '…', shy: '',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

function decodeEntities(s) {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (m, hex) => {
            try { return String.fromCodePoint(parseInt(hex, 16)); } catch (e) { return m; }
        })
        .replace(/&#(\d+);/g, (m, dec) => {
            try { return String.fromCodePoint(parseInt(dec, 10)); } catch (e) { return m; }
        })
        .replace(/&([a-z]+);/gi, (m, name) => {
            const hit = NAMED_ENTITIES[name.toLowerCase()];
            return hit !== undefined ? hit : m;
        });
}

function countWords(text) {
    if (!text) return 0;
    return text
        .split(/\s+/)
        .filter((s) => s.length > 0).length;
}

// ---- markdown -----------------------------------------------------------
//
// The RAW file is kept verbatim on disk (the editor round-trips it); this
// strips syntax only for the INGESTED text so TTS never reads "hash hash"
// or link URLs aloud.
function stripMarkdown(md) {
    return (
        md
            // fenced code blocks: keep the code, drop the fences
            .replace(/^```[^\n]*$/gm, '')
            // images: keep alt text
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
            // links: keep the label
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            // headings / blockquotes / list markers at line start
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^>\s?/gm, '')
            .replace(/^\s*[-*+]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            // emphasis + inline code markers
            .replace(/(\*\*|__|\*|_|`)/g, '')
            // tables: turn pipes into spaces, drop separator rows
            .replace(/^\s*\|?[-:| ]+\|?\s*$/gm, '')
            .replace(/\|/g, '  ')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );
}

// ---- pptx ---------------------------------------------------------------
//
// A .pptx is a zip; each slide is ppt/slides/slideN.xml with text in
// <a:t> runs. One paragraph per slide, prefixed "Slide N", so the chunker
// and the reader keep the deck's structure.
function extractPptx(buf) {
    const AdmZip = require('adm-zip');
    const { XMLParser } = require('fast-xml-parser');

    const zip = new AdmZip(buf);
    const slideEntries = zip
        .getEntries()
        .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
        .sort((a, b) => {
            const n = (e) => parseInt(e.entryName.match(/slide(\d+)/)[1], 10);
            return n(a) - n(b);
        });
    if (slideEntries.length === 0) {
        throw new Error('pptx contained no slides');
    }

    const parser = new XMLParser({ ignoreAttributes: true });
    const collectTexts = (node, out) => {
        if (node == null) return;
        if (Array.isArray(node)) {
            for (const item of node) collectTexts(item, out);
            return;
        }
        if (typeof node === 'object') {
            for (const [key, value] of Object.entries(node)) {
                if (key === 'a:t') {
                    if (typeof value === 'string' || typeof value === 'number') {
                        out.push(String(value));
                    } else {
                        collectTexts(value, out);
                    }
                } else {
                    collectTexts(value, out);
                }
            }
        }
    };

    const slides = slideEntries.map((entry, i) => {
        const runs = [];
        collectTexts(parser.parse(entry.getData().toString('utf-8')), runs);
        const body = runs.join(' ').replace(/\s+/g, ' ').trim();
        return `Slide ${i + 1}\n\n${body}`;
    });

    const text = slides.join('\n\n');
    return {
        text,
        pageCount: slideEntries.length,
        wordCount: countWords(text),
        pagesText: slides, // 1 slide = 1 "page" — exact anchors by construction
    };
}

// ---- djvu ---------------------------------------------------------------
//
// djvulibre's djvutxt dumps the embedded text layer (page breaks come out
// as form-feeds). No text layer → likely a pure scan; surfaced as an error
// with the remedy rather than ingesting an empty document.
async function extractDjvu(filePath) {
    const { execFile } = require('child_process');
    const { promisify } = require('util');

    let stdout;
    try {
        ({ stdout } = await promisify(execFile)('djvutxt', [filePath], {
            maxBuffer: 128 * 1024 * 1024,
        }));
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(
                'djvu support needs djvulibre — run `brew install djvulibre` on the backend host',
            );
        }
        throw new Error(`djvutxt failed: ${err.message || err}`);
    }

    const pages = stdout.split('\f');
    const cleaned = pages.map((pg) => pg.replace(/[ \t]+/g, ' ').trim());
    const text = cleaned.filter(Boolean).join('\n\n');
    if (!text) {
        throw new Error(
            'this .djvu has no text layer (pure scan) — convert to PDF and upload that so OCR can run',
        );
    }
    return {
        text,
        pageCount: Math.max(1, pages.length - 1),
        wordCount: countWords(text),
        // empty pages keep their slot so pagesText[i] stays page i+1
        pagesText: cleaned,
    };
}

module.exports = { extractText };

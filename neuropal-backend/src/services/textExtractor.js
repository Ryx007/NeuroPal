const fs = require('fs/promises');

// File → plain text. Returns { text, pageCount, wordCount }.
//
//   pdf:  pdf-parse (no dependency on a Chromium/PDFium native binary)
//   txt:  raw UTF-8 read; pageCount estimated as 1 page per 3000 chars
//   epub: real extraction — unzip, walk the OPF spine in reading order,
//         strip each XHTML chapter to plain text (chapters joined by blank
//         lines so the chunker sees them as paragraph boundaries)
//   docx: warning + raw UTF-8 fallback (real DOCX parser is a later upgrade)

async function extractText(filePath, docType) {
    const buf = await fs.readFile(filePath);

    if (docType === 'pdf') {
        // Lazy-require so the heavy native-bindings load happens only when
        // someone actually uploads a PDF (keeps server boot fast).
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buf);
        const text = data.text || '';
        return {
            text,
            pageCount: data.numpages || 0,
            wordCount: countWords(text),
        };
    }

    if (docType === 'txt') {
        const text = buf.toString('utf-8');
        return {
            text,
            pageCount: Math.max(1, Math.ceil(text.length / 3000)),
            wordCount: countWords(text),
        };
    }

    if (docType === 'epub') {
        return extractEpub(buf);
    }

    if (docType === 'docx') {
        // eslint-disable-next-line no-console
        console.warn(
            '[extractor] docx parser not wired yet — falling back to raw UTF-8 read. ' +
                'Output will contain binary artefacts. Upload as .txt or .pdf for clean ' +
                'RAG until mammoth is integrated.',
        );
    }

    const text = buf.toString('utf-8');
    return {
        text,
        pageCount: Math.max(1, Math.ceil(text.length / 3000)),
        wordCount: countWords(text),
    };
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

    const chapters = [];
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
        if (text) chapters.push(text);
    }
    if (chapters.length === 0) {
        throw new Error('EPUB: no readable chapters found in the spine');
    }

    const text = chapters.join('\n\n');
    return {
        text,
        pageCount: Math.max(1, Math.ceil(text.length / 3000)),
        wordCount: countWords(text),
    };
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

module.exports = { extractText };

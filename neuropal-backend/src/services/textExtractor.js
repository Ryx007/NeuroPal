const fs = require('fs/promises');

// File → plain text. Returns { text, pageCount, wordCount }.
//
//   pdf:  pdf-parse (no dependency on a Chromium/PDFium native binary)
//   txt:  raw UTF-8 read; pageCount estimated as 1 page per 3000 chars
//   epub: warning + raw UTF-8 fallback (real EPUB parser is a later upgrade)
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

    if (docType === 'epub' || docType === 'docx') {
        // eslint-disable-next-line no-console
        console.warn(
            `[extractor] ${docType} parser not wired yet — falling back to raw UTF-8 read. ` +
                `Output will contain binary artefacts. Upload as .txt for clean RAG until ` +
                `mammoth (.docx) / ebooklib (.epub) is integrated.`,
        );
    }

    const text = buf.toString('utf-8');
    return {
        text,
        pageCount: Math.max(1, Math.ceil(text.length / 3000)),
        wordCount: countWords(text),
    };
}

function countWords(text) {
    if (!text) return 0;
    return text
        .split(/\s+/)
        .filter((s) => s.length > 0).length;
}

module.exports = { extractText };

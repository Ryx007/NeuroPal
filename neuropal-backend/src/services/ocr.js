const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileP = promisify(execFile);

// OCR for scanned PDFs (image-only pages, no text layer): rasterize each
// page with poppler's pdftoppm, then run tesseract per page and stitch the
// results back together in page order.
//
// Requires the host tools:  brew install tesseract poppler
// (both installed on the Mac Mini, 2026-07-08). Resolution 200dpi grayscale
// is the accuracy/speed sweet spot for book scans on the M4 — roughly
// 1-2s/page, so a 300-page scan is a few minutes; progress is reported per
// page so the library card shows movement.

const OCR_DPI = 200;
const CONCURRENCY = 3;

// Resolve binaries against PATH, then the usual install locations — pm2's
// resurrected environment doesn't always carry the interactive PATH.
// (Looking for the file, not running `<bin> --version`: poppler's tools have
// no --version flag and exit 1, which made every Linux host look tool-less.)
const EXTRA_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
const _resolved = new Map();

async function resolveBin(name) {
    if (_resolved.has(name)) return _resolved.get(name);
    const dirs = [
        ...String(process.env.PATH || '').split(path.delimiter).filter(Boolean),
        ...EXTRA_BIN_DIRS,
    ];
    let found = null;
    for (const dir of dirs) {
        const candidate = path.join(dir, name);
        try {
            await fs.access(candidate, require('fs').constants.X_OK);
            found = candidate;
            break;
        } catch (e) {
            // not here
        }
    }
    _resolved.set(name, found);
    return found;
}

let _bins; // cached {pdftoppm, tesseract} or null
async function ocrBins() {
    if (_bins !== undefined) return _bins;
    const [pdftoppm, tesseract] = await Promise.all([
        resolveBin('pdftoppm'),
        resolveBin('tesseract'),
    ]);
    _bins = pdftoppm && tesseract ? { pdftoppm, tesseract } : null;
    return _bins;
}

async function isOcrAvailable() {
    return Boolean(await ocrBins());
}

// → { text, pageCount }
async function ocrPdf(absPath, { onProgress } = {}) {
    const bins = await ocrBins();
    if (!bins) {
        throw new Error(
            'OCR tools missing — run `brew install tesseract poppler` on the backend host',
        );
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuropal-ocr-'));
    try {
        // 1) Rasterize every page: page-000001.png, page-000002.png, …
        await execFileP(
            bins.pdftoppm,
            ['-r', String(OCR_DPI), '-gray', '-png', absPath, path.join(tmpDir, 'page')],
            { timeout: 30 * 60 * 1000 },
        );

        const pages = (await fs.readdir(tmpDir))
            .filter((f) => f.endsWith('.png'))
            .sort();
        if (pages.length === 0) {
            throw new Error('OCR: pdftoppm produced no page images');
        }

        // 2) Tesseract per page, bounded concurrency, order preserved.
        const texts = new Array(pages.length);
        let cursor = 0;
        let done = 0;
        async function worker() {
            while (true) {
                const i = cursor++;
                if (i >= pages.length) return;
                const { stdout } = await execFileP(
                    bins.tesseract,
                    [path.join(tmpDir, pages[i]), 'stdout', '--psm', '1', '-l', 'eng'],
                    { timeout: 5 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 },
                );
                texts[i] = stdout;
                done += 1;
                if (onProgress) onProgress(done, pages.length);
            }
        }
        await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, pages.length) }, worker),
        );

        const trimmed = texts.map((t) => (t || '').trim());
        const text = trimmed.filter(Boolean).join('\n\n');

        // pagesText keeps EMPTY slots so pagesText[i] is always page i+1
        // (P4 page anchors index by original page number)
        return { text, pageCount: pages.length, pagesText: trimmed };
    } finally {
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}

module.exports = { ocrPdf, isOcrAvailable, resolveBin };

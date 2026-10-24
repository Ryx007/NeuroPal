// Limits for opening a user's zip-based file (EPUB, DOCX, PPTX). Checked from
// the central directory BEFORE anything is inflated, so a small file that
// declares huge or countless entries (a zip bomb) is refused cheaply.
const MAX_ENTRIES = 10000;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

function zipTooBig(message) {
    const err = new Error(message);
    err.status = 413;
    err.expose = true;
    return err;
}

// zip: an AdmZip instance. Throws a 413-flagged error when over budget.
function assertZipBudget(zip, what = 'This file') {
    const entries = zip.getEntries();
    if (entries.length > MAX_ENTRIES) {
        throw zipTooBig(`${what} has too many parts inside it to open safely`);
    }
    let total = 0;
    for (const e of entries) {
        const n = Number(e.header && e.header.size);
        if (!Number.isFinite(n) || n > MAX_ENTRY_BYTES) {
            throw zipTooBig(`${what} contains a part that is too large to open safely`);
        }
        total += n;
        if (total > MAX_TOTAL_BYTES) {
            throw zipTooBig(`${what} unpacks to more than this server allows`);
        }
    }
    return entries;
}

module.exports = { assertZipBudget, MAX_ENTRIES, MAX_ENTRY_BYTES, MAX_TOTAL_BYTES };

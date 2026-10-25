// Text extraction in a child process (see childJobs.js for why). Same
// signature and result as textExtractor.extractText. EXTRACT_ISOLATED=false
// runs it in-process again (local debugging).
//
// EXTRACT_TIMEOUT_MS  default 30 min — OCR of a long scanned book is slow
const { runChildJob } = require('./childJobs');

function extractTextIsolated(filePath, docType, opts = {}) {
    if (process.env.EXTRACT_ISOLATED === 'false') {
        return require('./textExtractor').extractText(filePath, docType, opts);
    }
    const { onOcrProgress, ...plainOpts } = opts;
    return runChildJob(
        { kind: 'extract', filePath, docType, opts: plainOpts },
        {
            timeoutMs: Number(process.env.EXTRACT_TIMEOUT_MS || 30 * 60 * 1000),
            onProgress: onOcrProgress,
        },
    );
}

module.exports = { extractTextIsolated };

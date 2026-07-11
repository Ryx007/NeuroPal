const axios = require('axios');

// Node client for the local math-extraction microservice (neuropal-mathserve,
// FastAPI + facebook/nougat-small on MPS). The service converts born-digital
// math PDFs to Markdown with equations preserved; this client submits a job
// and polls it, reporting page progress back to the ingest pipeline.
//
// Every failure path returns null — the caller falls back to pdf-parse.
// The service being down must never fail an ingest.

const MATHSERVE_URL = (process.env.MATHSERVE_URL || 'http://localhost:8077').replace(/\/+$/, '');
const POLL_MS = 3000;
// A big textbook through a neural extractor is legitimately slow (~1-3 s/page
// on the M4); cap the total wait generously rather than tightly.
const MAX_WAIT_MS = 4 * 60 * 60 * 1000;

// Shared-secret auth (MATHSERVE_TOKEN in both .envs) — the service reads
// PDFs off disk, so it must not be an open localhost oracle.
function authHeaders() {
    return process.env.MATHSERVE_TOKEN
        ? { 'x-mathserve-token': process.env.MATHSERVE_TOKEN }
        : {};
}

async function isMathserveUp() {
    try {
        const { data } = await axios.get(`${MATHSERVE_URL}/healthz`, { timeout: 3000 });
        return data?.status === 'ok';
    } catch (e) {
        return false;
    }
}

// extractWithNougat(absPath, { onProgress }) → { text, pages } | null
async function extractWithNougat(absPath, { onProgress } = {}) {
    if (!(await isMathserveUp())) return null;

    let jobId;
    try {
        const { data } = await axios.post(
            `${MATHSERVE_URL}/extract`,
            { path: absPath },
            { timeout: 30000, headers: authHeaders() },
        );
        jobId = data?.job_id;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[mathserve] extract submit failed:', err.message);
        return null;
    }
    if (!jobId) return null;

    const startedAt = Date.now();
    let consecutiveFailures = 0;
    for (;;) {
        if (Date.now() - startedAt > MAX_WAIT_MS) {
            // eslint-disable-next-line no-console
            console.warn('[mathserve] job timed out:', jobId);
            return null;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));

        let status;
        try {
            ({ data: status } = await axios.get(`${MATHSERVE_URL}/jobs/${jobId}`, {
                timeout: 10000,
                headers: authHeaders(),
            }));
            consecutiveFailures = 0;
        } catch (err) {
            // 404 = the service restarted and lost the in-memory job — it is
            // never coming back; fall through to pdf-parse immediately.
            if (err.response?.status === 404) {
                // eslint-disable-next-line no-console
                console.warn('[mathserve] job vanished (service restart?) — falling back');
                return null;
            }
            // connection-level failures: tolerate blips, not a dead service
            consecutiveFailures += 1;
            if (consecutiveFailures >= 5) {
                // eslint-disable-next-line no-console
                console.warn('[mathserve] service unreachable — falling back:', err.message);
                return null;
            }
            continue;
        }

        if (status.status === 'error') {
            // eslint-disable-next-line no-console
            console.warn('[mathserve] job failed:', status.error);
            return null;
        }
        if (typeof status.done === 'number' && typeof status.total === 'number' && onProgress) {
            onProgress(status.done, Math.max(1, status.total));
        }
        if (status.status === 'done') {
            const markdown = String(status.markdown || '');
            if (!markdown.trim()) return null;
            const normalized = normalizeNougatMarkdown(markdown);
            return {
                text: normalized.text,
                headings: normalized.headings,
                pages: status.total || 0,
            };
        }
    }
}

// Nougat emits MultiMarkdown: math as \(…\) / \[…\], headings as #, tables as
// markdown. Convert math delimiters to the app-wide $…$ / $$…$$ contract and
// soften the markdown syntax the reader doesn't render.
function normalizeNougatMarkdown(md) {
    // Markdown headings become TOC entries (P2). Papers structure at ##,
    // books at # — when enough level-1 headings exist, level-2 is
    // subsection noise (a 40-chapter book would flood the TOC with x.y
    // entries otherwise).
    const all = [];
    md.replace(/^(#{1,2})\s+(.+)$/gm, (_, hashes, title) => {
        const t = title.trim().replace(/[#*_]+$/g, '').trim();
        if (t) all.push({ level: hashes.length, title: t });
        return _;
    });
    const level1 = all.filter((h) => h.level === 1);
    const headings = (level1.length >= 3 ? level1 : all).map((h) => h.title);
    const text = (
        md
            // math delimiters → $ contract (display first). Blank lines
            // inside display bodies are collapsed (they'd sever the block at
            // the paragraph split) and inline bodies are flattened to one
            // line (multi-line inline math defeats span pairing).
            .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `\n\n$$${m.trim().replace(/\n{2,}/g, '\n')}$$\n\n`)
            .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m.trim().replace(/\s+/g, ' ')}$`)
            // markdown headings → bare heading lines (reader detects those)
            .replace(/^#{1,6}\s+/gm, '')
            // bold/italics markers off (TTS reads them otherwise)
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2')
            // page-break markers nougat sometimes emits
            .replace(/\[MISSING_PAGE_[A-Z]*(:\d+)?\]/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );
    return { text, headings };
}

// Corpus-level "is this a math document?" probe run on the pdf-parse text.
// Physics texts leak recognisable glyphs even when mangled (∫ ħ ⟨⟩ Greek,
// dagger, ≈ ≤ …); prose doesn't. Returns matches per 1000 chars.
const MATH_GLYPHS = /[∫∑∏√ℏħ⟨⟩〈〉∂∇±≤≥≈≠≡∞†‡αβγδεζηθλμνξπρστφχψωΓΔΘΛΞΠΣΦΨΩ]/g;

function mathDensity(text) {
    if (!text) return 0;
    const hits = (text.match(MATH_GLYPHS) || []).length;
    return (hits / Math.max(1, text.length)) * 1000;
}

module.exports = { extractWithNougat, isMathserveUp, mathDensity, normalizeNougatMarkdown };

const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { Document, DocumentChunk } = require('../models');
const { getQdrant } = require('../db/qdrant');
const { extractText } = require('./textExtractor');
const { arxivIdFromPath } = require('./arxivLatex');
const { chunkText } = require('./chunker');
const { embedBatch, getModelName, getDim } = require('./embedder');

const STORAGE_ROOT = process.env.STORAGE_ROOT || './storage';
const QDRANT_BATCH = 100;

// Drives Document.status through the state machine:
//   pending → parsing → chunking → embedding → ready (or → failed)
//
// Designed to be fire-and-forget from the upload route. Errors are caught
// internally and written back to the Document row — the caller never sees
// a rejection.
async function ingestDocument(documentId) {
    let doc = await Document.findById(documentId);
    if (!doc) {
        // eslint-disable-next-line no-console
        console.warn('[ingest] document not found:', documentId);
        return;
    }

    try {
        // ---- 1) parsing ----
        doc.status = 'parsing';
        doc.progress = 0;
        doc.ingestStartedAt = new Date();
        doc.ingestError = undefined;
        await doc.save();

        if (!doc.file?.relativePath) {
            throw new Error('document.file.relativePath is missing');
        }
        const absPath = path.resolve(STORAGE_ROOT, doc.file.relativePath);

        // Overall ingest progress: parsing/OCR climbs 0→0.4, embedding
        // 0.4→1. Throttled fire-and-forget writes (see embedding stage).
        let lastParseWrite = 0;
        const onOcrProgress = (done, total) => {
            const now = Date.now();
            if (now - lastParseWrite < 1500 && done < total) return;
            lastParseWrite = now;
            Document.updateOne(
                { _id: doc._id },
                { $set: { progress: (done / total) * 0.4 } },
            ).catch(() => {});
        };

        // arXiv id enables the LaTeX-source tier; legacy imports carry it
        // only in the filename, so fall back to parsing it out of the path.
        const arxivId =
            doc.meta?.arxivId ||
            (doc.type === 'arxiv' ? arxivIdFromPath(doc.file.relativePath) : null);

        const { text, pageCount, wordCount, extractor, toc: tocDraft, pagesText } = await extractText(absPath, doc.type, {
            allowOcr: true, // scanned books get tesseract'd (services/ocr.js)
            allowMath: true, // born-digital math PDFs → nougat (ingest only)
            arxivId,
            onOcrProgress,
        });
        if (!text || !text.trim()) {
            throw new Error('extractor returned empty text');
        }

        doc.pageCount = pageCount;
        doc.wordCount = wordCount;
        doc.extractor = extractor;
        await doc.save();

        // Best-effort arxivId backfill for legacy imports — a duplicate-key
        // clash (soft-deleted twin, double legacy import) must never fail an
        // ingest whose extraction already succeeded.
        if (arxivId && !doc.meta?.arxivId) {
            Document.updateOne(
                { _id: doc._id },
                { $set: { 'meta.arxivId': arxivId } },
            ).catch((e) => {
                // eslint-disable-next-line no-console
                console.warn('[ingest] arxivId backfill skipped:', e.message);
            });
        }

        // ---- 2) chunking ----
        doc.status = 'chunking';
        await doc.save();

        const chunks = chunkText(text);
        if (chunks.length === 0) throw new Error('chunker produced 0 chunks');

        // P2: anchor the TOC to the paragraph indexes of the text THE CLIENT
        // WILL SEE (chunks reconstructed exactly as GET /:id/text serves
        // them) — computing on anything else drifts once a long paragraph
        // gets length-split.
        doc.toc = resolveTocAnchors(chunks, tocDraft);
        if (doc.toc.length > 0) {
            // eslint-disable-next-line no-console
            console.log(`[ingest] toc: ${doc.toc.length} chapters for ${doc._id}`);
        }

        // P4: real page anchors in the same canonical-paragraph domain as the
        // TOC. Tiers without per-page text return empty — the client then
        // keeps its proportional mapping (honest absence, never fabrication).
        const { pageMap, chunkPages } = resolvePageAnchors(chunks, pagesText);
        doc.pageMap = pageMap;
        if (pageMap.length > 0) {
            // eslint-disable-next-line no-console
            console.log(`[ingest] pageMap: ${pageMap.length}/${pagesText?.length ?? 0} pages anchored for ${doc._id}`);
        }

        // ---- 3) embedding ----
        doc.status = 'embedding';
        doc.progress = 0.4; // parsing/OCR owned 0→0.4
        await doc.save();

        // Throttled progress writes (fire-and-forget updateOne so a slow
        // Mongo write never blocks the embedding workers, and no VersionError
        // against the `doc` instance we save at the end).
        let lastProgressWrite = 0;
        const onProgress = (done, total) => {
            const now = Date.now();
            if (now - lastProgressWrite < 1500 && done < total) return;
            lastProgressWrite = now;
            Document.updateOne(
                { _id: doc._id },
                { $set: { progress: 0.4 + (done / total) * 0.6 } },
            ).catch(() => {});
        };

        const modelName = getModelName();
        const dim = getDim();
        const vectors = await embedBatch(chunks.map((c) => c.text), onProgress);
        if (vectors.length !== chunks.length) {
            throw new Error(
                `embedding count mismatch: ${vectors.length} vs ${chunks.length} chunks`,
            );
        }

        // Build DocumentChunk + Qdrant point pairs sharing the same vectorId.
        const chunkDocs = [];
        const points = [];
        for (let i = 0; i < chunks.length; i++) {
            const c = chunks[i];
            const vectorId = uuidv4();

            chunkDocs.push({
                documentId: doc._id,
                userId: doc.userId,
                chunkIndex: c.chunkIndex,
                text: c.text,
                tokenCount: c.tokenEstimate,
                overlapChars: c.overlapChars || 0,
                anchor: {
                    // real page when the tier knew pages; null otherwise —
                    // citation chips fall back to "source N" on null, which
                    // beats the fabricated chunkIndex/3 numbers of old
                    page: chunkPages[i] ?? null,
                    paragraphIndex: c.paragraphIndex,
                },
                vectorId,
                vectorCollection: modelName,
                embeddingModel: modelName,
                embeddingDim: dim,
            });

            points.push({
                id: vectorId,
                vector: vectors[i],
                payload: {
                    documentId: doc._id.toString(),
                    userId: doc.userId.toString(),
                    chunkIndex: c.chunkIndex,
                    page: chunkPages[i] ?? null,
                },
            });
        }

        // ---- 4) write Mongo first, then Qdrant ----
        // If Qdrant write fails partway, the chunks are still in Mongo and
        // a /reingest call rebuilds Qdrant from the existing rows.
        await DocumentChunk.insertMany(chunkDocs, { ordered: false });

        const qdrant = getQdrant();
        for (let start = 0; start < points.length; start += QDRANT_BATCH) {
            const batch = points.slice(start, start + QDRANT_BATCH);
            await qdrant.upsert(modelName, { wait: true, points: batch });
        }

        // ---- 5) ready ----
        doc.status = 'ready';
        doc.progress = 1;
        doc.ingestFinishedAt = new Date();
        await doc.save();

        // eslint-disable-next-line no-console
        console.log(
            `[ingest] ready: ${doc._id} (${chunks.length} chunks, ${pageCount}pp)`,
        );
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ingest] failed:', doc._id, err.message || err);
        try {
            doc.status = 'failed';
            doc.ingestError = String(err.message || err).slice(0, 1000);
            doc.ingestFinishedAt = new Date();
            await doc.save();
        } catch (e2) {
            // eslint-disable-next-line no-console
            console.error('[ingest] failed to persist failure state:', e2);
        }
    }
}

// Delete the chunks for a document from both Mongo and Qdrant.
// Used by re-ingest and by document soft-delete.
async function deleteDocumentChunks(documentId) {
    const sample = await DocumentChunk.findOne({ documentId })
        .select('vectorCollection')
        .lean();
    const collectionName = sample?.vectorCollection;

    if (collectionName) {
        try {
            const qdrant = getQdrant();
            await qdrant.delete(collectionName, {
                wait: true,
                filter: {
                    must: [
                        {
                            key: 'documentId',
                            match: { value: documentId.toString() },
                        },
                    ],
                },
            });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(
                '[ingest] qdrant delete failed (Mongo cleanup will still proceed):',
                err.message || err,
            );
        }
    }

    await DocumentChunk.deleteMany({ documentId });
}

// Ingest is fire-and-forget, so a server restart kills any in-flight run
// and strands its document in a processing status forever. Called on boot:
// every stuck document gets its partial chunks wiped and ingest re-kicked.
async function resumeStuckIngests() {
    const stuck = await Document.find({
        status: { $in: ['pending', 'parsing', 'chunking', 'embedding'] },
        deletedAt: null,
    }).select('_id title status');

    for (const doc of stuck) {
        // eslint-disable-next-line no-console
        console.warn(
            `[ingest] resuming "${doc.title}" (stuck in '${doc.status}' from a previous run)`,
        );
        await deleteDocumentChunks(doc._id);
        ingestDocument(doc._id).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[ingest] resume failed:', doc._id, err.message || err);
        });
    }
}

// P4 — real page anchors. Each page's raw text is fingerprinted (normalized
// line prefixes: first lines + a mid-page line, since running heads and page
// numbers often die in cleaning) and located in the canonical
// chunk-reconstructed paragraph list via one monotonic indexOf sweep.
// Returns { pageMap: [{page, startParagraph}], chunkPages: page per chunk }.
// Too few locatable pages → empty (a sparse map would jump around worse
// than the client's proportional fallback).
function resolvePageAnchors(chunks, pagesText) {
    const empty = { pageMap: [], chunkPages: chunks.map(() => null) };
    if (!Array.isArray(pagesText) || pagesText.length < 2) return empty;

    // canonical paragraphs + the paragraph index each chunk starts at
    const paragraphs = [];
    const chunkStartPara = [];
    for (const c of chunks) {
        chunkStartPara.push(paragraphs.length);
        const piece = c.overlapChars ? c.text.slice(c.overlapChars) : c.text;
        for (const p of piece.split(/\n{2,}/)) {
            const t = p.trim();
            if (t) paragraphs.push(t);
        }
    }

    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
    // one normalized haystack + paragraph start offsets → each fingerprint
    // is a single indexOf from a monotonic cursor. Joining without a
    // separator lets a fingerprint that ends in a hyphenated/rejoined word
    // still match as a prefix of the joined form.
    const offsets = [];
    let haystack = '';
    for (const p of paragraphs) {
        offsets.push(haystack.length);
        haystack += norm(p);
    }
    const paraAt = (charIdx) => {
        let lo = 0;
        let hi = offsets.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (offsets[mid] <= charIdx) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    };

    const fingerprints = (raw) => {
        const lines = String(raw || '')
            .split('\n')
            .map((l) => norm(l))
            .filter((l) => l.length >= 24); // shorter is too ambiguous
        const cands = lines.slice(0, 3);
        const mid = lines[Math.floor(lines.length / 2)];
        if (mid && !cands.includes(mid)) cands.push(mid);
        return cands.map((c) => c.slice(0, 64));
    };

    const pageMap = [];
    let cursor = 0;
    let consecutiveMisses = 0;
    for (let i = 0; i < pagesText.length; i++) {
        // every miss scans cursor→end of the whole haystack — on a book
        // whose page text simply doesn't correspond to the canonical text
        // (heavy OCR garble, image-only pages) that's O(pages × text) for
        // nothing; a long dry streak this early means the domains don't
        // match and the 30% threshold below would reject the map anyway
        if (consecutiveMisses >= 60 && pageMap.length < i * 0.05) {
            return empty;
        }
        let best = -1;
        for (const fp of fingerprints(pagesText[i])) {
            const at = haystack.indexOf(fp, cursor);
            if (at !== -1 && (best === -1 || at < best)) best = at;
        }
        if (best === -1) {
            consecutiveMisses += 1;
            continue;
        }
        consecutiveMisses = 0;
        const para = paraAt(best);
        // strictly-advancing anchors only — two pages may share a paragraph
        // (short pages), in which case the later page adds nothing
        if (pageMap.length === 0 || para > pageMap[pageMap.length - 1].startParagraph) {
            pageMap.push({ page: i + 1, startParagraph: para });
        }
        cursor = best;
    }

    if (pageMap.length < Math.max(2, Math.floor(pagesText.length * 0.3))) {
        return empty;
    }

    const pageForPara = (para) => {
        let page = pageMap[0].page;
        for (const e of pageMap) {
            if (e.startParagraph <= para) page = e.page;
            else break;
        }
        return page;
    };
    return { pageMap, chunkPages: chunkStartPara.map(pageForPara) };
}

// Map extractor TOC drafts onto the canonical paragraph list. Title-anchored
// entries are matched (normalized, forward-scanning) against reconstructed
// paragraphs — extractor-precomputed indexes are only a fallback, since
// length-splitting can shift them. Page-only entries pass through for the
// client's proportional mapping. Fewer than 2 survivors → no TOC (the
// client keeps its honest synthetic parts).
function resolveTocAnchors(chunks, draft) {
    if (!Array.isArray(draft) || draft.length === 0) return [];

    const reconstructed = chunks
        .map((c) => (c.overlapChars ? c.text.slice(c.overlapChars) : c.text))
        .join('\n\n');
    const paragraphs = reconstructed
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
    const norm = (str) => String(str).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const paraNorms = paragraphs.map(norm);

    // Title scan from a starting paragraph. The book's own PRINTED contents
    // page is the classic trap: every chapter title appears there first, in
    // a tight consecutive cluster, and a naive first-match scan anchors all
    // chapters to that one page (one-line "chapters"). We scan twice: if the
    // first pass's matches cluster suspiciously (median gap of a real book's
    // chapters is dozens-to-hundreds of paragraphs; a contents block is ~1),
    // rescan starting after that cluster.
    const scan = (fromIdx) => {
        let cursor = fromIdx;
        const matches = new Map(); // draft index → paragraph index
        draft.forEach((entry, di) => {
            const t = entry.title ? norm(entry.title) : '';
            if (t.length < 3) return;
            for (let i = cursor; i < paragraphs.length; i++) {
                if (
                    paraNorms[i] === t ||
                    (paraNorms[i].startsWith(t) && paraNorms[i].length <= t.length + 24)
                ) {
                    matches.set(di, i);
                    cursor = i + 1;
                    break;
                }
            }
        });
        return matches;
    };

    let matches = scan(0);
    if (matches.size >= 3) {
        const idxs = [...matches.values()];
        const span = idxs[idxs.length - 1] - idxs[0];
        if (span < matches.size * 3) {
            // contents-page cluster — rescan after it
            const rescanned = scan(idxs[idxs.length - 1] + 1);
            if (rescanned.size >= Math.min(2, matches.size)) matches = rescanned;
        }
    }

    const out = [];
    let cursor = 0;
    draft.forEach((entry, di) => {
        let startParagraph = matches.has(di) ? matches.get(di) : null;
        if (startParagraph === null && typeof entry.startParagraph === 'number') {
            startParagraph = entry.startParagraph;
        }
        if (startParagraph !== null) cursor = Math.max(cursor, startParagraph + 1);
        if (startParagraph === null && entry.startPage == null) return;
        out.push({
            title: String(entry.title || '').slice(0, 300),
            order: out.length,
            startParagraph,
            startPage: entry.startPage ?? null,
        });
    });

    // paragraph anchors must be strictly increasing
    let last = -1;
    const clean = out.filter((e) => {
        if (e.startParagraph === null) return true;
        if (e.startParagraph > last) {
            last = e.startParagraph;
            return true;
        }
        return false;
    });
    return clean.length >= 2 ? clean : [];
}

module.exports = { ingestDocument, deleteDocumentChunks, resumeStuckIngests };

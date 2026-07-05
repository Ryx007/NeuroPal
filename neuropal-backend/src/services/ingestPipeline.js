const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { Document, DocumentChunk } = require('../models');
const { getQdrant } = require('../db/qdrant');
const { extractText } = require('./textExtractor');
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
        doc.ingestStartedAt = new Date();
        doc.ingestError = undefined;
        await doc.save();

        if (!doc.file?.relativePath) {
            throw new Error('document.file.relativePath is missing');
        }
        const absPath = path.resolve(STORAGE_ROOT, doc.file.relativePath);
        const { text, pageCount, wordCount } = await extractText(absPath, doc.type);
        if (!text || !text.trim()) {
            throw new Error('extractor returned empty text');
        }

        doc.pageCount = pageCount;
        doc.wordCount = wordCount;
        await doc.save();

        // ---- 2) chunking ----
        doc.status = 'chunking';
        await doc.save();

        const chunks = chunkText(text);
        if (chunks.length === 0) throw new Error('chunker produced 0 chunks');

        // ---- 3) embedding ----
        doc.status = 'embedding';
        await doc.save();

        const modelName = getModelName();
        const dim = getDim();
        const vectors = await embedBatch(chunks.map((c) => c.text));
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
                anchor: {
                    page: c.pageEstimate,
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
                    page: c.pageEstimate,
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

module.exports = { ingestDocument, deleteDocumentChunks };

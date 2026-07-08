const { Schema, model } = require('mongoose');

// One row per RAG chunk. A 24-page paper typically produces 60–250 chunks.
//
// VECTOR STRATEGY — self-hosted, NO Atlas Vector Search
// =====================================================
// Self-hosted MongoDB Community has no native vector index. We pair Mongo
// with a self-hosted vector DB (recommended: **Qdrant**, single Docker
// container alongside the API). The split is:
//
//   • Mongo  →  chunk text + metadata + source-position anchor
//   • Qdrant →  the vector + a payload pointing back to the Mongo `_id`
//
// On ingest:
//   1. Insert the DocumentChunk into Mongo, get `_id`
//   2. Embed the text, upsert into Qdrant with payload
//        { documentId, userId, chunkId: <Mongo _id>, page, sectionHeading }
//   3. Set DocumentChunk.vectorId to the Qdrant point id and save
//
// On query:
//   1. Embed the user question
//   2. Qdrant search with filter { userId, documentId } → returns top-k
//      hits, each carrying chunkId in its payload
//   3. Mongo `find({ _id: { $in: chunkIds }})` to fetch text + anchor
//
// `embedding` is kept as an OPTIONAL fallback for very early development
// or tests where you don't want to spin up Qdrant. App-side cosine over
// `find({ documentId })` works for corpora up to ~10K chunks.

const CitationAnchorSchema = new Schema(
    {
        // Position pointers we send back with every chat answer so the
        // mobile app can highlight the source paragraph in the reader.
        page: { type: Number, min: 1 },
        paragraphIndex: { type: Number, min: 0 },
        // Char offsets into the section text — useful for precise underlines.
        startOffset: { type: Number, min: 0 },
        endOffset: { type: Number, min: 0 },
    },
    { _id: false },
);

const DocumentChunkSchema = new Schema(
    {
        documentId: {
            type: Schema.Types.ObjectId,
            ref: 'Document',
            required: true,
        },
        // Denormalised so Qdrant filters can include userId without a join.
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        chunkIndex: { type: Number, required: true, min: 0 },
        text: { type: String, required: true, maxlength: 8000 },
        tokenCount: { type: Number, min: 0 },

        // Chars at the start of `text` that duplicate the previous chunk's
        // tail (RAG overlap). Strip when reconstructing reading text.
        overlapChars: { type: Number, min: 0, default: 0 },

        // Source position
        sectionId: { type: String },
        sectionHeading: { type: String },
        anchor: { type: CitationAnchorSchema },

        // ---- Vector indirection (preferred path) ----
        // The Qdrant point id for this chunk. UUID string.
        // Set after the embed-and-upsert step in the ingest pipeline.
        vectorId: { type: String },

        // The collection in Qdrant — typically the embedding model name,
        // since changing models means reindexing into a fresh collection.
        vectorCollection: { type: String },

        // ---- Embedding fallback (only set if NOT using Qdrant) ----
        // Wastes ~6KB/chunk in Mongo at 1536 dims; only enable for dev.
        embedding: {
            type: [Number],
            select: false, // never returned by default — opt in explicitly
        },

        // ---- Embedding model metadata ----
        // Always set, regardless of which vector path. Lets a future
        // re-embed job know what to upgrade FROM.
        embeddingModel: {
            type: String,
            enum: [
                'text-embedding-3-small',
                'text-embedding-3-large',
                'voyage-2',
                'voyage-3',
                'nomic-embed-text-v1.5', // local Ollama option
                'bge-large-en-v1.5',     // local sentence-transformers option
            ],
            required: true,
        },
        embeddingDim: { type: Number, required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

// ---- Indexes ---------------------------------------------------------------

// Fetch chunks in document order (used to rebuild context windows + the
// ingest-cleanup cascade when a Document is deleted).
DocumentChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });

// Hydrate by Qdrant hits — `chunkIds` from Qdrant payload mapped back to text.
// (The default `_id` index already handles the `_id: { $in: [...] }` query;
//  this exists for filter-by-document-then-by-vectorId access patterns.)
DocumentChunkSchema.index({ documentId: 1, vectorId: 1 });

// User-scoped fast path for app-side cosine fallback (and for "delete all
// chunks for this user" GDPR purges).
DocumentChunkSchema.index({ userId: 1, documentId: 1 });

// ---- Notes for the ingest service ------------------------------------------
//
// Qdrant collection bootstrap (do this once per embedding model):
//
//   await qdrant.createCollection('text-embedding-3-small', {
//     vectors: { size: 1536, distance: 'Cosine' },
//   });
//   await qdrant.createPayloadIndex('text-embedding-3-small', {
//     field_name: 'userId', field_schema: 'keyword',
//   });
//   await qdrant.createPayloadIndex('text-embedding-3-small', {
//     field_name: 'documentId', field_schema: 'keyword',
//   });
//
// Search call:
//
//   const hits = await qdrant.search('text-embedding-3-small', {
//     vector: queryVec,
//     limit: 8,
//     filter: { must: [
//       { key: 'userId', match: { value: userId.toString() }},
//       { key: 'documentId', match: { value: documentId.toString() }},
//     ]},
//     with_payload: true,
//   });
//   const chunkIds = hits.map(h => h.payload.chunkId);
//   const chunks = await DocumentChunk.find({ _id: { $in: chunkIds }})
//                                     .lean();
//
// If you ever want to migrate OFF Qdrant and back to in-Mongo embeddings
// for a smaller deployment, the `embedding` field is already there —
// just stop populating `vectorId` and run an embed-backfill.

module.exports = model('DocumentChunk', DocumentChunkSchema);

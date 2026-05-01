const { Schema, model } = require('mongoose');

// One row per RAG chunk. A 24-page paper typically produces 60–250 chunks.
//
// The `embedding` field is queried via Atlas Vector Search. You must create
// the vector index from the Atlas UI (or via the Atlas Admin API) — Mongoose
// can't define `vectorSearch` indexes from the schema. The recommended
// definition is at the bottom of this file.

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
        // Denormalised so retrieval can filter by user without joining.
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        chunkIndex: { type: Number, required: true, min: 0 },
        text: { type: String, required: true, maxlength: 8000 },
        tokenCount: { type: Number, min: 0 },

        // Source position
        sectionId: { type: String },
        sectionHeading: { type: String },
        anchor: { type: CitationAnchorSchema },

        // Vector — `text-embedding-3-small` = 1536 dims, `voyage-2` = 1024.
        // Pick one model per environment and stick with it (mixing breaks
        // vector search). Store the model name for future re-embed jobs.
        embedding: {
            type: [Number],
            required: true,
            // Light sanity guard. Real validation belongs in the ingest job
            // because dim count varies by embedding model.
            validate: {
                validator: (v) => Array.isArray(v) && v.length > 0,
                message: 'embedding must be a non-empty number[]',
            },
        },
        embeddingModel: {
            type: String,
            enum: [
                'text-embedding-3-small',
                'text-embedding-3-large',
                'voyage-2',
                'voyage-3',
            ],
            required: true,
        },
        embeddingDim: { type: Number, required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

// ---- Indexes ---------------------------------------------------------------

// Fetch chunks in document order (used to rebuild context windows).
DocumentChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });

// "Find all chunks for this document, fast" — used during a document's
// re-embed job and during deletion cascades.
DocumentChunkSchema.index({ documentId: 1 });

// User-scoped retrieval — vector search runs as a $vectorSearch stage and
// is then $match-filtered on userId. This index supports the $match.
DocumentChunkSchema.index({ userId: 1, documentId: 1 });

// ---- Vector index definition (create in Atlas UI / API) -------------------
//
// On the collection `documentchunks`, define a Search Index of type
// `vectorSearch`:
//
//   {
//     "fields": [
//       {
//         "type": "vector",
//         "path": "embedding",
//         "numDimensions": 1536,                // match embeddingModel
//         "similarity": "cosine"
//       },
//       { "type": "filter", "path": "userId" },
//       { "type": "filter", "path": "documentId" }
//     ]
//   }
//
// Then query with:
//
//   db.documentchunks.aggregate([
//     { $vectorSearch: {
//         index: 'documentchunks_vector',
//         path: 'embedding',
//         queryVector: queryVec,
//         numCandidates: 200,
//         limit: 8,
//         filter: { userId: ObjectId(uid), documentId: ObjectId(did) }
//     }},
//     { $project: { text: 1, anchor: 1, sectionHeading: 1, score: { $meta: 'vectorSearchScore' }}}
//   ])

module.exports = model('DocumentChunk', DocumentChunkSchema);

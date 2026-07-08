const { Schema, model } = require('mongoose');

// One row per uploaded file (PDF / EPUB / DOCX / TXT / arXiv link).
// Text content lives in `DocumentChunk` for RAG retrieval — this row only
// holds metadata + processing state + the source-file pointer.

const DocumentSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },

        // Display
        title: { type: String, required: true, trim: true, maxlength: 500 },
        subtitle: { type: String, trim: true, maxlength: 500 },
        type: {
            type: String,
            enum: ['pdf', 'epub', 'docx', 'txt', 'arxiv', 'web'],
            required: true,
        },

        // Where the source file lives on disk. We store a path RELATIVE
        // to the configured storage root (`process.env.NEUROPAL_STORAGE_ROOT`)
        // — never absolute paths, so the DB stays portable across hosts.
        //
        // Canonical layout: `documents/<userId>/<documentId>/<sanitised-filename>`
        // computed by `src/storage/local.js#documentRelativePath`.
        //
        // The download URL is constructed at serve-time as
        // `/api/documents/<documentId>/raw` — not stored, so a base-URL
        // change doesn't require a DB migration.
        file: {
            relativePath: { type: String },
            sizeBytes: { type: Number, min: 0 },
            mimeType: { type: String },
            checksumSha256: {
                type: String,
                length: 64,
                lowercase: true,
            },
        },

        // Extracted academic metadata (optional, populated post-ingest)
        meta: {
            authors: [{ type: String }],
            journal: { type: String },
            year: { type: Number },
            doi: { type: String, lowercase: true, trim: true },
            arxivId: { type: String, trim: true },
            isbn: { type: String, trim: true },
        },

        pageCount: { type: Number, min: 0, default: 0 },
        wordCount: { type: Number, min: 0, default: 0 },

        // INGEST progress 0→1 (dominated by the embedding stage on big
        // books). Not reading progress — that lives in ReadingSession.
        progress: { type: Number, min: 0, max: 1 },

        // Ingest pipeline state machine — see /rag/ingest.js for transitions.
        //   pending  -> queued, no work yet
        //   parsing  -> text extraction in progress (PyMuPDF / ebooklib)
        //   chunking -> splitting into DocumentChunks
        //   embedding-> generating vectors via embedding API
        //   ready    -> all chunks embedded, vector index up-to-date
        //   failed   -> see ingestError for the reason
        status: {
            type: String,
            enum: ['pending', 'parsing', 'chunking', 'embedding', 'ready', 'failed'],
            default: 'pending',
            index: true,
        },
        ingestStartedAt: { type: Date },
        ingestFinishedAt: { type: Date },
        ingestError: { type: String },

        // Soft-delete (recoverable for 30 days, then purged)
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

// ---- Indexes ---------------------------------------------------------------

// "Documents owned by this user, newest first" — Library page query.
DocumentSchema.index({ userId: 1, createdAt: -1 });

// "What's still processing for this user?" — UI badge / poll endpoint.
DocumentSchema.index({ userId: 1, status: 1 });

// DOI / arXiv-id lookups for de-dup (don't re-ingest the same paper twice
// for the same user). Sparse so docs without these fields don't collide.
DocumentSchema.index(
    { userId: 1, 'meta.doi': 1 },
    {
        unique: true,
        partialFilterExpression: { 'meta.doi': { $type: 'string' } },
    },
);
DocumentSchema.index(
    { userId: 1, 'meta.arxivId': 1 },
    {
        unique: true,
        partialFilterExpression: { 'meta.arxivId': { $type: 'string' } },
    },
);

// Soft-delete sweep
DocumentSchema.index({ deletedAt: 1, updatedAt: 1 });

// File de-dup by content hash — same file uploaded twice by the same user
// shouldn't get re-ingested.
DocumentSchema.index(
    { userId: 1, 'file.checksumSha256': 1 },
    {
        unique: true,
        partialFilterExpression: {
            'file.checksumSha256': { $type: 'string' },
        },
    },
);

// Optional text index for in-library search by title/subtitle. Kept small
// because full-text RAG search lives in DocumentChunk via Atlas Vector
// Search.
DocumentSchema.index(
    { title: 'text', subtitle: 'text' },
    {
        weights: { title: 5, subtitle: 1 },
        name: 'document_title_text',
    },
);

module.exports = model('Document', DocumentSchema);

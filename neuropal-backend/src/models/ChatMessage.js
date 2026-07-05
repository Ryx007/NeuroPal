const { Schema, model } = require('mongoose');

// Doc-grounded Q&A. One row per message. A "thread" is a group of messages
// sharing a `threadId` (a deterministic hash of (userId, documentId, day)
// or a UUID — pick when you wire the API). Threads scope the conversation
// for context-window assembly.

const CitationSchema = new Schema(
    {
        chunkId: { type: Schema.Types.ObjectId, ref: 'DocumentChunk' },
        page: { type: Number, min: 1 },
        sectionHeading: { type: String },
        excerpt: { type: String, maxlength: 400 },
    },
    { _id: false },
);

const TokensSchema = new Schema(
    {
        prompt: { type: Number, min: 0, default: 0 },
        completion: { type: Number, min: 0, default: 0 },
        total: { type: Number, min: 0, default: 0 },
    },
    { _id: false },
);

const ChatMessageSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        documentId: {
            type: Schema.Types.ObjectId,
            ref: 'Document',
            required: true,
        },
        threadId: { type: String, required: true },

        role: {
            type: String,
            enum: ['user', 'assistant', 'system'],
            required: true,
        },
        content: { type: String, required: true, maxlength: 16000 },

        // Anchor the assistant message back to the paragraph the user
        // long-pressed in the reader, so the inline margin note sticks
        // to the right place.
        paragraphId: { type: String },

        citations: [CitationSchema],

        // Cost / latency telemetry — surfaces in the Companion analytics.
        model: { type: String }, // e.g. 'claude-sonnet-4-5'
        tokens: { type: TokensSchema },
        latencyMs: { type: Number, min: 0 },

        // For the rare case where Claude returns an error mid-stream and
        // we still want to persist the partial.
        error: { type: String },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

// ---- Indexes ---------------------------------------------------------------

// Render a thread's history in order — the most common read path.
ChatMessageSchema.index({ threadId: 1, createdAt: 1 });

// "All chats for this document, newest first" — used when opening the
// Reader to populate margin notes.
ChatMessageSchema.index({ userId: 1, documentId: 1, createdAt: -1 });

// Scoped count for premium-tier soft caps.
ChatMessageSchema.index({ userId: 1, createdAt: -1 });

module.exports = model('ChatMessage', ChatMessageSchema);

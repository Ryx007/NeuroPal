const { Schema, model } = require('mongoose');

// Top-level AI companion chat — distinct from per-document Q&A. The
// companion knows about the user's condition profile + framework + active
// reading + recent state checkins (the "context bundle" assembled in the
// /companion/chat route).
//
// Why not reuse `ChatMessage`? Different access patterns: companion is
// always per-user across all documents, never document-scoped. Forcing
// it through ChatMessage makes the indexes ambiguous.

const ContextBundleSchema = new Schema(
    {
        // Snapshot of what we sent to Claude. Stored so we can reproduce
        // the exact behaviour later when debugging surprising answers.
        conditions: [{ type: String }],
        nervousState: {
            type: String,
            enum: ['green', 'yellow', 'red'],
        },
        activeDocumentIds: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
        weekStateAvg: { type: String },
        mvdRemaining: { type: Number, min: 0 },
        // Free-form additions — keep schemaless so we can iterate on the
        // bundle composition without migrations.
        extras: { type: Schema.Types.Mixed },
    },
    { _id: false },
);

const CompanionMessageSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        threadId: { type: String, required: true },

        role: {
            type: String,
            enum: ['user', 'assistant', 'system'],
            required: true,
        },
        content: { type: String, required: true, maxlength: 32000 },

        // Citations to peer-reviewed sources for any condition-related
        // claims the companion makes. Per the plan doc, the companion
        // ALWAYS cites — so this is required-by-convention for assistant
        // messages, even if validation isn't strict.
        citations: [
            {
                resourceId: { type: Schema.Types.ObjectId, ref: 'Resource' },
                title: { type: String },
                doi: { type: String },
                excerpt: { type: String, maxlength: 400 },
            },
        ],

        contextBundle: { type: ContextBundleSchema },

        model: { type: String },
        tokens: {
            prompt: { type: Number, min: 0 },
            completion: { type: Number, min: 0 },
            total: { type: Number, min: 0 },
        },
        latencyMs: { type: Number, min: 0 },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

// ---- Indexes ---------------------------------------------------------------

CompanionMessageSchema.index({ threadId: 1, createdAt: 1 });
CompanionMessageSchema.index({ userId: 1, createdAt: -1 });

module.exports = model('CompanionMessage', CompanionMessageSchema);

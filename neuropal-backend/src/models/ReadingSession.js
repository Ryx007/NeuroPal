const { Schema, model } = require('mongoose');

// One row per (user, document) — tracks resume position + cumulative time
// + completion. Updated on every meaningful reader event (pause, scroll,
// section change). Heartbeat-driven, so writes are throttled in the API.

const ReadingSessionSchema = new Schema(
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

        // 0..1 — pre-computed so the Library "X% complete" badge is one
        // field-fetch, not an aggregation.
        progress: { type: Number, min: 0, max: 1, default: 0 },

        lastWordIndex: { type: Number, min: 0, default: 0 },
        lastSectionId: { type: String },
        lastPage: { type: Number, min: 0 },

        // Aggregated time-on-page, in seconds. Incremented by reader
        // heartbeat. Useful for the weekly companion summary.
        timeSpentSec: { type: Number, min: 0, default: 0 },

        firstOpenedAt: { type: Date, default: () => new Date() },
        lastOpenedAt: { type: Date, default: () => new Date(), index: true },
        completedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

// ---- Indexes ---------------------------------------------------------------

// One session row per user-document pair.
ReadingSessionSchema.index({ userId: 1, documentId: 1 }, { unique: true });

// "Resume reading" home-page query: most recently opened, in-progress doc.
ReadingSessionSchema.index({ userId: 1, completedAt: 1, lastOpenedAt: -1 });

module.exports = model('ReadingSession', ReadingSessionSchema);

const { Schema, model } = require('mongoose');

// Curated science library — peer-reviewed papers / books / chapters that
// the science library (Phase 6) and the AI companion both pull from.
// Editorial: NO influencer content, every claim links to source.

const ResourceSchema = new Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 500 },
        authors: [{ type: String, trim: true }],
        journal: { type: String, trim: true },
        year: { type: Number, min: 1900, max: 2100 },
        // Sparseness is handled by the explicit unique partial index below
        // (`schema.index({ doi: 1 }, { unique, partialFilterExpression })`).
        // Don't add `sparse: true` here — it creates a second, conflicting
        // index and triggers a Mongoose duplicate-index warning at boot.
        doi: { type: String, lowercase: true, trim: true },
        url: { type: String },

        abstract: { type: String, maxlength: 8000 },
        // The plain-language summary surfaced in the mobile UI.
        plainSummary: { type: String, maxlength: 4000 },

        conditionTags: [
            {
                type: String,
                enum: [
                    'adhd',
                    'asd',
                    'audhd',
                    'bpd',
                    'ptsd',
                    'dyslexia',
                    'dyscalculia',
                    'spd',
                    'executive-function',
                    'time-perception',
                    'dbt',
                    'sleep',
                    'medication',
                ],
                index: true,
            },
        ],

        // Evidence grade — the field that powers the "Show me only RCTs+
        // meta-analyses" filter and the myth-busting flag.
        qualityType: {
            type: String,
            enum: ['meta-analysis', 'rct', 'review', 'study', 'case-report', 'opinion'],
            required: true,
        },

        // Optional myth-busting payload: when this resource specifically
        // contradicts a popular claim.
        mythBust: {
            commonClaim: { type: String, maxlength: 500 },
            evidence: { type: String, maxlength: 1000 },
        },

        // Editorial state — only `published` rows show up in the user-facing
        // library. Drafts let the curator stage entries.
        status: {
            type: String,
            enum: ['draft', 'review', 'published', 'retracted'],
            default: 'draft',
            index: true,
        },
        addedBy: { type: String }, // editor email/handle
        publishedAt: { type: Date },
    },
    { timestamps: true },
);

// ---- Indexes ---------------------------------------------------------------

// DOI is the strongest dedup key — but rows without a DOI shouldn't collide.
ResourceSchema.index(
    { doi: 1 },
    {
        unique: true,
        partialFilterExpression: { doi: { $type: 'string' } },
    },
);

// Library page primary query: condition + quality filter, newest first.
ResourceSchema.index({
    conditionTags: 1,
    qualityType: 1,
    publishedAt: -1,
});

// Free-text search powering the library search box.
ResourceSchema.index(
    { title: 'text', abstract: 'text', plainSummary: 'text' },
    {
        weights: { title: 10, plainSummary: 5, abstract: 1 },
        name: 'resource_text_search',
    },
);

module.exports = model('Resource', ResourceSchema);

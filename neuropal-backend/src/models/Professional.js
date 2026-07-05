const { Schema, model } = require('mongoose');

// Curated, **non-monetised** ND-affirming professional directory.
// Per the plan doc: NO paid placement, NO referral fees. Enforced at the
// schema level — there are no monetisation fields here. Don't add any.

const ProfessionalSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 200 },
        type: {
            type: String,
            enum: [
                'psychologist',
                'psychiatrist',
                'therapist',
                'coach',
                'occupational-therapist',
            ],
            required: true,
        },

        location: {
            country: { type: String, required: true, uppercase: true, maxlength: 2 }, // ISO-3166-1 alpha-2
            region: { type: String, trim: true },
            city: { type: String, trim: true },
            // GeoJSON Point, [lng, lat]. Used by 2dsphere index for "near me".
            coordinates: {
                type: { type: String, enum: ['Point'] },
                coordinates: {
                    type: [Number],
                    validate: {
                        validator: (v) => !v || (v.length === 2 && Math.abs(v[1]) <= 90 && Math.abs(v[0]) <= 180),
                        message: 'coordinates must be [lng, lat]',
                    },
                },
            },
        },

        conditionsSpecialised: [
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
                    'eating-disorders',
                    'cptsd',
                    'addiction',
                ],
            },
        ],
        approaches: [
            {
                type: String,
                enum: [
                    'dbt',
                    'cbt',
                    'emdr',
                    'act',
                    'somatic',
                    'ifs',
                    'psychodynamic',
                    'humanistic',
                ],
            },
        ],
        languages: [{ type: String, trim: true }],

        costRange: {
            type: String,
            enum: ['free', 'subsidised', 'low', 'medium', 'high'],
        },
        telehealth: { type: Boolean, default: false },
        website: { type: String },

        // Editorial verification flag. Unverified rows DO NOT appear in
        // user-facing search.
        verified: { type: Boolean, default: false, index: true },
        verifiedAt: { type: Date },
        verifiedBy: { type: String },

        // Soft-delete (in case a professional asks to be removed but we
        // want a tombstone for audit).
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

// ---- Indexes ---------------------------------------------------------------

ProfessionalSchema.index({ 'location.country': 1, 'location.city': 1 });
ProfessionalSchema.index({ conditionsSpecialised: 1 });
ProfessionalSchema.index({ approaches: 1 });
// Geo "find clinicians within 50km".
ProfessionalSchema.index({ 'location.coordinates': '2dsphere' });

// Free-text search on name + city.
ProfessionalSchema.index(
    { name: 'text', 'location.city': 'text' },
    { name: 'pro_text_search' },
);

module.exports = model('Professional', ProfessionalSchema);

const { Schema, model } = require('mongoose');

// ---- Reader tweaks (embedded) ---------------------------------------------
// Mirrors the same `TweaksState` shape the mobile app persists locally so
// that signing in on a new device hydrates settings from the server.
const TweaksSchema = new Schema(
    {
        theme: {
            type: String,
            enum: ['dark', 'sepia', 'light', 'contrast'],
            default: 'dark',
        },
        accent: {
            type: String,
            enum: ['blue', 'cyan', 'purple', 'green'],
            default: 'blue',
        },
        readerFont: {
            type: String,
            enum: ['inter', 'atkinson', 'dyslexic', 'lora', 'fraunces'],
            default: 'inter',
        },
        readerLayout: {
            type: String,
            enum: ['split', 'focus', 'paginated'],
            default: 'split',
        },
        density: {
            type: String,
            enum: ['calm', 'dense'],
            default: 'calm',
        },
        fontSize: { type: Number, min: 12, max: 36, default: 20 },
        lineSpacing: { type: Number, min: 1.0, max: 2.5, default: 1.7 },
        wpm: { type: Number, min: 80, max: 500, default: 225 },
        voice: {
            type: String,
            enum: ['soft', 'natural', 'deep'],
            default: 'soft',
        },
    },
    { _id: false },
);

// ---- Condition profile (embedded) -----------------------------------------
const ConditionProfileSchema = new Schema(
    {
        // Set of self-identified condition codes. Open-ended on purpose —
        // we won't gate features on diagnosis.
        conditions: [
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
                ],
            },
        ],
        energyPattern: {
            type: String,
            enum: ['morning', 'night', 'variable'],
        },
        primaryUse: {
            type: String,
            enum: ['reading', 'regulation', 'both'],
        },
        completedAt: { type: Date },
    },
    { _id: false },
);

// ---- Subscription / billing (embedded) ------------------------------------
// Lightweight — premium gates the AI companion / advanced analytics / body
// doubling rooms / financial module per the plan doc. Real billing lives in
// Stripe; this only stores the cached entitlement state.
const EntitlementSchema = new Schema(
    {
        tier: {
            type: String,
            enum: ['free', 'premium'],
            default: 'free',
        },
        renewsAt: { type: Date },
        stripeCustomerId: { type: String },
        stripeSubscriptionId: { type: String },
    },
    { _id: false },
);

// ---- User -----------------------------------------------------------------
const UserSchema = new Schema(
    {
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            // Coarse RFC-5322 sanity check — full validation is a server-side
            // verification email anyway.
            match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        },
        // Argon2id hash. Never store plaintext, never log this field.
        passwordHash: { type: String, required: true, select: false },

        // Display
        name: { type: String, trim: true, maxlength: 80 },
        avatarUrl: { type: String },

        // Locale / time
        timezone: { type: String, default: 'UTC' },
        locale: { type: String, default: 'en-IN' },

        // Embedded blocks
        tweaks: { type: TweaksSchema, default: () => ({}) },
        profile: { type: ConditionProfileSchema, default: () => ({}) },
        entitlement: { type: EntitlementSchema, default: () => ({}) },

        // Auth state
        emailVerifiedAt: { type: Date },
        // Refresh-token jti list for revocation. Cap at ~10 with a $slice
        // operator on push — handled in the auth controller.
        refreshTokenJtis: [{ type: String, select: false }],
        lastLoginAt: { type: Date },

        // Soft-delete (right-to-be-forgotten — purged after 30 days by job)
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

// ---- Indexes ---------------------------------------------------------------
// Email is the auth lookup key. Partial index excludes soft-deleted accounts
// so a fresh signup with a recycled email doesn't collide with a tombstone.
UserSchema.index(
    { email: 1 },
    {
        unique: true,
        partialFilterExpression: { deletedAt: null },
    },
);
UserSchema.index({ deletedAt: 1, updatedAt: 1 }); // purge job sweep
UserSchema.index({ 'entitlement.tier': 1, 'entitlement.renewsAt': 1 });

module.exports = model('User', UserSchema);

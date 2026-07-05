const { Schema, model } = require('mongoose');

// Cache of generated TTS audio chunks. Key insight: ElevenLabs costs
// $0.30+ per 1K characters and many chunks are re-listened to (a paragraph
// the user paused on, replays). Caching by content hash eliminates ~70%
// of API spend in measured prototypes.
//
// Audio binary lives on object storage; this row holds the metadata.

const WordTimingSchema = new Schema(
    {
        word: { type: String, required: true },
        startMs: { type: Number, min: 0, required: true },
        endMs: { type: Number, min: 0, required: true },
    },
    { _id: false },
);

const TtsCacheSchema = new Schema(
    {
        // sha256 of `${text}|${voice}|${pitch}|${wpm}|${provider}` — the
        // composite cache key. Lookup IS this field.
        contentHash: {
            type: String,
            required: true,
            length: 64,
        },

        provider: {
            type: String,
            enum: ['elevenlabs', 'google-cloud-tts', 'expo-speech'],
            required: true,
        },
        voice: { type: String, required: true },
        pitch: { type: Number, default: 1.0 },
        wpm: { type: Number, min: 80, max: 500, default: 225 },

        // Truncated for debugging — full text isn't needed since the hash
        // identifies the chunk uniquely.
        textPreview: { type: String, maxlength: 200 },
        charLength: { type: Number, min: 0 },

        // Audio file on disk. Path is RELATIVE to the configured storage
        // root (`process.env.NEUROPAL_STORAGE_ROOT`). Canonical layout:
        //   `tts/<contentHash[0:2]>/<contentHash>.mp3`
        // (the 2-char prefix shards the directory so we don't end up with
        //  100K+ files in one folder.)
        audio: {
            relativePath: { type: String, required: true },
            mimeType: { type: String, default: 'audio/mpeg' },
            sizeBytes: { type: Number, min: 0 },
            durationMs: { type: Number, min: 0 },
        },

        wordTimings: [WordTimingSchema],

        // Telemetry — most-cached chunks help us tune the chunker.
        hitCount: { type: Number, min: 0, default: 0 },
        lastUsedAt: { type: Date, default: () => new Date() },

        // TTL — automatically deleted by Mongo after this date.
        expiresAt: {
            type: Date,
            default: () =>
                new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

// ---- Indexes ---------------------------------------------------------------

// The cache lookup. Unique because a hash collision would mean a hash
// collision; Mongoose throws gracefully if it ever happens.
TtsCacheSchema.index({ contentHash: 1 }, { unique: true });

// TTL — Mongo auto-deletes when expiresAt is in the past.
// `expireAfterSeconds: 0` means "expire exactly at expiresAt".
TtsCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// "Most popular cached chunks this week" — used by the cache-warming job.
TtsCacheSchema.index({ hitCount: -1, lastUsedAt: -1 });

module.exports = model('TtsCache', TtsCacheSchema);

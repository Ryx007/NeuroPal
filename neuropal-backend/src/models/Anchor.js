const { Schema, model } = require('mongoose');

// Recurring daily anchor *template*. Per-day completion lives in DailyLog —
// don't confuse the two. An anchor is "what should happen", a DailyLog
// entry is "what did happen".

const AnchorSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        title: { type: String, required: true, trim: true, maxlength: 80 },
        subtitle: { type: String, trim: true, maxlength: 200 },

        // Local time-of-day in the user's timezone. Stored as int hour/min
        // (not a Date) because anchors recur — the absolute date is only
        // resolved when materialising a DailyLog.
        time: {
            hour: { type: Number, min: 0, max: 23, required: true },
            minute: { type: Number, min: 0, max: 59, required: true },
        },

        // Window before/after `time` during which the anchor is considered
        // "still on time". Wide windows for ADHD-friendly schedules.
        windowMinutesBefore: { type: Number, min: 0, max: 240, default: 30 },
        windowMinutesAfter: { type: Number, min: 0, max: 240, default: 30 },

        // 0=Sunday … 6=Saturday. Empty array = every day.
        daysOfWeek: [{ type: Number, min: 0, max: 6 }],

        // Material Symbols icon name for the mobile UI.
        icon: { type: String, default: 'event' },

        // Optional link into the framework — anchor "Focus block" might map
        // to a TaskMenu item, etc.
        category: {
            type: String,
            enum: [
                'medication',
                'meal',
                'movement',
                'focus',
                'social',
                'rest',
                'wind-down',
                'custom',
            ],
            default: 'custom',
        },

        // Push-notification preferences for this anchor.
        notify: {
            enabled: { type: Boolean, default: true },
            // Lead time in minutes — so a 9 am anchor with 5min lead pings at 8:55.
            leadMinutes: { type: Number, min: 0, max: 60, default: 0 },
        },

        archivedAt: { type: Date, default: null },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

// ---- Indexes ---------------------------------------------------------------

// Render the day's anchors in chronological order — the canonical Anchors
// page query.
AnchorSchema.index({
    userId: 1,
    deletedAt: 1,
    'time.hour': 1,
    'time.minute': 1,
});

// "What anchors fire in the next 30 minutes?" — push notification scheduler.
AnchorSchema.index({ userId: 1, archivedAt: 1, 'notify.enabled': 1 });

module.exports = model('Anchor', AnchorSchema);

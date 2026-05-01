const { Schema, model } = require('mongoose');

// One row per user per day. Holds:
//   • State checkins (morning/midday/evening) — drives the trend chart
//   • MVD task completion (instances of FrameworkConfig.mvdTemplate)
//   • Anchor completions (refs to Anchor templates)
//   • Protocol uses (TIPP / ACCEPTS / grounding sessions started today)
//   • Free-form notes
//
// Why one document per day instead of separate event rows? Because the
// vast majority of read paths are "show me today" or "show me last 7 days",
// which become 1–7 fast point reads. Event-style rows would force aggregation.

const StateCheckinSchema = new Schema(
    {
        state: {
            type: String,
            enum: ['green', 'yellow', 'red'],
            required: true,
        },
        at: { type: Date, default: () => new Date() },
        notes: { type: String, maxlength: 500 },
    },
    { _id: false },
);

const MvdTaskInstanceSchema = new Schema(
    {
        // Optional ref into the framework template; lets us survive the
        // user editing their template without orphaning today's tasks.
        templateId: { type: String },
        title: { type: String, required: true, maxlength: 200 },
        subtitle: { type: String, maxlength: 200 },
        zone: { type: String },
        done: { type: Boolean, default: false },
        doneAt: { type: Date },
    },
    { _id: true },
);

const AnchorCompletionSchema = new Schema(
    {
        anchorId: {
            type: Schema.Types.ObjectId,
            ref: 'Anchor',
            required: true,
        },
        completedAt: { type: Date, default: () => new Date() },
        // For "missed by 12 minutes" telemetry — populated at completion.
        scheduledFor: { type: Date },
    },
    { _id: false },
);

const ProtocolUseSchema = new Schema(
    {
        name: {
            type: String,
            enum: [
                'tipp',
                'accepts',
                'physiological-sigh',
                'grounding-5-4-3-2-1',
                'paced-breathing',
                'paired-muscle-relaxation',
                'opposite-action',
                'distress-tolerance',
            ],
            required: true,
        },
        startedAt: { type: Date, default: () => new Date() },
        completedAt: { type: Date },
        triggeredBy: {
            type: String,
            enum: ['self', 'red-state', 'companion-suggestion', 'watch-haptic'],
            default: 'self',
        },
        // Optional after-action notes — VERY useful for the user reviewing
        // their own log later.
        notes: { type: String, maxlength: 1000 },
    },
    { _id: true },
);

const DailyLogSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        // Date in YYYY-MM-DD form **in the user's timezone**. Strings, not
        // Date objects — avoids tz drift when the user crosses time zones.
        // Resolved by the API layer using user.timezone before insert.
        date: {
            type: String,
            required: true,
            match: /^\d{4}-\d{2}-\d{2}$/,
        },

        checkins: {
            morning: { type: StateCheckinSchema },
            midday: { type: StateCheckinSchema },
            evening: { type: StateCheckinSchema },
            // Catch-all for any extra ad-hoc checkins.
            other: [StateCheckinSchema],
        },

        mvdTasks: [MvdTaskInstanceSchema],
        anchorCompletions: [AnchorCompletionSchema],
        protocols: [ProtocolUseSchema],

        notes: { type: String, maxlength: 4000 },

        // Pre-computed roll-ups for the weekly companion summary so we
        // don't re-aggregate from scratch on every Sunday cron run.
        rollup: {
            stateAvg: {
                type: String,
                enum: ['green', 'yellow', 'red'],
            },
            mvdCompleteCount: { type: Number, min: 0, default: 0 },
            anchorsHitCount: { type: Number, min: 0, default: 0 },
            protocolsCount: { type: Number, min: 0, default: 0 },
        },
    },
    { timestamps: true },
);

// ---- Indexes ---------------------------------------------------------------

// One log per user per day — the canonical natural key.
DailyLogSchema.index({ userId: 1, date: 1 }, { unique: true });

// 7-day window: "give me last week's logs in date order".
DailyLogSchema.index({ userId: 1, date: -1 });

module.exports = model('DailyLog', DailyLogSchema);

const { Schema, model } = require('mongoose');

// Manual spending log used by the financial regulation module (Phase 7).
// NO bank API integration — by design. The point is conscious capture +
// state correlation, not automation.
//
// Copy throughout the app must be ZERO-SHAME. Schema-level reflection of
// that: no "wasted", "frivolous", "essential" enum — just `category` with
// neutral terms.

const SpendingLogSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, required: true, default: 'INR', maxlength: 3 },

        category: {
            type: String,
            enum: [
                'food',
                'groceries',
                'transport',
                'housing',
                'utilities',
                'health',
                'medication',
                'subscription',
                'social',
                'education',
                'gift',
                'savings',
                'other',
            ],
            default: 'other',
        },

        note: { type: String, maxlength: 500 },

        // The state at the time of logging — drives the
        // "spending in red state vs green state" correlation chart.
        nervousStateAtTime: {
            type: String,
            enum: ['green', 'yellow', 'red'],
        },

        // Whether the user honoured the 10-min pre-purchase pause.
        // Optional — only set if the entry was made after the pause flow.
        pausedBeforePurchase: { type: Boolean },

        // Backdated to the actual transaction time, not the log time.
        spentAt: { type: Date, required: true, default: () => new Date() },
    },
    { timestamps: true },
);

// ---- Indexes ---------------------------------------------------------------

// Primary query: timeline of this user's spending, newest first.
SpendingLogSchema.index({ userId: 1, spentAt: -1 });

// "Spending broken down by state for this user, this month" — supports the
// state-correlation chart on the Financial page.
SpendingLogSchema.index({ userId: 1, nervousStateAtTime: 1, spentAt: -1 });

// "How much did I spend in subscriptions this year" — category aggregations.
SpendingLogSchema.index({ userId: 1, category: 1, spentAt: -1 });

module.exports = model('SpendingLog', SpendingLogSchema);

const { Schema, model } = require('mongoose');

// Day sync (docs/DAY-SYNC.md): one document per Home check-in. A check-in
// has no id — `at` is its identity — so {userId, at} is unique and every
// write is an idempotent upsert on it. The server keeps the newest 5000.
//
// `gen` is the DayState generation the check-in was written under. DELETE
// /api/me/day bumps the generation and then removes older rows; a sync that
// raced the erase and wrote a row under the old generation afterwards leaves
// a row that every read already ignores (reads ask for the current `gen`),
// so an erase can't be undone by a request that was in flight.
const DayCheckinSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        gen: { type: Number, required: true, min: 1 },
        at: { type: Date, required: true },
        state: {
            type: String,
            enum: ['green', 'yellow', 'red'],
            required: true,
        },
        level: { type: Number, min: 0, max: 1, default: null },
    },
    { versionKey: false },
);

DayCheckinSchema.index({ userId: 1, at: 1 }, { unique: true });
// "The newest N of the current generation" (the answer, the 5000 cap) walks
// this index alone.
DayCheckinSchema.index({ userId: 1, gen: 1, at: 1 });

module.exports = model('DayCheckin', DayCheckinSchema);

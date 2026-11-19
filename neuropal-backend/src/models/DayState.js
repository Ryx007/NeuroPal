const { Schema, model } = require('mongoose');

// Day sync (docs/DAY-SYNC.md): ONE document per user holding the merged
// anchors, tasks, to-dos and brain dump — live items and tombstones alike.
// Check-ins live one per document in DayCheckin.
//
// The items are plain objects that services/dayMerge.js rebuilds field by
// field before every write, so the arrays are Mixed on purpose: a Mongoose
// sub-schema would add _id fields and defaults the contract doesn't have
// (an optional field with no value is left out, never null).
//
//   gen  starts at 1; DELETE /api/me/day adds 1 ("erase everywhere", §7).
//   rev  goes up by one each time a sync changes what is stored. It is also
//        the compare-and-set token of the read-merge-write in routes/day.js:
//        a write only lands if `rev` is still the one that was read.
const DayStateSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        gen: { type: Number, required: true, min: 1, default: 1 },
        rev: { type: Number, required: true, min: 0, default: 0 },
        anchors: { type: [Schema.Types.Mixed], default: [] },
        tasks: { type: [Schema.Types.Mixed], default: [] },
        todos: { type: [Schema.Types.Mixed], default: [] },
        dump: { type: [Schema.Types.Mixed], default: [] },
    },
    { timestamps: true, versionKey: false },
);

// One day per user: two first syncs racing each other can't both insert.
DayStateSchema.index({ userId: 1 }, { unique: true });

module.exports = model('DayState', DayStateSchema);

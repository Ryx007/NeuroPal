const { Schema, model } = require('mongoose');

// P5 — persisted visualizer simulations. The SPEC is saved (never a video),
// so a saved sim re-renders live and stays interactive on any device.
// kind 'template' points at a client-side verified template by id;
// kind 'ai' stores the full LLM-generated spec (title/blurb/sliders/drawJs)
// and is always presented as unverified physics in the UI.

const SavedSimulationSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },

        title: { type: String, trim: true, maxlength: 160, required: true },

        kind: {
            type: String,
            enum: ['template', 'ai'],
            required: true,
        },

        // kind 'template'
        templateId: { type: String, trim: true, maxlength: 60 },

        // kind 'ai' — same shape POST /api/viz/spec returns
        spec: {
            title: { type: String, trim: true, maxlength: 160 },
            blurb: { type: String, trim: true, maxlength: 500 },
            sliders: [
                {
                    id: { type: String, trim: true, maxlength: 40 },
                    label: { type: String, trim: true, maxlength: 80 },
                    min: Number,
                    max: Number,
                    step: Number,
                    value: Number,
                    _id: false,
                },
            ],
            drawJs: { type: String, maxlength: 20000 },
        },

        // soft delete — house pattern
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

SavedSimulationSchema.index({ userId: 1, createdAt: -1 });

module.exports = model('SavedSimulation', SavedSimulationSchema);

const { Schema, model } = require('mongoose');

// SCAFFOLD framework config — one document per user. All template-level
// data: float zones, task menus per zone, MVD template, derivation log,
// framework-evolution journal entries.
//
// Per-day instantiations of these templates live in DailyLog so that
// changing a template doesn't rewrite history.

const FloatZoneSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 60 },
        // Energy tier this zone targets. Lower = harder to do.
        energyLevel: {
            type: String,
            enum: ['low', 'medium', 'high', 'hyperfocus'],
            required: true,
        },
        color: { type: String }, // hex; for the mobile UI
    },
    { _id: true },
);

const TaskMenuItemSchema = new Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 200 },
        // The micro-entry — the "first 30 seconds" version of the task.
        // Plan doc calls this enforcement out as non-negotiable.
        microEntry: { type: String, required: true, maxlength: 200 },
        demand: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'medium',
        },
        zoneId: { type: Schema.Types.ObjectId, required: true },
    },
    { _id: true },
);

const MvdTemplateItemSchema = new Schema(
    {
        title: { type: String, required: true, maxlength: 200 },
        subtitle: { type: String, maxlength: 200 },
        zoneId: { type: Schema.Types.ObjectId },
    },
    { _id: true },
);

const FrameworkEvolutionEntrySchema = new Schema(
    {
        at: { type: Date, default: () => new Date() },
        kind: {
            type: String,
            enum: ['anchor-added', 'zone-added', 'menu-edited', 'mvd-changed', 'note'],
            required: true,
        },
        summary: { type: String, required: true, maxlength: 500 },
        // For diff-style "what changed" rendering in the journal view.
        before: { type: Schema.Types.Mixed },
        after: { type: Schema.Types.Mixed },
    },
    { _id: true },
);

const FrameworkConfigSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        floatZones: [FloatZoneSchema],
        taskMenu: [TaskMenuItemSchema],
        mvdTemplate: [MvdTemplateItemSchema],
        evolutionLog: [FrameworkEvolutionEntrySchema],

        // Last time the MVD generator ran — drives the "today's MVD"
        // suggestion in the Home page.
        mvdLastGeneratedAt: { type: Date },
    },
    { timestamps: true },
);

// ---- Indexes ---------------------------------------------------------------

// One config per user.
FrameworkConfigSchema.index({ userId: 1 }, { unique: true });

module.exports = model('FrameworkConfig', FrameworkConfigSchema);

const { Schema, model } = require('mongoose');

// P6 — notes, BOTH kinds through one synced model:
//   typed — canonical content is Markdown (inline $…$ / $$…$$ math allowed;
//           the client renders it with the reader's own math pipeline)
//   ink   — the S-pen stroke arrays that previously lived only in
//           AsyncStorage (local-only, never synced — the P6 gap)
// `documentId` + `anchor` optionally attach a note to a reading position
// (the reader's word-index space, plus the P4 page when known).

const NoteSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        documentId: {
            type: Schema.Types.ObjectId,
            ref: 'Document',
            default: null,
            index: true,
        },
        anchor: {
            wordStart: { type: Number, min: 0, default: null },
            wordEnd: { type: Number, min: 0, default: null },
            page: { type: Number, min: 1, default: null },
        },

        kind: {
            type: String,
            enum: ['typed', 'ink'],
            required: true,
        },

        title: { type: String, trim: true, maxlength: 200, default: 'Untitled note' },

        // kind 'typed'
        contentMarkdown: { type: String, maxlength: 200000 },

        // kind 'ink' — [{ points: [[x,y],…], color, width }]
        strokes: { type: Schema.Types.Mixed },

        // soft delete — house pattern
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

NoteSchema.index({ userId: 1, updatedAt: -1 });

module.exports = model('Note', NoteSchema);

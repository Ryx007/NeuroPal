const { Schema, model } = require('mongoose');

// P6 — notes, BOTH kinds through one synced model:
//   typed — canonical content is Markdown (inline $…$ / $$…$$ math allowed;
//           the client renders it with the reader's own math pipeline)
//   ink   — the S-pen stroke arrays that previously lived only in
//           AsyncStorage (local-only, never synced — the P6 gap)
// Issue 2 (2026-07-19) — 'canvas' merges both onto ONE surface (Samsung
// Notes style): positioned text `blocks` + `strokes` on the same page.
// Legacy typed/ink notes upgrade to 'canvas' losslessly the first time the
// unified editor saves them (the only kind change the API permits).
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
            enum: ['typed', 'ink', 'canvas'],
            required: true,
        },

        title: { type: String, trim: true, maxlength: 200, default: 'Untitled note' },

        // kind 'typed'
        contentMarkdown: { type: String, maxlength: 200000 },

        // kinds 'ink' + 'canvas' — [{ points: [[x,y,pressure?],…], color, width }]
        strokes: { type: Schema.Types.Mixed },

        // kind 'canvas' — positioned text boxes on the same surface:
        // [{ id, type:'text', x, y, w, content:<Markdown> }]
        blocks: { type: Schema.Types.Mixed },

        // soft delete — house pattern
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

NoteSchema.index({ userId: 1, updatedAt: -1 });

module.exports = model('Note', NoteSchema);

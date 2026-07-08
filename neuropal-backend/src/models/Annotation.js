const { Schema, model } = require('mongoose');

// Reader annotations: highlights, bookmarks, and margin notes. Anchored to
// the document's word-index space (the same global index the karaoke reader
// uses), so an annotation survives re-renders and maps 1:1 onto the text
// view. `page` is stored when created from the Original-pages view.

const AnnotationSchema = new Schema(
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
            required: true,
            index: true,
        },

        kind: {
            type: String,
            enum: ['highlight', 'bookmark'],
            required: true,
        },

        // Word-index anchor (global index into the reader's word array).
        // For bookmarks wordEnd === wordStart.
        wordStart: { type: Number, required: true, min: 0 },
        wordEnd: { type: Number, required: true, min: 0 },

        // Display color (theme token name or hex) — highlights only.
        color: { type: String, trim: true, maxlength: 32 },

        // The selected text (or nearby text for bookmarks) so the annotation
        // is meaningful in lists even without loading the document.
        excerpt: { type: String, trim: true, maxlength: 600 },

        // Optional user note attached to a highlight.
        note: { type: String, trim: true, maxlength: 4000 },

        // Original-pages context, when known.
        page: { type: Number, min: 1 },

        deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

AnnotationSchema.index({ userId: 1, documentId: 1, wordStart: 1 });

module.exports = model('Annotation', AnnotationSchema);

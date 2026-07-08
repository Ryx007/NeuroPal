const { Router } = require('express');

const { Annotation, Document } = require('../models');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

// Highlights + bookmarks, anchored to the reader's word-index space.
//   GET    /api/documents/:id/annotations
//   POST   /api/documents/:id/annotations   { kind, wordStart, wordEnd, color?, excerpt?, note?, page? }
//   PATCH  /api/annotations/:id             { color?, note? }
//   DELETE /api/annotations/:id             (soft delete)

const router = Router();

async function ownedDocument(req, res) {
    const doc = await Document.findOne({
        _id: req.params.id,
        userId: req.userId,
        deletedAt: null,
    }).select('_id');
    if (!doc) {
        res.status(404).json({ error: 'document not found' });
        return null;
    }
    return doc;
}

router.get(
    '/documents/:id/annotations',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await ownedDocument(req, res);
        if (!doc) return;
        const items = await Annotation.find({
            userId: req.userId,
            documentId: doc._id,
            deletedAt: null,
        })
            .sort({ wordStart: 1 })
            .lean();
        res.json(items);
    }),
);

router.post(
    '/documents/:id/annotations',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await ownedDocument(req, res);
        if (!doc) return;
        const { kind, wordStart, wordEnd, color, excerpt, note, page } =
            req.body || {};
        if (!['highlight', 'bookmark'].includes(kind)) {
            return res.status(400).json({ error: 'kind must be highlight or bookmark' });
        }
        if (!Number.isInteger(wordStart) || wordStart < 0) {
            return res.status(400).json({ error: 'wordStart is required' });
        }
        const end = Number.isInteger(wordEnd) ? wordEnd : wordStart;

        const annotation = await Annotation.create({
            userId: req.userId,
            documentId: doc._id,
            kind,
            wordStart,
            wordEnd: Math.max(wordStart, end),
            color,
            excerpt,
            note,
            page,
        });
        res.status(201).json(annotation);
    }),
);

router.patch(
    '/annotations/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
        const annotation = await Annotation.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        });
        if (!annotation) return res.status(404).json({ error: 'annotation not found' });

        const { color, note } = req.body || {};
        if (typeof color === 'string') annotation.color = color.slice(0, 32);
        if (typeof note === 'string') annotation.note = note.slice(0, 4000);
        await annotation.save();
        res.json(annotation);
    }),
);

router.delete(
    '/annotations/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
        const annotation = await Annotation.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        });
        if (!annotation) return res.status(404).json({ error: 'annotation not found' });
        annotation.deletedAt = new Date();
        await annotation.save();
        res.json({ ok: true });
    }),
);

module.exports = router;

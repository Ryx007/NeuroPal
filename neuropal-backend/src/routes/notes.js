const { Router } = require('express');

const { Note } = require('../models');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

// P6 — notes CRUD. Typed notes carry canonical Markdown; ink notes carry
// stroke arrays. Both sync through the Mini (source of truth for anything
// synced), so a note written on the phone is on the laptop on next fetch.

const router = Router();

function pickAnchor(anchor) {
    if (!anchor || typeof anchor !== 'object') return undefined;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return {
        wordStart: num(anchor.wordStart),
        wordEnd: num(anchor.wordEnd),
        page: num(anchor.page),
    };
}

function validateBody(body, { partial = false } = {}) {
    const out = {};
    if (body.kind !== undefined || !partial) {
        if (!['typed', 'ink'].includes(body.kind)) return { error: "kind must be 'typed' or 'ink'" };
        out.kind = body.kind;
    }
    if (body.title !== undefined) {
        if (typeof body.title !== 'string') return { error: 'title must be a string' };
        out.title = body.title.trim().slice(0, 200) || 'Untitled note';
    }
    if (body.contentMarkdown !== undefined) {
        if (typeof body.contentMarkdown !== 'string') return { error: 'contentMarkdown must be a string' };
        if (body.contentMarkdown.length > 200000) return { error: 'contentMarkdown too large (200k chars max)' };
        out.contentMarkdown = body.contentMarkdown;
    }
    if (body.strokes !== undefined) {
        if (!Array.isArray(body.strokes)) return { error: 'strokes must be an array' };
        out.strokes = body.strokes;
    }
    if (body.documentId !== undefined) out.documentId = body.documentId || null;
    if (body.anchor !== undefined) out.anchor = pickAnchor(body.anchor);
    return { out };
}

// ---------------------------------------------------------------------------
// GET /api/notes[?documentId=] → Note[] (recent first, soft-deleted excluded)
// ---------------------------------------------------------------------------
router.get(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
        const filter = { userId: req.userId, deletedAt: null };
        const docId = String(req.query.documentId || '').trim();
        if (docId) filter.documentId = docId;
        const notes = await Note.find(filter).sort({ updatedAt: -1 }).lean();
        res.json(notes);
    }),
);

// ---------------------------------------------------------------------------
// POST /api/notes  body: { kind, title?, contentMarkdown?, strokes?,
//                          documentId?, anchor? }
// ---------------------------------------------------------------------------
router.post(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
        const { out, error } = validateBody(req.body || {});
        if (error) return res.status(400).json({ error });
        const note = await Note.create({ ...out, userId: req.userId });
        res.status(201).json(note);
    }),
);

// ---------------------------------------------------------------------------
// PUT /api/notes/:id — partial update (title/content/strokes/anchor)
// ---------------------------------------------------------------------------
router.put(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
        const note = await Note.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        });
        if (!note) return res.status(404).json({ error: 'note not found' });
        const { out, error } = validateBody(req.body || {}, { partial: true });
        if (error) return res.status(400).json({ error });
        delete out.kind; // a note never changes kind
        Object.assign(note, out);
        await note.save();
        res.json(note);
    }),
);

// ---------------------------------------------------------------------------
// DELETE /api/notes/:id — soft delete (house pattern)
// ---------------------------------------------------------------------------
router.delete(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
        const note = await Note.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        });
        if (!note) return res.status(404).json({ error: 'note not found' });
        note.deletedAt = new Date();
        await note.save();
        res.json({ ok: true });
    }),
);

module.exports = router;

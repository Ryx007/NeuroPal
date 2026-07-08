const path = require('path');
const fs = require('fs/promises');
const { Router } = require('express');
const multer = require('multer');

const { Document, DocumentChunk, ReadingSession } = require('../models');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { ingestDocument, deleteDocumentChunks } = require('../services/ingestPipeline');

const STORAGE_ROOT = process.env.STORAGE_ROOT || './storage';

// ---- multer config ---------------------------------------------------------
//
// Files land at ./storage/documents/<userId>/<filename> per spec.
//
// requireAuth must run BEFORE this middleware so multer's destination
// function can read req.userId off the JWT-authenticated request. The
// upload route below composes them in that order.
const upload = multer({
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            try {
                const dir = path.resolve(
                    STORAGE_ROOT,
                    'documents',
                    String(req.userId),
                );
                await fs.mkdir(dir, { recursive: true });
                cb(null, dir);
            } catch (err) {
                cb(err);
            }
        },
        filename: (req, file, cb) => {
            // Timestamp+random prefix guarantees uniqueness — without it a
            // second upload named "notes.pdf" silently overwrites the first
            // document's bytes on disk while its Document row still points
            // at the shared path (raw-text fallback + reingest would then
            // serve/ingest the WRONG file's content).
            const safe = file.originalname
                .replace(/[^A-Za-z0-9._-]/g, '_')
                .slice(0, 180);
            const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            cb(null, `${unique}-${safe}`);
        },
    }),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
    },
});

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/documents/upload
// multipart/form-data with field `file`. Optional body: title, subtitle.
// returns: the created Document (status='pending'; ingest runs in background)
// ---------------------------------------------------------------------------
router.post(
    '/upload',
    requireAuth,
    upload.single('file'),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'file is required' });
        }

        const relativePath = path.posix.join(
            'documents',
            String(req.userId),
            req.file.filename,
        );

        const doc = await Document.create({
            userId: req.userId,
            title:
                (req.body?.title || '').trim() ||
                req.file.originalname.replace(/\.[^.]+$/, ''),
            subtitle: (req.body?.subtitle || '').trim() || undefined,
            type: typeFromMime(req.file.mimetype),
            file: {
                relativePath,
                sizeBytes: req.file.size,
                mimeType: req.file.mimetype,
            },
            status: 'pending',
        });

        // Fire-and-forget — ingestPipeline catches its own errors and writes
        // them back to the Document row. We don't await so the client gets
        // an immediate 201 and can poll status.
        ingestDocument(doc._id).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[upload] ingest kickoff failed:', err);
        });

        res.status(201).json(doc);
    }),
);

// ---------------------------------------------------------------------------
// GET /api/documents
// ---------------------------------------------------------------------------
router.get(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
        const docs = await Document.find({
            userId: req.userId,
            deletedAt: null,
        })
            .sort({ createdAt: -1 })
            .lean();
        res.json(docs);
    }),
);

// ---------------------------------------------------------------------------
// GET /api/documents/:id
// ---------------------------------------------------------------------------
router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await Document.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        }).lean();
        if (!doc) return res.status(404).json({ error: 'document not found' });
        res.json(doc);
    }),
);

// ---------------------------------------------------------------------------
// GET /api/documents/:id/text
// Used by the reader for TTS playback. Prefers ingested chunks (clean text)
// and falls back to the raw on-disk file if ingest hasn't completed yet.
// ---------------------------------------------------------------------------
router.get(
    '/:id/text',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await Document.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        }).lean();
        if (!doc) return res.status(404).json({ error: 'document not found' });

        const chunks = await DocumentChunk.find({ documentId: doc._id })
            .sort({ chunkIndex: 1 })
            .select('text chunkIndex')
            .lean();

        if (chunks.length > 0) {
            return res.json({
                id: doc._id,
                title: doc.title,
                text: chunks.map((c) => c.text).join('\n\n'),
                pageCount: doc.pageCount,
                wordCount: doc.wordCount,
                source: 'chunks',
            });
        }

        // Fallback: raw file. Useful while a doc is still pending/parsing.
        if (!doc.file?.relativePath) {
            return res.status(404).json({ error: 'file path missing on document' });
        }
        const absPath = path.resolve(STORAGE_ROOT, doc.file.relativePath);
        try {
            const text = await fs.readFile(absPath, 'utf-8');
            res.json({
                id: doc._id,
                title: doc.title,
                text,
                pageCount: doc.pageCount,
                wordCount: doc.wordCount,
                source: 'raw-file',
            });
        } catch (err) {
            if (err.code === 'ENOENT') {
                return res.status(404).json({ error: 'file not on disk' });
            }
            throw err;
        }
    }),
);

// ---------------------------------------------------------------------------
// PATCH /api/documents/:id/progress
// body: { progress, lastWordIndex, lastPage, timeSpentSec }
// Throttled heartbeat from the reader. Upserts a ReadingSession.
// ---------------------------------------------------------------------------
router.patch(
    '/:id/progress',
    requireAuth,
    asyncHandler(async (req, res) => {
        // Verify the document belongs to the user first — cheap guard against
        // sending heartbeats with someone else's docId.
        const doc = await Document.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        }).select('_id');
        if (!doc) return res.status(404).json({ error: 'document not found' });

        const { progress, lastWordIndex, lastPage, timeSpentSec } = req.body || {};

        const set = { lastOpenedAt: new Date() };
        if (typeof progress === 'number') {
            set.progress = Math.max(0, Math.min(1, progress));
            if (set.progress >= 1) set.completedAt = new Date();
        }
        if (typeof lastWordIndex === 'number') set.lastWordIndex = lastWordIndex;
        if (typeof lastPage === 'number') set.lastPage = lastPage;

        const inc = {};
        if (typeof timeSpentSec === 'number' && timeSpentSec > 0) {
            inc.timeSpentSec = Math.min(timeSpentSec, 600); // clamp per heartbeat
        }

        const update = { $set: set, $setOnInsert: { firstOpenedAt: new Date() } };
        if (Object.keys(inc).length) update.$inc = inc;

        const session = await ReadingSession.findOneAndUpdate(
            { userId: req.userId, documentId: doc._id },
            update,
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        res.json(session);
    }),
);

// ---------------------------------------------------------------------------
// POST /api/documents/:id/reingest
// Wipes the doc's chunks (Mongo + Qdrant) and kicks ingest off again.
// Useful when you change embedding model or the doc was uploaded before the
// ingest pipeline existed.
// ---------------------------------------------------------------------------
router.post(
    '/:id/reingest',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await Document.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        });
        if (!doc) return res.status(404).json({ error: 'document not found' });

        await deleteDocumentChunks(doc._id);

        doc.status = 'pending';
        doc.progress = 0;
        doc.ingestError = undefined;
        doc.ingestStartedAt = undefined;
        doc.ingestFinishedAt = undefined;
        await doc.save();

        ingestDocument(doc._id).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[reingest] kickoff failed:', err);
        });

        res.json({ ok: true, status: doc.status });
    }),
);

// ---------------------------------------------------------------------------
// DELETE /api/documents/:id
// Soft-delete the document. Cascade: remove chunks (Mongo + Qdrant) and
// the user's ReadingSession for this doc. The file on disk is NOT deleted
// here — the daily soft-delete sweep handles that 30 days later.
// ---------------------------------------------------------------------------
router.delete(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await Document.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        });
        if (!doc) return res.status(404).json({ error: 'document not found' });

        await deleteDocumentChunks(doc._id);
        await ReadingSession.deleteOne({
            userId: req.userId,
            documentId: doc._id,
        });

        doc.deletedAt = new Date();
        await doc.save();

        res.json({ ok: true });
    }),
);

// ---- helpers ---------------------------------------------------------------

function typeFromMime(mime) {
    switch (mime) {
        case 'application/pdf':
            return 'pdf';
        case 'application/epub+zip':
            return 'epub';
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            return 'docx';
        case 'text/plain':
            return 'txt';
        default:
            return 'pdf';
    }
}

module.exports = router;

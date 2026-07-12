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
        fileSize: 300 * 1024 * 1024, // 300MB — full-color textbooks get huge
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
            type: typeFromUpload(req.file.mimetype, req.file.originalname),
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
// GET /api/documents?type=&status=&q=
//
// P4: optional filters. The app filters client-side (its poll re-fetches the
// whole list anyway); these params serve curl/scripts and any future paging.
// 'processing' is accepted as a status alias for the four in-flight states.
// Each doc is enriched with readingProgress/lastReadAt from ReadingSession —
// the list payload is otherwise UNDECIDABLE for read/unread chips.
// ---------------------------------------------------------------------------
const DOC_TYPES = ['pdf', 'epub', 'docx', 'pptx', 'md', 'txt', 'djvu', 'arxiv', 'web'];
const DOC_STATUSES = ['pending', 'parsing', 'chunking', 'embedding', 'ready', 'failed'];
const PROCESSING_STATUSES = ['pending', 'parsing', 'chunking', 'embedding'];

router.get(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
        const type = String(req.query.type || '').trim().toLowerCase();
        const status = String(req.query.status || '').trim().toLowerCase();
        const q = String(req.query.q || '').trim();

        const filter = { userId: req.userId, deletedAt: null };
        if (type) {
            if (!DOC_TYPES.includes(type)) {
                return res.status(400).json({ error: `invalid type (one of: ${DOC_TYPES.join(', ')})` });
            }
            filter.type = type;
        }
        if (status) {
            if (status === 'processing') filter.status = { $in: PROCESSING_STATUSES };
            else if (DOC_STATUSES.includes(status)) filter.status = status;
            else return res.status(400).json({ error: `invalid status (one of: processing, ${DOC_STATUSES.join(', ')})` });
        }
        if (q) {
            // escaped substring match — $text is tokenized and misses partial words
            const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [
                { title: { $regex: safe, $options: 'i' } },
                { subtitle: { $regex: safe, $options: 'i' } },
            ];
        }

        const docs = await Document.find(filter).sort({ createdAt: -1 }).lean();

        // one batch lookup — reading state per doc (progress 0..1, last opened)
        const sessions = await ReadingSession.find({
            userId: req.userId,
            documentId: { $in: docs.map((d) => d._id) },
        })
            .select('documentId progress lastOpenedAt completedAt')
            .lean();
        const byDoc = new Map(sessions.map((s) => [String(s.documentId), s]));
        for (const d of docs) {
            const s = byDoc.get(String(d._id));
            d.readingProgress = s ? s.progress || 0 : 0;
            d.lastReadAt = s ? s.lastOpenedAt || null : null;
        }

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
            .select('text chunkIndex overlapChars')
            .lean();

        if (chunks.length > 0) {
            return res.json({
                id: doc._id,
                title: doc.title,
                // slice off each chunk's RAG overlap so the reading text has
                // no duplicated sentences at chunk boundaries
                text: chunks
                    .map((c) => (c.overlapChars ? c.text.slice(c.overlapChars) : c.text))
                    .join('\n\n'),
                pageCount: doc.pageCount,
                wordCount: doc.wordCount,
                // real chapter structure (P2) — startParagraph indexes this
                // exact text's paragraph list
                toc: doc.toc || [],
                // real page anchors (P4) — same paragraph domain as toc
                pageMap: doc.pageMap || [],
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
// PATCH /api/documents/:id
// body: { title?, subtitle? } — rename from the library UI.
// ---------------------------------------------------------------------------
router.patch(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await Document.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        });
        if (!doc) return res.status(404).json({ error: 'document not found' });

        const { title, subtitle } = req.body || {};
        if (typeof title === 'string' && title.trim()) {
            doc.title = title.trim().slice(0, 500);
        }
        if (typeof subtitle === 'string') {
            doc.subtitle = subtitle.trim().slice(0, 500) || undefined;
        }
        await doc.save();
        res.json(doc);
    }),
);

// ---------------------------------------------------------------------------
// GET  /api/documents/:id/raw   — the verbatim on-disk source (md/txt only)
// PUT  /api/documents/:id/raw   — overwrite it and reingest ("edit on the fly")
//
// Restricted to plain-text formats: for binary types the on-disk file is not
// meaningfully editable and serving it as utf-8 would be garbage.
// ---------------------------------------------------------------------------
const RAW_EDITABLE_TYPES = new Set(['md', 'txt']);

router.get(
    '/:id/raw',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await Document.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        }).lean();
        if (!doc) return res.status(404).json({ error: 'document not found' });
        if (!RAW_EDITABLE_TYPES.has(doc.type)) {
            return res
                .status(400)
                .json({ error: `raw editing is only available for markdown and txt (this is ${doc.type})` });
        }
        if (!doc.file?.relativePath) {
            return res.status(404).json({ error: 'file path missing on document' });
        }
        const absPath = path.resolve(STORAGE_ROOT, doc.file.relativePath);
        try {
            const text = await fs.readFile(absPath, 'utf-8');
            res.json({ id: doc._id, title: doc.title, type: doc.type, text });
        } catch (err) {
            if (err.code === 'ENOENT') {
                return res.status(404).json({ error: 'file not on disk' });
            }
            throw err;
        }
    }),
);

router.put(
    '/:id/raw',
    requireAuth,
    asyncHandler(async (req, res) => {
        const { text } = req.body || {};
        if (typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ error: 'text is required' });
        }

        const doc = await Document.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        });
        if (!doc) return res.status(404).json({ error: 'document not found' });
        if (!RAW_EDITABLE_TYPES.has(doc.type)) {
            return res
                .status(400)
                .json({ error: `raw editing is only available for markdown and txt (this is ${doc.type})` });
        }
        if (!doc.file?.relativePath) {
            return res.status(404).json({ error: 'file path missing on document' });
        }

        const absPath = path.resolve(STORAGE_ROOT, doc.file.relativePath);
        await fs.writeFile(absPath, text, 'utf-8');
        doc.file.sizeBytes = Buffer.byteLength(text, 'utf-8');
        doc.status = 'pending';
        await doc.save();

        // Same wipe-then-reingest flow as POST /:id/reingest — the edited
        // text replaces the chunks/vectors so reader + RAG see the new copy.
        await deleteDocumentChunks(doc._id);
        ingestDocument(doc._id).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[raw-edit] reingest kickoff failed:', err);
        });

        res.json(doc);
    }),
);

// ---------------------------------------------------------------------------
// GET /api/documents/:id/page/:n
// Renders page N of a PDF to a JPEG (pdftoppm), cached on disk. Powers the
// reader's "Original pages" view — true visual fidelity incl. equations.
// ---------------------------------------------------------------------------
const PAGE_RENDER_DPI = 150;

router.get(
    '/:id/page/:n',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await Document.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        }).lean();
        if (!doc) return res.status(404).json({ error: 'document not found' });
        // 'arxiv' documents are PDFs on disk (search import) — same renderer.
        if (doc.type !== 'pdf' && doc.type !== 'arxiv') {
            return res
                .status(400)
                .json({ error: 'page rendering is only available for PDF documents' });
        }
        const n = parseInt(req.params.n, 10);
        if (!Number.isInteger(n) || n < 1 || (doc.pageCount && n > doc.pageCount)) {
            return res.status(400).json({ error: 'invalid page number' });
        }

        const cacheDir = path.resolve(STORAGE_ROOT, 'pages', String(doc._id));
        const cached = path.join(cacheDir, `${n}.jpg`);
        try {
            await fs.access(cached);
        } catch (e) {
            // Render on demand. pdftoppm writes <prefix>-<n>.jpg (padded);
            // render into a temp prefix then normalize the name.
            const absPdf = path.resolve(STORAGE_ROOT, doc.file.relativePath);
            await fs.mkdir(cacheDir, { recursive: true });
            const { execFile } = require('child_process');
            const { promisify } = require('util');
            const prefix = path.join(cacheDir, `render-${n}`);
            await promisify(execFile)(
                '/opt/homebrew/bin/pdftoppm',
                ['-f', String(n), '-l', String(n), '-r', String(PAGE_RENDER_DPI), '-jpeg', '-jpegopt', 'quality=80', absPdf, prefix],
                { timeout: 60000 },
            );
            const made = (await fs.readdir(cacheDir)).find(
                (f) => f.startsWith(`render-${n}-`) && f.endsWith('.jpg'),
            );
            if (!made) return res.status(500).json({ error: 'page render failed' });
            await fs.rename(path.join(cacheDir, made), cached);
        }

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.sendFile(cached);
    }),
);

// ---------------------------------------------------------------------------
// GET /api/documents/:id/progress
// The reader's resume point: last word index / page / progress for this user.
// Returns nulls (not 404) when the doc has never been opened, so the client
// can just start at 0.
// ---------------------------------------------------------------------------
router.get(
    '/:id/progress',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await Document.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        }).select('_id');
        if (!doc) return res.status(404).json({ error: 'document not found' });

        const session = await ReadingSession.findOne({
            userId: req.userId,
            documentId: doc._id,
        }).lean();

        res.json({
            documentId: doc._id,
            progress: session?.progress ?? 0,
            lastWordIndex: session?.lastWordIndex ?? 0,
            lastPage: session?.lastPage ?? null,
            lastOpenedAt: session?.lastOpenedAt ?? null,
        });
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

        // Issue 1: a FAILED ingest keeps its partial chunks so the pipeline
        // can RESUME from the last committed window (it self-verifies the
        // rows still match the fresh extraction and wipes if not). A ready
        // doc being deliberately reingested rebuilds from scratch.
        if (doc.status !== 'failed') {
            await deleteDocumentChunks(doc._id);
        }

        // Issue 3: forceMath routes the PDF through Nougat regardless of the
        // math-density probe (textbooks whose text layer simply DROPS the
        // equations look like prose to the probe). A forced run rebuilds
        // from scratch — resuming pdf-parse chunks under nougat text would
        // mix extractions.
        const forceMath = req.body?.forceMath === true;
        if (forceMath && doc.status === 'failed') {
            await deleteDocumentChunks(doc._id);
        }

        doc.status = 'pending';
        doc.progress = 0;
        doc.ingestError = undefined;
        doc.ingestStage = undefined;
        doc.ingestStartedAt = undefined;
        doc.ingestFinishedAt = undefined;
        await doc.save();

        ingestDocument(doc._id, { forceMath }).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[reingest] kickoff failed:', err);
        });

        res.json({ ok: true, status: doc.status });
    }),
);

// ---------------------------------------------------------------------------
// POST /api/documents/reingest-all
// Issue 3 maintenance: re-run every non-deleted document through the CURRENT
// extractor stack, SEQUENTIALLY (parallel nougat runs would thrash the M4's
// GPU). Returns immediately with the queue size; progress is visible per-doc
// in the library like any other ingest.
// ---------------------------------------------------------------------------
let reingestAllRunning = false;
router.post(
    '/reingest-all',
    requireAuth,
    asyncHandler(async (req, res) => {
        if (reingestAllRunning) {
            return res.status(409).json({ error: 'a reingest-all run is already in progress' });
        }
        const docs = await Document.find({ userId: req.userId, deletedAt: null })
            .select('_id status')
            .sort({ createdAt: 1 })
            .lean();
        reingestAllRunning = true;
        (async () => {
            try {
                for (const d of docs) {
                    await deleteDocumentChunks(d._id);
                    await Document.updateOne(
                        { _id: d._id },
                        {
                            $set: { status: 'pending', progress: 0 },
                            $unset: { ingestError: 1, ingestStage: 1, ingestStartedAt: 1, ingestFinishedAt: 1 },
                        },
                    );
                    // sequential on purpose — one book at a time
                    // eslint-disable-next-line no-await-in-loop
                    await ingestDocument(d._id);
                }
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('[reingest-all] stopped:', err);
            } finally {
                reingestAllRunning = false;
            }
        })();
        res.json({ ok: true, queued: docs.length });
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

// Extension checked FIRST: browsers/Android send application/octet-stream
// (or text/plain) for .md, .djvu and .pptx, so mime alone misroutes them.
function typeFromUpload(mime, originalname = '') {
    const ext = (originalname.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
    const byExt = {
        pdf: 'pdf',
        epub: 'epub',
        docx: 'docx',
        pptx: 'pptx',
        md: 'md',
        markdown: 'md',
        txt: 'txt',
        djvu: 'djvu',
        djv: 'djvu',
    }[ext];
    if (byExt) return byExt;

    switch (mime) {
        case 'application/pdf':
            return 'pdf';
        case 'application/epub+zip':
            return 'epub';
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            return 'docx';
        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
            return 'pptx';
        case 'text/markdown':
            return 'md';
        case 'image/vnd.djvu':
        case 'image/x-djvu':
            return 'djvu';
        case 'text/plain':
            return 'txt';
        default:
            return 'pdf';
    }
}

module.exports = router;

const path = require('path');
const { Router } = require('express');

const { Document, DocumentChunk, ChatMessage } = require('../models');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { getQdrant } = require('../db/qdrant');
const { embedText, getModelName } = require('../services/embedder');
const { extractText } = require('../services/textExtractor');
const { generateAnswer, activeProvider } = require('../services/aiProvider');

const STORAGE_ROOT = process.env.STORAGE_ROOT || './storage';

// Caps the document we ship to the model in the FALLBACK path (raw-file
// read, no RAG). ~150K chars ≈ 37K tokens — safe for Gemini Flash, Claude,
// and (with truncation) local models.
const MAX_FALLBACK_CHARS = 150_000;

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/documents/:id/query
// body: { question, threadId?, provider? }
//
// Two-stage RAG:
//   1) Retrieve — embed the question (local Ollama), Qdrant filter-search
//      by user+doc, hydrate hits from Mongo
//   2) Reason   — send chunks + question to the configured AI provider
//      (gemini | ollama | anthropic) via services/aiProvider.js
//
// Fallback — if anything in stage 1 fails (Qdrant down, no chunks, etc.),
// fall back to the raw-file-read flow.
//
// Persistence — user message + assistant message saved as ChatMessage rows
// with citations[] pointing back to the retrieved chunks.
// ---------------------------------------------------------------------------
router.post(
    '/documents/:id/query',
    requireAuth,
    asyncHandler(async (req, res) => {
        const { question, threadId, provider } = req.body || {};
        if (!question || typeof question !== 'string' || !question.trim()) {
            return res.status(400).json({ error: 'question is required' });
        }

        const doc = await Document.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        });
        if (!doc) return res.status(404).json({ error: 'document not found' });

        const thread = (threadId && String(threadId).trim()) || defaultThreadId(doc._id);

        // Persist the user message immediately so it shows up in chat history
        // even if the provider later fails.
        await ChatMessage.create({
            userId: req.userId,
            documentId: doc._id,
            threadId: thread,
            role: 'user',
            content: question.trim(),
        });

        // ---- Stage 1: retrieve ----------------------------------------------
        let hits = [];
        let rawContext = '';
        let mode = 'rag';

        try {
            const qvec = await embedText(question.trim());
            const collectionName = getModelName();
            const qdrant = getQdrant();
            const search = await qdrant.search(collectionName, {
                vector: qvec,
                limit: 8,
                with_payload: true,
                filter: {
                    must: [
                        { key: 'userId', match: { value: req.userId.toString() } },
                        { key: 'documentId', match: { value: doc._id.toString() } },
                    ],
                },
            });

            const pointIds = (search || []).map((h) => h.id);
            if (pointIds.length === 0) throw new Error('no qdrant hits');

            hits = await DocumentChunk.find({
                vectorId: { $in: pointIds },
                documentId: doc._id,
            })
                .sort({ chunkIndex: 1 })
                .lean();
            if (hits.length === 0) throw new Error('qdrant hits not found in mongo');
        } catch (ragErr) {
            // eslint-disable-next-line no-console
            console.warn(
                '[query] RAG path failed, falling back to raw file:',
                ragErr.message || ragErr,
            );
            mode = 'fallback';
            hits = [];

            if (!doc.file?.relativePath) {
                return res
                    .status(503)
                    .json({ error: 'no chunks indexed and no file on disk' });
            }
            const absPath = path.resolve(STORAGE_ROOT, doc.file.relativePath);
            try {
                // Route through the SAME extractor the ingest pipeline uses.
                // The file on disk is the RAW upload (PDF/EPUB/DOCX bytes) —
                // a plain utf-8 read would ship mojibake to the model as
                // "context". extractText handles pdf via pdf-parse, txt
                // natively, epub/docx best-effort.
                const extracted = await extractText(absPath, doc.type);
                rawContext = extracted.text || '';
            } catch (e) {
                if (e.code === 'ENOENT') {
                    return res.status(404).json({ error: 'file not on disk' });
                }
                throw e;
            }
            if (!rawContext.trim()) {
                return res.status(503).json({
                    error: 'document has no extractable text yet — try again after ingest completes',
                });
            }
            if (rawContext.length > MAX_FALLBACK_CHARS) {
                rawContext = rawContext.slice(0, MAX_FALLBACK_CHARS);
            }
        }

        // ---- Stage 2: reason (provider-agnostic) -----------------------------
        const result = await generateAnswer({
            question: question.trim(),
            contextChunks: hits,
            rawContext,
            docTitle: doc.title,
            provider, // per-request override; undefined → AI_PROVIDER env
        });

        await ChatMessage.create({
            userId: req.userId,
            documentId: doc._id,
            threadId: thread,
            role: 'assistant',
            content: result.answer,
            citations: result.citations,
            model: result.model,
            tokens: result.tokens,
            latencyMs: result.latencyMs,
        });

        res.json({
            answer: result.answer,
            citations: result.citations,
            verbatim: result.verbatim,
            threadId: thread,
            mode,
            method: mode, // back-compat alias used by older client builds
            model: result.model,
            provider: result.provider,
            chunksUsed: hits.length,
        });
    }),
);

// ---------------------------------------------------------------------------
// GET /api/documents/:id/chat
// Returns chat history for the document, oldest first, capped at 100.
// query: ?threadId=<id> to filter to a specific thread.
// ---------------------------------------------------------------------------
router.get(
    '/documents/:id/chat',
    requireAuth,
    asyncHandler(async (req, res) => {
        const filter = {
            userId: req.userId,
            documentId: req.params.id,
        };
        if (req.query?.threadId) filter.threadId = String(req.query.threadId);

        const messages = await ChatMessage.find(filter)
            .sort({ createdAt: 1 })
            .limit(100)
            .lean();
        res.json(messages);
    }),
);

// ---------------------------------------------------------------------------
// GET /api/ai/provider — tiny introspection endpoint so the client (and
// curl) can confirm which reasoning provider is active without asking a
// question. No secrets returned.
// ---------------------------------------------------------------------------
router.get(
    '/ai/provider',
    requireAuth,
    asyncHandler(async (req, res) => {
        res.json({
            provider: activeProvider(),
            geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
            ollamaChatModel: process.env.OLLAMA_CHAT_MODEL || 'qwen2.5:7b',
            anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
            localMode: process.env.LOCAL_MODE === 'true',
        });
    }),
);

// ---- helpers ---------------------------------------------------------------

function defaultThreadId(docId) {
    // One thread per document per UTC day. Cheap and good-enough for the
    // mobile client until we expose real thread management.
    return `${docId}:${new Date().toISOString().slice(0, 10)}`;
}

module.exports = router;

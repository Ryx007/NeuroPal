const { Router } = require('express');

const { Document, DocumentChunk, ChatMessage } = require('../models');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { getQdrant } = require('../db/qdrant');
const { embedText, getModelName } = require('../services/embedder');
const { generateAnswer, activeProvider } = require('../services/aiProvider');

// Phase 4 — exam-prep endpoints (Build Brief §4 Phase 4). All four are new
// prompts over the existing RAG pipeline and the provider-agnostic
// aiProvider — no new infrastructure. Responses reuse the standard
// {answer, citations} envelope with `answer` as ready-to-render Markdown,
// so every client surface (native, web) can display them with zero new
// parsing.
//
//   POST /api/documents/:id/summarize   { depth?: quick|intuitive|comprehensive, provider? }
//   POST /api/documents/:id/quiz        { count?: number, difficulty?: mixed|easy|hard, provider? }
//   POST /api/documents/:id/cheatsheet  { provider? }
//   POST /api/documents/:id/explain     { passage, depth?, provider? }

const router = Router();

// Whole-document features can't ship a 500-page book to the model. Budget
// by provider (local 7B models have small usable contexts), and sample
// chunks EVENLY across the document so a book summary covers the whole arc
// instead of just chapter one.
const CONTEXT_BUDGET_CHARS = {
    gemini: 120000,
    anthropic: 120000,
    ollama: 8000,
};

function budgetFor(provider) {
    return CONTEXT_BUDGET_CHARS[activeProvider(provider)] || 8000;
}

async function loadDoc(req, res) {
    const doc = await Document.findOne({
        _id: req.params.id,
        userId: req.userId,
        deletedAt: null,
    }).lean();
    if (!doc) {
        res.status(404).json({ error: 'document not found' });
        return null;
    }
    if (doc.status !== 'ready') {
        res.status(409).json({
            error: `document is not ready yet (status: ${doc.status})`,
        });
        return null;
    }
    return doc;
}

// Evenly-spaced chunk sample within a character budget. Keeps chunkIndex
// order so the model reads the document in sequence.
async function sampleChunks(docId, budgetChars) {
    const all = await DocumentChunk.find({ documentId: docId })
        .sort({ chunkIndex: 1 })
        .select('text chunkIndex anchor')
        .lean();
    if (all.length === 0) return [];

    const total = all.reduce((n, c) => n + c.text.length, 0);
    if (total <= budgetChars) return all;

    const avg = total / all.length;
    const keep = Math.max(1, Math.floor(budgetChars / avg));
    const step = all.length / keep;
    const out = [];
    for (let i = 0; i < keep; i++) {
        out.push(all[Math.floor(i * step)]);
    }
    return out;
}

// Retrieval for passage-grounded explain — same two-stage shape as query.js.
async function retrieveForPassage(req, doc, passage) {
    try {
        const qvec = await embedText(passage);
        const search = await getQdrant().search(getModelName(), {
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
        const ids = (search || []).map((h) => h.id);
        if (ids.length === 0) return [];
        return await DocumentChunk.find({
            vectorId: { $in: ids },
            documentId: doc._id,
        })
            .sort({ chunkIndex: 1 })
            .lean();
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[study] retrieval failed, falling back to sample:', err.message || err);
        return [];
    }
}

// ChatMessage.content caps at 16k chars — a comprehensive book summary can
// exceed that, and persistence must NEVER discard a successfully generated
// (already paid-for) answer: failures are logged and the response still
// goes out with the full text.
const CHAT_CONTENT_MAX = 16000;

async function persistExchange(req, doc, label, answer, result) {
    const threadId = `${doc._id}:study`;
    try {
        await ChatMessage.create({
            userId: req.userId,
            documentId: doc._id,
            threadId,
            role: 'user',
            content: label.slice(0, CHAT_CONTENT_MAX),
        });
        await ChatMessage.create({
            userId: req.userId,
            documentId: doc._id,
            threadId,
            role: 'assistant',
            content: answer.slice(0, CHAT_CONTENT_MAX),
            citations: result.citations,
            model: result.model,
            tokens: result.tokens,
            latencyMs: result.latencyMs,
        });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[study] chat persistence failed (answer still returned):', err.message || err);
    }
    return threadId;
}

function respond(res, result, threadId, extra = {}) {
    res.json({
        answer: result.answer,
        citations: result.citations,
        threadId,
        model: result.model,
        provider: result.provider,
        ...extra,
    });
}

// Markdown-answer variant of the system prompt. Citations stay in the JSON
// contract so mapCitations keeps working; the answer itself is Markdown.
function mdSystem(taskLines) {
    return [
        'You are an expert study assistant helping a physics PhD student prepare for an oral exam.',
        'Work STRICTLY from the provided context chunks. Do not invent content that is not supported by them.',
        ...taskLines,
        'Respond as VALID JSON ONLY, no prose outside the JSON object:',
        '{"answer": "<well-formatted Markdown>", "citations": [{"chunk": <1-based chunk number>, "quote": "short verbatim passage"}]}',
        'Cite the chunks you drew from. Keep quotes short.',
    ].join(' ');
}

// ---------------------------------------------------------------------------
// POST /api/documents/:id/summarize
// ---------------------------------------------------------------------------
router.post(
    '/documents/:id/summarize',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await loadDoc(req, res);
        if (!doc) return;
        const { depth = 'intuitive', provider } = req.body || {};

        const DEPTHS = {
            quick: 'a tight executive summary — the 5-8 most important points, one short paragraph max per point',
            intuitive:
                'a plain-language summary that builds intuition: what problem the document addresses, the key ideas in order, and why they matter. Prefer analogies over jargon',
            comprehensive:
                'a thorough section-by-section summary preserving the logical structure, key equations/results (in words), and the connections between sections',
        };
        const depthSpec = DEPTHS[depth] || DEPTHS.intuitive;

        const chunks = await sampleChunks(doc._id, budgetFor(provider));
        const result = await generateAnswer({
            question: `Summarize this document. Produce ${depthSpec}. Use Markdown headers and bullet lists.`,
            contextChunks: chunks,
            systemPrompt: mdSystem([
                'Your task: summarize the document from the sampled chunks.',
                'The chunks are evenly sampled across the whole document — cover the full arc, not just the beginning.',
            ]),
            provider,
            docTitle: doc.title,
        });

        const threadId = await persistExchange(
            req, doc, `[summarize:${depth}] ${doc.title}`, result.answer, result,
        );
        respond(res, result, threadId, { depth, chunksUsed: chunks.length });
    }),
);

// ---------------------------------------------------------------------------
// POST /api/documents/:id/quiz
// ---------------------------------------------------------------------------
router.post(
    '/documents/:id/quiz',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await loadDoc(req, res);
        if (!doc) return;
        const { count = 10, difficulty = 'mixed', provider } = req.body || {};
        const n = Math.max(1, Math.min(25, parseInt(count, 10) || 10));

        const chunks = await sampleChunks(doc._id, budgetFor(provider));
        const result = await generateAnswer({
            question:
                `Create ${n} practice questions for ACTIVE RECALL from this document ` +
                `(difficulty: ${difficulty}). Format as Markdown: number each question, ` +
                `tag it with **[easy]**/**[medium]**/**[hard]**, then give the answer in a ` +
                `separate "**Answer:**" line so the reader can self-test before peeking. ` +
                `Prefer questions that test understanding and derivations over rote facts.`,
            contextChunks: chunks,
            systemPrompt: mdSystem([
                'Your task: write exam-style practice questions grounded in the document.',
                'Every question must be answerable from the provided chunks.',
            ]),
            provider,
            docTitle: doc.title,
        });

        const threadId = await persistExchange(
            req, doc, `[quiz:${n}:${difficulty}] ${doc.title}`, result.answer, result,
        );
        respond(res, result, threadId, { count: n, difficulty, chunksUsed: chunks.length });
    }),
);

// ---------------------------------------------------------------------------
// POST /api/documents/:id/cheatsheet
// ---------------------------------------------------------------------------
router.post(
    '/documents/:id/cheatsheet',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await loadDoc(req, res);
        if (!doc) return;
        const { provider } = req.body || {};

        const chunks = await sampleChunks(doc._id, budgetFor(provider));
        const result = await generateAnswer({
            question:
                'Produce a one-page exam cheatsheet from this document as dense, structured Markdown: ' +
                'key definitions, core results/equations (in words or simple notation), pitfalls, and ' +
                'the logical skeleton of the argument. Optimize for last-minute review — terse and scannable.',
            contextChunks: chunks,
            systemPrompt: mdSystem([
                'Your task: condense the document into an exam-ready cheatsheet.',
                'Ruthlessly prioritize what an oral-exam candidate must have at their fingertips.',
            ]),
            provider,
            docTitle: doc.title,
        });

        const threadId = await persistExchange(
            req, doc, `[cheatsheet] ${doc.title}`, result.answer, result,
        );
        respond(res, result, threadId, { chunksUsed: chunks.length });
    }),
);

// ---------------------------------------------------------------------------
// POST /api/documents/:id/explain
// body: { passage, depth? }  — passage-grounded, retrieval-backed
// ---------------------------------------------------------------------------
router.post(
    '/documents/:id/explain',
    requireAuth,
    asyncHandler(async (req, res) => {
        const doc = await loadDoc(req, res);
        if (!doc) return;
        const { passage, depth = 'intuitive', provider } = req.body || {};
        if (!passage || typeof passage !== 'string' || !passage.trim()) {
            return res.status(400).json({ error: 'passage is required' });
        }

        let chunks = await retrieveForPassage(req, doc, passage.trim());
        if (chunks.length === 0) {
            chunks = await sampleChunks(doc._id, budgetFor(provider));
        }

        const DEPTHS = {
            quick: 'in 2-3 sentences',
            intuitive: 'building intuition step by step, with an analogy if it helps',
            comprehensive: 'thoroughly, including the underlying assumptions and how it connects to the rest of the document',
        };

        const result = await generateAnswer({
            question:
                `Explain this passage ${DEPTHS[depth] || DEPTHS.intuitive}:\n\n"${passage.trim().slice(0, 2000)}"`,
            contextChunks: chunks,
            systemPrompt: mdSystem([
                'Your task: explain the given passage using the surrounding document context.',
                'Ground the explanation in the document first; only then add widely-known background if essential.',
            ]),
            provider,
            docTitle: doc.title,
        });

        const threadId = await persistExchange(
            req, doc, `[explain:${depth}] ${passage.trim().slice(0, 120)}`, result.answer, result,
        );
        respond(res, result, threadId, { depth, chunksUsed: chunks.length });
    }),
);

module.exports = router;

const axios = require('axios');

// Provider-agnostic embedding layer.
//
//   EMBEDDER=ollama (default) → POST $OLLAMA_URL/api/embeddings
//   EMBEDDER=openai           → POST https://api.openai.com/v1/embeddings
//   EMBEDDER=mock             → deterministic local pseudo-vectors, no network
//
// `mock` lets the full ingest pipeline (parsing → chunking → embedding →
// Qdrant upsert → 'ready') complete end-to-end WITHOUT a real embedding
// service running. The vectors aren't semantically meaningful so RAG
// retrieval quality is random — but the state machine works, which is what
// you want for development before Ollama is up.
//
// `getModelName()` MUST return a value that matches the
// DocumentChunk.embeddingModel enum exactly — that's how a future re-embed
// job will know which collection's vectors to replace. The mock provider
// claims `nomic-embed-text-v1.5` (closest 768-dim real model) so that
// schema validation passes; once you swap to real Ollama, hit
// `POST /api/documents/:id/reingest` to replace the dummy vectors.

const OLLAMA_MODEL_MAP = {
    // Ollama tag → canonical DocumentChunk.embeddingModel enum value
    'nomic-embed-text': 'nomic-embed-text-v1.5',
    'nomic-embed-text:v1.5': 'nomic-embed-text-v1.5',
    'bge-large-en': 'bge-large-en-v1.5',
    'bge-large-en-v1.5': 'bge-large-en-v1.5',
};

function provider() {
    return (process.env.EMBEDDER || 'ollama').toLowerCase();
}

// Brief §8 names this env var OLLAMA_EMBED_MODEL; older configs used
// OLLAMA_MODEL. Accept both, prefer the new name.
function ollamaEmbedModelTag() {
    return (
        process.env.OLLAMA_EMBED_MODEL ||
        process.env.OLLAMA_MODEL ||
        'nomic-embed-text'
    );
}

function getModelName() {
    if (provider() === 'ollama') {
        const raw = ollamaEmbedModelTag();
        const canonical = OLLAMA_MODEL_MAP[raw];
        if (!canonical) {
            throw new Error(
                `Unknown Ollama embed model '${raw}'. Map it in OLLAMA_MODEL_MAP in embedder.js.`,
            );
        }
        return canonical;
    }
    if (provider() === 'openai') {
        return process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
    }
    if (provider() === 'mock') {
        // Use a real enum value so DocumentChunk validation passes. The
        // EMBEDDING_DIM default (768) matches this model's real dim.
        return 'nomic-embed-text-v1.5';
    }
    throw new Error(`Unsupported EMBEDDER '${provider()}'`);
}

function getDim() {
    const d = parseInt(process.env.EMBEDDING_DIM, 10);
    if (!Number.isFinite(d) || d <= 0) {
        throw new Error('EMBEDDING_DIM must be a positive integer');
    }
    return d;
}

// ---------- Ollama ----------

async function embedOllama(text) {
    const url = process.env.OLLAMA_URL;
    const model = ollamaEmbedModelTag();
    if (!url) throw new Error('OLLAMA_URL is not set');

    const { data } = await axios.post(
        `${url.replace(/\/+$/, '')}/api/embeddings`,
        { model, prompt: text },
        { timeout: 30000 },
    );
    if (!Array.isArray(data?.embedding)) {
        throw new Error('Ollama returned no embedding');
    }
    return data.embedding;
}

// ---------- OpenAI ----------

async function embedOpenAI(input) {
    const key = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
    if (!key) throw new Error('OPENAI_API_KEY is not set');

    const { data } = await axios.post(
        'https://api.openai.com/v1/embeddings',
        { model, input },
        {
            timeout: 30000,
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
        },
    );
    return data?.data || [];
}

// ---------- Mock (deterministic, no network) ----------

function mockEmbed(text) {
    const dim = getDim();
    const seed = simpleHash(String(text || ''));
    const out = new Array(dim);
    for (let i = 0; i < dim; i++) {
        // Sin-hash → deterministic pseudo-random in [-1, 1]. Same text →
        // same vector every time, so re-ingesting an identical document
        // yields stable Qdrant point ids.
        const x = Math.sin(seed * (i + 1) * 12.9898) * 43758.5453;
        const frac = x - Math.floor(x);
        out[i] = frac * 2 - 1;
    }
    // L2-normalise so cosine similarity behaves sensibly. Magnitudes still
    // carry no semantic info — this is purely a smoke-test embedding.
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += out[i] * out[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) out[i] = out[i] / norm;
    return out;
}

function simpleHash(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = ((h << 5) - h) + text.charCodeAt(i);
        h |= 0; // clamp to int32
    }
    return Math.abs(h) || 1;
}

// ---------- Public ----------

async function embedText(text) {
    if (provider() === 'ollama') return embedOllama(text);
    if (provider() === 'openai') {
        const out = await embedOpenAI(text);
        return out[0]?.embedding || [];
    }
    if (provider() === 'mock') return mockEmbed(text);
    throw new Error(`Unsupported EMBEDDER '${provider()}'`);
}

// Concurrent embed of N texts.
//   Ollama:  fan-out with concurrency 4 (single-text endpoint).
//   OpenAI:  one batched call (the endpoint accepts string[]).
// `onProgress(done, total)` fires as embeddings complete — a 500-page book
// is thousands of chunks and minutes of work, and the caller uses this to
// surface ingest progress to the client.
async function embedBatch(texts, onProgress) {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    if (provider() === 'ollama') {
        const results = new Array(texts.length);
        const concurrency = 4;
        let cursor = 0;
        let done = 0;
        async function worker() {
            while (true) {
                const i = cursor++;
                if (i >= texts.length) return;
                results[i] = await embedOllama(texts[i]);
                done += 1;
                if (onProgress) onProgress(done, texts.length);
            }
        }
        await Promise.all(
            Array.from({ length: Math.min(concurrency, texts.length) }, worker),
        );
        return results;
    }

    if (provider() === 'openai') {
        // OpenAI caps batch size at 2048 inputs OR 300K tokens. We chunk
        // conservatively at 96 to stay safely under both.
        const out = new Array(texts.length);
        const batchSize = 96;
        for (let start = 0; start < texts.length; start += batchSize) {
            const slice = texts.slice(start, start + batchSize);
            const resp = await embedOpenAI(slice);
            for (let i = 0; i < resp.length; i++) {
                out[start + i] = resp[i].embedding;
            }
            if (onProgress) {
                onProgress(Math.min(start + batchSize, texts.length), texts.length);
            }
        }
        return out;
    }

    if (provider() === 'mock') {
        return texts.map((t) => mockEmbed(t));
    }

    throw new Error(`Unsupported EMBEDDER '${provider()}'`);
}

module.exports = { embedText, embedBatch, getModelName, getDim };

const axios = require('axios');

// Provider-agnostic reasoning layer (Build Brief §6).
//
//   generateAnswer({ question, contextChunks, rawContext, systemPrompt,
//                    provider, docTitle })
//     → { answer, citations, verbatim, model, tokens, provider, latencyMs }
//
// Selection order: explicit `provider` arg → AI_PROVIDER env → 'gemini'.
//
//   gemini    — default, free tier. SDK: @google/genai (verified v2.x,
//               July 2026). Model via GEMINI_MODEL (default gemini-2.5-flash).
//   ollama    — fully local/offline. POST $OLLAMA_URL/api/chat with
//               OLLAMA_CHAT_MODEL (default qwen2.5:7b). No key.
//   anthropic — optional paid "best quality". @anthropic-ai/sdk,
//               ANTHROPIC_MODEL (default claude-sonnet-4-5).
//
// All providers share the same {answer, citations} JSON contract and the
// tolerant parser (graceful fallback when a model emits malformed JSON) —
// both lifted unchanged from the original query.js implementation.

const DEFAULT_SYSTEM = [
    'You are a research assistant.',
    "Answer the user's question STRICTLY based on the context below.",
    'The context is a list of numbered chunks labeled like "[Chunk 3, p.7]".',
    'If the answer is not in the context, say so plainly — do not invent.',
    'Use plain, accessible language.',
    'Respond as VALID JSON ONLY, no prose outside the JSON object:',
    '{"answer": "...", "citations": [{"chunk": 3, "quote": "short verbatim passage from that chunk"}]}',
    'Cite ONLY the chunks you actually used for the answer.',
    'If the answer is not in the context, return an empty citations array.',
].join(' ');

function activeProvider(override) {
    return String(override || process.env.AI_PROVIDER || 'gemini').toLowerCase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function generateAnswer({
    question,
    contextChunks = [],
    rawContext = '',
    systemPrompt,
    provider,
    docTitle = '',
} = {}) {
    if (!question || !String(question).trim()) {
        throw new Error('generateAnswer: question is required');
    }

    const chosen = activeProvider(provider);
    const system = systemPrompt || DEFAULT_SYSTEM;
    const contextBlock = buildContextBlock(contextChunks, rawContext);
    const userPrompt =
        `DOCUMENT TITLE: ${docTitle}\n\n` +
        `CONTEXT:\n${contextBlock}\n\n` +
        `QUESTION:\n${String(question).trim()}`;

    const t0 = Date.now();
    let result;
    if (chosen === 'gemini') {
        result = await callGemini(system, userPrompt);
    } else if (chosen === 'ollama') {
        result = await callOllama(system, userPrompt);
    } else if (chosen === 'anthropic') {
        result = await callAnthropic(system, userPrompt);
    } else {
        throw new Error(
            `Unsupported AI_PROVIDER '${chosen}' (expected gemini | ollama | anthropic)`,
        );
    }

    const parsed = tolerantParse(result.raw);
    const rawCitations = Array.isArray(parsed.citations) ? parsed.citations : [];
    const citations = mapCitations(contextChunks, rawCitations);

    return {
        answer: String(parsed.answer || ''),
        citations,
        // Plain-string quotes for clients that just render text.
        verbatim: citations.map((c) => c.excerpt).filter(Boolean),
        model: result.model,
        tokens: result.tokens,
        provider: chosen,
        latencyMs: Date.now() - t0,
    };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

// -- Gemini (@google/genai, current official SDK) ---------------------------

let _gemini;
function geminiClient() {
    if (!_gemini) {
        const key = process.env.GEMINI_API_KEY;
        if (!key) throw new Error('GEMINI_API_KEY is not set');
        // Lazy require so the backend still boots when the dep is absent
        // and AI_PROVIDER is ollama/anthropic.
        const { GoogleGenAI } = require('@google/genai');
        _gemini = new GoogleGenAI({ apiKey: key });
    }
    return _gemini;
}

async function callGemini(system, userPrompt) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const resp = await geminiClient().models.generateContent({
        model,
        contents: userPrompt,
        config: {
            systemInstruction: system,
            responseMimeType: 'application/json',
            temperature: 0.2,
        },
    });

    // `.text` is the SDK's aggregated-text accessor; fall back to walking
    // candidates in case of SDK drift.
    const raw =
        (typeof resp.text === 'string' && resp.text) ||
        (resp.candidates?.[0]?.content?.parts || [])
            .map((p) => p.text || '')
            .join('') ||
        '';

    const u = resp.usageMetadata || {};
    return {
        raw,
        model,
        tokens: {
            prompt: u.promptTokenCount || 0,
            completion: u.candidatesTokenCount || 0,
            total:
                u.totalTokenCount ||
                (u.promptTokenCount || 0) + (u.candidatesTokenCount || 0),
        },
    };
}

// -- Ollama (local chat model, offline path) --------------------------------

async function callOllama(system, userPrompt) {
    const url = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
    const model = process.env.OLLAMA_CHAT_MODEL || 'qwen2.5:7b';

    const { data } = await axios.post(
        `${url}/api/chat`,
        {
            model,
            stream: false,
            // Ollama's JSON mode — constrains output to valid JSON, which
            // makes small local models far more contract-reliable.
            format: 'json',
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: userPrompt },
            ],
            options: { temperature: 0.2 },
        },
        // Local 7B models chew through long contexts slowly on first load
        // (model paging into RAM). Generous timeout.
        { timeout: 300000 },
    );

    const raw = data?.message?.content || '';
    const promptTok = data?.prompt_eval_count || 0;
    const compTok = data?.eval_count || 0;
    return {
        raw,
        model,
        tokens: { prompt: promptTok, completion: compTok, total: promptTok + compTok },
    };
}

// -- Anthropic (optional, paid) ----------------------------------------------

let _anthropic;
function anthropicClient() {
    if (!_anthropic) {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
        const Anthropic = require('@anthropic-ai/sdk');
        _anthropic = new Anthropic({ apiKey: key });
    }
    return _anthropic;
}

async function callAnthropic(system, userPrompt) {
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
    const resp = await anthropicClient().messages.create({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: userPrompt }],
    });
    const raw = (resp.content?.[0]?.text || '').trim();
    const usage = resp.usage || {};
    return {
        raw,
        model,
        tokens: {
            prompt: usage.input_tokens || 0,
            completion: usage.output_tokens || 0,
            total: (usage.input_tokens || 0) + (usage.output_tokens || 0),
        },
    };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildContextBlock(contextChunks, rawContext) {
    if (Array.isArray(contextChunks) && contextChunks.length > 0) {
        return contextChunks
            .map((c, i) => {
                const page = c.anchor?.page ?? '?';
                return `[Chunk ${i + 1}, p.${page}]\n${c.text}`;
            })
            .join('\n\n---\n\n');
    }
    return String(rawContext || '');
}

// Three-tier tolerant parse (unchanged contract from the original query.js):
//   1. strict JSON.parse
//   2. extract the first {...} block and parse that
//   3. give up gracefully — treat the whole output as the answer
function tolerantParse(raw) {
    const text = String(raw || '').trim();
    try {
        return JSON.parse(text);
    } catch (e) {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (e2) {
                // fall through
            }
        }
        return { answer: text, citations: [] };
    }
}

// Bind the model's citations to the chunks they actually came from.
//
// Preferred shape (what DEFAULT_SYSTEM asks for): {chunk: <1-based index
// into the context labels>, quote: "..."} — an explicit binding.
// Tolerated legacy shape: bare quote strings — bound by substring search
// against the chunk texts; unmatched quotes are kept excerpt-only rather
// than misattributed to an arbitrary chunk.
//
// Only chunks the model actually cited are returned (a "not in the
// context" answer correctly yields []). In fallback (raw-file) mode there
// are no chunks → excerpt-only citations.
function mapCitations(contextChunks, rawCitations) {
    const chunks = Array.isArray(contextChunks) ? contextChunks : [];
    const out = [];

    for (const item of Array.isArray(rawCitations) ? rawCitations : []) {
        if (item && typeof item === 'object') {
            const quote = String(item.quote || item.excerpt || '').slice(0, 400);
            const idx = Number(item.chunk) - 1; // context labels are 1-based
            const c = Number.isInteger(idx) ? chunks[idx] : undefined;
            if (c) {
                out.push({
                    chunkId: c._id,
                    page: c.anchor?.page,
                    sectionHeading: c.sectionHeading,
                    excerpt: quote || (c.text || '').slice(0, 400),
                });
            } else if (quote) {
                out.push({ excerpt: quote });
            }
            continue;
        }

        if (typeof item === 'string' && item.trim()) {
            const quote = item.slice(0, 400);
            const needle = normalise(quote).slice(0, 80);
            const c = needle
                ? chunks.find((ch) => normalise(ch.text).includes(needle))
                : undefined;
            if (c) {
                out.push({
                    chunkId: c._id,
                    page: c.anchor?.page,
                    sectionHeading: c.sectionHeading,
                    excerpt: quote,
                });
            } else {
                out.push({ excerpt: quote });
            }
        }
    }

    return out;
}

function normalise(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

module.exports = { generateAnswer, activeProvider, DEFAULT_SYSTEM };

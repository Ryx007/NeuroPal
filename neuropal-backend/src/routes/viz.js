const { Router } = require('express');

const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { generateStructured } = require('../services/aiProvider');

// AI-generated physics visualizations. The client's built-in templates are
// self-contained HTML pages with a fixed runtime contract; this route asks
// the LLM for a spec in that SAME contract so the app can render it through
// the identical wrapper:
//
//   { title, blurb, sliders: [{id,label,min,max,step,value}], drawJs }
//
// drawJs runs inside a sandboxed WebView/iframe (no network, no storage,
// sandbox="allow-scripts") with these globals:
//   ctx  — a 2d canvas context      P    — {sliderId: currentValue}
//   W()  — canvas css width         H()  — canvas css height
//
// The spec is validated hard here — a malformed LLM response is a 502, not
// a broken canvas on the phone.

const SYSTEM_PROMPT = `You write compact, correct HTML5-canvas physics/math visualizations.

Reply with ONLY a JSON object of this exact shape:
{
  "title": "short title",
  "blurb": "one sentence explaining what is shown and the governing equation",
  "sliders": [
    { "id": "camelCaseId", "label": "Label (unit)", "min": 0, "max": 10, "step": 0.1, "value": 1 }
  ],
  "drawJs": "JavaScript source as a single string"
}

Rules for drawJs:
- It runs once. Define function draw(){...; requestAnimationFrame(draw);} and call draw() at the end for animation.
- Available globals: ctx (CanvasRenderingContext2D), P (object with the current value of every slider, keyed by id — re-read it every frame), W() and H() (canvas width/height in px).
- Dark background (#0E0E0E canvas). Use these colors: primary stroke '#FF7F8E', secondary '#F3C77B', dim '#534347', text '#D0C6C8'. 12px monospace for text.
- ALWAYS draw labelled axes with tick marks when plotting functions/fields, and a live numeric readout (top-left) of the key derived quantities.
- 1 to 4 sliders. No user input other than the sliders. No fetch/XHR/import/eval/document.cookie/localStorage — the sandbox blocks them.
- Physics must be dimensionally sane and integrate stably (use small fixed substeps for ODEs).
- Keep it under 120 lines.`;

// The sandbox blocks all of these anyway (iframe sandbox / WebView with
// network+storage off) — rejecting here just fails fast with a clear error
// instead of a silently dead canvas.
const FORBIDDEN_JS = /\b(fetch|XMLHttpRequest|WebSocket|importScripts|localStorage|indexedDB|document\.cookie|import\s*\(|eval)\b/;

function validateSpec(data) {
    if (!data || typeof data !== 'object') return 'no JSON object in response';
    const { title, blurb, sliders, drawJs } = data;
    if (typeof title !== 'string' || !title.trim()) return 'missing title';
    if (typeof drawJs !== 'string' || drawJs.trim().length < 40) {
        return 'missing or trivial drawJs';
    }
    if (drawJs.length > 20000) return 'drawJs too large';
    if (FORBIDDEN_JS.test(drawJs)) return 'drawJs uses a forbidden API';
    if (!Array.isArray(sliders) || sliders.length > 4) {
        return 'sliders must be an array of at most 4';
    }
    for (const s of sliders) {
        if (!/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(String(s.id || ''))) {
            return `bad slider id: ${s.id}`;
        }
        for (const k of ['min', 'max', 'step', 'value']) {
            if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) {
                return `slider ${s.id}: ${k} must be a finite number`;
            }
        }
        if (typeof s.label !== 'string') return `slider ${s.id}: missing label`;
    }
    return null;
}

const GEMINI_SCHEMA = {
    type: 'object',
    properties: {
        title: { type: 'string' },
        blurb: { type: 'string' },
        sliders: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    label: { type: 'string' },
                    min: { type: 'number' },
                    max: { type: 'number' },
                    step: { type: 'number' },
                    value: { type: 'number' },
                },
                required: ['id', 'label', 'min', 'max', 'step', 'value'],
            },
        },
        drawJs: { type: 'string' },
    },
    required: ['title', 'blurb', 'sliders', 'drawJs'],
};

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/viz/spec
// body: { prompt, provider? } → { title, blurb, sliders, drawJs, model, provider }
// ---------------------------------------------------------------------------
router.post(
    '/spec',
    requireAuth,
    asyncHandler(async (req, res) => {
        const prompt = String(req.body?.prompt || '').trim();
        if (!prompt) return res.status(400).json({ error: 'prompt is required' });
        if (prompt.length > 600) {
            return res.status(400).json({ error: 'prompt too long (600 chars max)' });
        }

        const { data, model, provider } = await generateStructured({
            task:
                `Create an interactive canvas visualization of: ${prompt}\n` +
                'Choose slider parameters a physics student would want to vary.',
            systemPrompt: SYSTEM_PROMPT,
            provider: req.body?.provider,
            geminiSchema: GEMINI_SCHEMA,
        });

        const problem = validateSpec(data);
        if (problem) {
            return res.status(502).json({
                error: `the model returned an unusable visualization spec (${problem}) — try rewording the prompt`,
            });
        }

        res.json({
            title: data.title.slice(0, 120),
            blurb: String(data.blurb || '').slice(0, 400),
            sliders: data.sliders,
            drawJs: data.drawJs,
            model,
            provider,
        });
    }),
);

module.exports = router;

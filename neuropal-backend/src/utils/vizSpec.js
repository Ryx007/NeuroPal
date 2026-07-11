// Shared validation for AI-generated visualization specs — used by the
// generator route (POST /api/viz/spec) AND the save route (POST
// /api/simulations), so nothing unvalidated is ever persisted or re-served.

// The sandbox blocks all of these anyway (iframe sandbox / WebView with
// network+storage off) — rejecting here just fails fast with a clear error
// instead of a silently dead canvas.
const FORBIDDEN_JS = /\b(fetch|XMLHttpRequest|WebSocket|importScripts|localStorage|indexedDB|document\.cookie|import\s*\(|eval)\b/;

function validateSpec(data) {
    if (!data || typeof data !== 'object') return 'no JSON object in response';
    const { title, drawJs, sliders } = data;
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

module.exports = { validateSpec, FORBIDDEN_JS };

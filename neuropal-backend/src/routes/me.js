const { Router } = require('express');

const { User } = require('../models');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// The appearance logic lives in packages/tokens (ESM) and is synced into
// src/vendor/tokens. CommonJS can't require() ESM on Node 20, so load it once
// with a dynamic import and reuse the promise.
let tokensPromise = null;
function tokens() {
    if (!tokensPromise) tokensPromise = import('../vendor/tokens/index.js');
    return tokensPromise;
}

// ---------------------------------------------------------------------------
// GET /api/me/appearance
// returns: { appearance } — null when this user never saved one
// ---------------------------------------------------------------------------
router.get(
    '/appearance',
    requireAuth,
    asyncHandler(async (req, res) => {
        res.json({ appearance: req.user.appearance || null });
    }),
);

// ---------------------------------------------------------------------------
// PUT /api/me/appearance
// body: { appearance }  (see docs/PLATFORM-PLAN.md §3.2)
// returns: { appearance } — the normalised object as stored
//
// Last write wins by `updatedAt`: an older copy (e.g. a phone that was
// offline while you changed the look on the laptop) is refused with 409 and
// the stored copy, so the client adopts it instead of clobbering it.
// ---------------------------------------------------------------------------
router.put(
    '/appearance',
    requireAuth,
    asyncHandler(async (req, res) => {
        const incoming = req.body && req.body.appearance;
        if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
            return res.status(422).json({ error: 'appearance must be an object' });
        }
        const { normalizeAppearance } = await tokens();
        const next = normalizeAppearance(incoming);

        const incomingAt = Date.parse(next.updatedAt || '');
        next.updatedAt = Number.isFinite(incomingAt)
            ? new Date(incomingAt).toISOString()
            : new Date().toISOString();

        const stored = req.user.appearance;
        const storedAt = stored ? Date.parse(stored.updatedAt || '') : NaN;
        if (Number.isFinite(storedAt) && storedAt > Date.parse(next.updatedAt)) {
            return res.status(409).json({ error: 'stale appearance', appearance: stored });
        }

        await User.updateOne({ _id: req.user._id }, { $set: { appearance: next } });
        res.json({ appearance: next });
    }),
);

module.exports = router;

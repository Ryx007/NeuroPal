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
//
// Client clocks are not trusted: a stamp from the future is clamped to the
// server's clock (one fast phone would otherwise make every other device's
// edits look "older" forever), and a stored stamp more than a minute in the
// future (written before this clamp existed) no longer blocks anyone. The
// check and the write are one conditional update, so two near-simultaneous
// PUTs can't both pass the check and let the older one land last.
// ---------------------------------------------------------------------------
const FUTURE_SLACK_MS = 60 * 1000;

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

        const now = Date.now();
        const incomingAt = Date.parse(next.updatedAt || '');
        next.updatedAt = new Date(Number.isFinite(incomingAt) ? Math.min(incomingAt, now) : now).toISOString();

        const result = await User.updateOne(
            {
                _id: req.user._id,
                $or: [
                    { appearance: null },
                    { 'appearance.updatedAt': { $not: { $type: 'string' } } },
                    { 'appearance.updatedAt': { $lte: next.updatedAt } },
                    { 'appearance.updatedAt': { $gt: new Date(now + FUTURE_SLACK_MS).toISOString() } },
                ],
            },
            { $set: { appearance: next } },
        );
        if (result.matchedCount === 0) {
            const fresh = await User.findById(req.user._id).select('appearance').lean();
            return res.status(409).json({ error: 'stale appearance', appearance: (fresh && fresh.appearance) || null });
        }
        res.json({ appearance: next });
    }),
);

module.exports = router;

const { Router } = require('express');

const { SavedSimulation } = require('../models');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { validateSpec } = require('../utils/vizSpec');

// P5 §6.3 — persisted visualizer sims. The SPEC is stored (never a video):
// a saved sim re-renders live, stays interactive, and syncs across devices
// because the Mini is the source of truth.

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/simulations → SavedSimulation[] (newest first, soft-deleted excluded)
// ---------------------------------------------------------------------------
router.get(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
        const sims = await SavedSimulation.find({
            userId: req.userId,
            deletedAt: null,
        })
            .sort({ createdAt: -1 })
            .lean();
        res.json(sims);
    }),
);

// ---------------------------------------------------------------------------
// POST /api/simulations
// body: { title, kind:'template'|'ai', templateId? , spec? }
// ---------------------------------------------------------------------------
router.post(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
        const { title, kind, templateId, spec } = req.body || {};
        if (typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ error: 'title is required' });
        }
        if (kind === 'template') {
            if (typeof templateId !== 'string' || !templateId.trim()) {
                return res.status(400).json({ error: 'templateId is required for kind template' });
            }
            const sim = await SavedSimulation.create({
                userId: req.userId,
                title: title.trim(),
                kind,
                templateId: templateId.trim(),
            });
            return res.status(201).json(sim);
        }
        if (kind === 'ai') {
            // same validation the generator applies — nothing unvalidated is
            // ever persisted (or later re-served to a WebView)
            const problem = validateSpec(spec);
            if (problem) return res.status(400).json({ error: `invalid spec: ${problem}` });
            const sim = await SavedSimulation.create({
                userId: req.userId,
                title: title.trim(),
                kind,
                spec: {
                    title: String(spec.title).slice(0, 160),
                    blurb: String(spec.blurb || '').slice(0, 500),
                    sliders: spec.sliders,
                    drawJs: spec.drawJs,
                },
            });
            return res.status(201).json(sim);
        }
        return res.status(400).json({ error: "kind must be 'template' or 'ai'" });
    }),
);

// ---------------------------------------------------------------------------
// DELETE /api/simulations/:id — soft delete (house pattern)
// ---------------------------------------------------------------------------
router.delete(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
        const sim = await SavedSimulation.findOne({
            _id: req.params.id,
            userId: req.userId,
            deletedAt: null,
        });
        if (!sim) return res.status(404).json({ error: 'simulation not found' });
        sim.deletedAt = new Date();
        await sim.save();
        res.json({ ok: true });
    }),
);

module.exports = router;

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { User } = require('../models');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

const ACCESS_TTL = '7d'; // adjust later if you add a refresh-token flow

// ---------------------------------------------------------------------------
// POST /api/auth/register
// body: { email, password, name? }
// returns: { token, user }
// ---------------------------------------------------------------------------
router.post(
    '/register',
    asyncHandler(async (req, res) => {
        const { email, password, name } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }
        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ error: 'password must be at least 8 characters' });
        }

        const normEmail = String(email).toLowerCase().trim();

        const existing = await User.findOne({ email: normEmail, deletedAt: null });
        if (existing) {
            return res.status(409).json({ error: 'email already registered' });
        }

        // bcryptjs cost 12 — comfortable for a 2026 server, ~250ms hash on
        // commodity hardware. Bump to 13–14 if hardware allows.
        const passwordHash = await bcrypt.hash(password, 12);

        const user = await User.create({
            email: normEmail,
            passwordHash,
            name: name || '',
        });

        const token = signToken(user._id);

        res.status(201).json({
            token,
            user: publicUser(user),
        });
    }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/login
// body: { email, password }
// returns: { token, user }
// ---------------------------------------------------------------------------
router.post(
    '/login',
    asyncHandler(async (req, res) => {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }

        const user = await User.findOne({
            email: String(email).toLowerCase().trim(),
            deletedAt: null,
        }).select('+passwordHash');

        // Constant-ish-time response — same status on bad email vs bad password
        // so we don't leak account existence.
        const ok = user && (await bcrypt.compare(password, user.passwordHash));
        if (!user || !ok) {
            return res.status(401).json({ error: 'invalid email or password' });
        }

        const token = signToken(user._id);

        await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

        res.json({
            token,
            user: publicUser(user),
        });
    }),
);

// ---------------------------------------------------------------------------
// GET /api/auth/me
// The client's cold-boot probe. In LOCAL_MODE the auth middleware injects
// the fixed local user, so this resolves with no token at all; otherwise it
// verifies the JWT like every other authed route.
// returns: the public user object
// ---------------------------------------------------------------------------
router.get(
    '/me',
    requireAuth,
    asyncHandler(async (req, res) => {
        res.json(publicUser(req.user));
    }),
);

// ---- helpers ---------------------------------------------------------------

function signToken(userId) {
    return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
        expiresIn: ACCESS_TTL,
    });
}

function publicUser(u) {
    return {
        id: u._id,
        email: u.email,
        name: u.name,
        timezone: u.timezone,
        locale: u.locale,
        tweaks: u.tweaks,
        profile: u.profile,
    };
}

module.exports = router;

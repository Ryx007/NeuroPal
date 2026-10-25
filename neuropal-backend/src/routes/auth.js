const crypto = require('crypto');
const { Router } = require('express');
const jwt = require('jsonwebtoken');

const { User } = require('../models');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { rateLimit, failureCounter } = require('../middleware/rateLimit');
const { burnDummyCheck, hashPassword, verifyPassword } = require('../services/passwords');

const router = Router();

// Sessions slide: a token lasts 30 days and /api/auth/me swaps a day-old one
// for a fresh one — but only within 90 days of the actual sign-in (`at`,
// carried through every refresh). So someone who opens the app now and then
// stays signed in for three months, and a token that leaks can be ended:
// "sign out everywhere" and a password change bump the user's tokenVersion
// (`v`), which every check compares.
const ACCESS_TTL_SEC = 30 * 24 * 60 * 60;
const REFRESH_AFTER_SEC = 24 * 60 * 60;
const MAX_SESSION_AGE_SEC = 90 * 24 * 60 * 60;

const MAX_EMAIL = 254;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

// ---- public-server protections -------------------------------------------
// A public server with open sign-up would let anyone use the AI quota and the
// disk. SIGNUP_MODE:
//   invite  (default) registering needs SIGNUP_INVITE_CODE; no code set →
//           sign-up is closed
//   open    anyone can register — local development only; a
//           PUBLIC_DEPLOYMENT treats it as invite
//   closed  no new accounts
function signupMode() {
    let m = String(process.env.SIGNUP_MODE || 'invite').toLowerCase();
    if (m === 'open' && process.env.PUBLIC_DEPLOYMENT === 'true') m = 'invite';
    if (m === 'open' || m === 'closed') return m;
    return process.env.SIGNUP_INVITE_CODE ? 'invite' : 'closed';
}

function inviteMatches(given) {
    const expected = String(process.env.SIGNUP_INVITE_CODE || '');
    if (!expected || typeof given !== 'string' || given.length > 200) return false;
    // Hash both sides so the comparison is constant-time whatever the lengths.
    const a = crypto.createHash('sha256').update(given.trim()).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
}

function normEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Per network: generous for typos, hopeless for guessing.
const authAttempts = rateLimit({
    name: 'auth',
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many sign-in attempts from this network — try again in a few minutes',
});
// Per account: 8 password checks per 15 minutes, from anywhere.
const loginAttempts = failureCounter({
    windowMs: 15 * 60 * 1000,
    max: 8,
    message: 'Too many wrong passwords for this account — try again in 15 minutes',
});
// Wrong invite codes are limited per network by authAttempts. A server-wide
// budget would let anyone pause sign-up for everyone, and a 128-bit code
// can't be ground down anyway.

// ---------------------------------------------------------------------------
// GET /api/auth/config
// Public. Tells the sign-in screen what this server expects, before the user
// types anything: whether it is a single-user LOCAL_MODE server (no sign-in at
// all) and how sign-up works here.
// ---------------------------------------------------------------------------
router.get('/config', (req, res) => {
    const localMode = process.env.LOCAL_MODE === 'true';
    res.json({ localMode, signup: localMode ? 'closed' : signupMode() });
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// body: { email, password, name?, inviteCode? }
// returns: { token, user }
// ---------------------------------------------------------------------------
router.post(
    '/register',
    authAttempts,
    asyncHandler(async (req, res) => {
        const { email, password, name, inviteCode } = req.body || {};
        const mode = signupMode();
        if (mode === 'closed') {
            return res.status(403).json({ error: 'Sign-up is closed on this server' });
        }
        if (mode === 'invite' && !inviteMatches(inviteCode)) {
            return res.status(403).json({ error: 'That invite code is not right' });
        }
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }
        if (email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ error: 'that does not look like an email address' });
        }
        if (password.length < MIN_PASSWORD) {
            return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` });
        }
        if (password.length > MAX_PASSWORD) {
            return res.status(400).json({ error: 'password is too long' });
        }

        const email0 = normEmail(email);
        const existing = await User.findOne({ email: email0, deletedAt: null });
        if (existing) {
            return res.status(409).json({ error: 'email already registered' });
        }

        const user = await User.create({
            email: email0,
            passwordHash: await hashPassword(password),
            name: typeof name === 'string' ? name.trim().slice(0, 80) : '',
        });

        res.status(201).json({
            token: signToken(user),
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
    authAttempts,
    asyncHandler(async (req, res) => {
        const { email, password } = req.body || {};
        // Shape checks first: nothing oversized reaches the lockout store,
        // the database or the password hash.
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }
        if (email.length > MAX_EMAIL || password.length > MAX_PASSWORD) {
            return res.status(401).json({ error: 'invalid email or password' });
        }

        const email0 = normEmail(email);
        if (loginAttempts.blocked(email0, res)) return;
        // Count the attempt BEFORE the slow check, so parallel guesses can't
        // all slip under the limit.
        loginAttempts.reserve(email0);

        const user = await User.findOne({
            email: email0,
            deletedAt: null,
        }).select('+passwordHash');

        // Same answer and similar timing for an unknown email and a wrong
        // password, so accounts can't be discovered.
        const ok = user ? await verifyPassword(password, user.passwordHash) : await burnDummyCheck(password);
        if (!user || !ok) {
            return res.status(401).json({ error: 'invalid email or password' });
        }
        loginAttempts.clear(email0);

        // Quietly upgrade an older bcrypt hash to scrypt on a good login.
        const update = { lastLoginAt: new Date() };
        if (!String(user.passwordHash).startsWith('scrypt$')) {
            update.passwordHash = await hashPassword(password);
        }
        await User.updateOne({ _id: user._id }, { $set: update });

        res.json({
            token: signToken(user),
            user: publicUser(user),
        });
    }),
);

// ---------------------------------------------------------------------------
// GET /api/auth/me
// The client's cold-boot probe. In LOCAL_MODE the auth middleware injects
// the fixed local user, so this resolves with no token at all; otherwise it
// verifies the JWT like every other authed route.
// returns: the public user object (+ `token` when a refresh is due)
// ---------------------------------------------------------------------------
router.get(
    '/me',
    requireAuth,
    asyncHandler(async (req, res) => {
        const body = publicUser(req.user);
        const claims = req.tokenClaims;
        if (claims && claims.iat) {
            const now = Math.floor(Date.now() / 1000);
            const signedInAt = Number(claims.at || claims.iat);
            if (now - claims.iat > REFRESH_AFTER_SEC && now - signedInAt < MAX_SESSION_AGE_SEC) {
                body.token = signToken(req.user, signedInAt);
            }
        }
        res.json(body);
    }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/logout-all — ends every session of this account (all
// devices, including this one).
// ---------------------------------------------------------------------------
router.post(
    '/logout-all',
    requireAuth,
    asyncHandler(async (req, res) => {
        if (process.env.LOCAL_MODE === 'true') return res.status(400).json({ error: 'nothing to sign out of on a single-user server' });
        await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
        res.json({ ok: true });
    }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/password  { currentPassword, newPassword } → { token }
// Changing the password signs out every other session.
// ---------------------------------------------------------------------------
router.post(
    '/password',
    authAttempts,
    requireAuth,
    asyncHandler(async (req, res) => {
        if (process.env.LOCAL_MODE === 'true') return res.status(400).json({ error: 'a single-user server has no password' });
        const { currentPassword, newPassword } = req.body || {};
        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || currentPassword.length > MAX_PASSWORD) {
            return res.status(400).json({ error: 'current and new password are required' });
        }
        if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
            return res.status(400).json({ error: `the new password needs ${MIN_PASSWORD}–${MAX_PASSWORD} characters` });
        }
        const key = `pw:${req.user._id}`;
        if (loginAttempts.blocked(key, res)) return;
        loginAttempts.reserve(key);
        const user = await User.findById(req.user._id).select('+passwordHash');
        if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
            return res.status(401).json({ error: 'the current password is not right' });
        }
        loginAttempts.clear(key);
        const updated = await User.findOneAndUpdate(
            { _id: user._id },
            { $set: { passwordHash: await hashPassword(newPassword) }, $inc: { tokenVersion: 1 } },
            { new: true },
        );
        res.json({ token: signToken(updated) });
    }),
);

// ---- helpers ---------------------------------------------------------------

// `v` = the user's tokenVersion; `at` = when this sign-in happened (kept
// across refreshes).
function signToken(user, signedInAt) {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
        { sub: String(user._id), v: user.tokenVersion || 0, at: signedInAt || now },
        process.env.JWT_SECRET,
        { expiresIn: ACCESS_TTL_SEC },
    );
}

function publicUser(u) {
    return {
        id: u._id,
        email: u.email,
        name: u.name,
        timezone: u.timezone,
        locale: u.locale,
        tweaks: u.tweaks,
        appearance: u.appearance || null,
        profile: u.profile,
    };
}

module.exports = router;

const jwt = require('jsonwebtoken');

const { User } = require('../models');

// Auth middleware — two modes (Build Brief §2.7):
//
//   LOCAL_MODE=true   Single-user local-first mode. Injects one fixed user
//                     (local@neuropal.app), creating it on first request.
//                     No token required, JWT verification skipped entirely.
//                     This is the mode for the personal Mac-Mini deployment.
//
//   LOCAL_MODE=false  The original JWT path, unchanged: token from
//                     `Authorization: Bearer <jwt>` or `x-session`, verified
//                     against JWT_SECRET, then the FULL User doc is loaded
//                     per request (so soft-deletes/changes apply immediately).
//
// Both paths hang `req.user` (full Mongoose doc) and `req.userId`.

const LOCAL_USER_EMAIL = 'local@neuropal.app';

// Cache the local user's _id after first lookup. We still re-load the full
// doc every request (preserves the established pattern — profile/tweaks
// changes take effect immediately); the cache only saves the email lookup.
let _localUserId = null;

async function resolveLocalUser() {
    let user = null;
    if (_localUserId) {
        user = await User.findOne({ _id: _localUserId, deletedAt: null });
    }
    if (!user) {
        user = await User.findOne({ email: LOCAL_USER_EMAIL, deletedAt: null });
    }
    if (!user) {
        try {
            user = await User.create({
                email: LOCAL_USER_EMAIL,
                // Never used for login — /login runs bcrypt.compare against
                // this plain marker and correctly fails. LOCAL_MODE doesn't
                // go through /login at all.
                passwordHash: 'local-mode-no-password-login-disabled',
                name: 'Ryx',
            });
        } catch (e) {
            // Duplicate-key race (two first-requests at once): fetch the row
            // the other request created.
            if (e && e.code === 11000) {
                user = await User.findOne({ email: LOCAL_USER_EMAIL, deletedAt: null });
            } else {
                throw e;
            }
        }
    }
    if (user) _localUserId = user._id;
    return user;
}

module.exports = async function requireAuth(req, res, next) {
    try {
        // ---- LOCAL_MODE: fixed single user, no token ----------------------
        if (process.env.LOCAL_MODE === 'true') {
            const user = await resolveLocalUser();
            if (!user) {
                return res
                    .status(500)
                    .json({ error: 'LOCAL_MODE user could not be created' });
            }
            req.user = user;
            req.userId = user._id;
            return next();
        }

        // ---- Standard JWT path (unchanged) ---------------------------------
        const header = req.headers.authorization || '';
        const token =
            header.replace(/^Bearer\s+/i, '') || req.headers['x-session'];

        if (!token) {
            return res.status(401).json({ error: 'Missing token' });
        }

        let payload;
        try {
            payload = jwt.verify(token, secret());
        } catch (e) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const user = await User.findOne({
            _id: payload.sub,
            deletedAt: null,
        });
        if (!user) {
            return res.status(401).json({ error: 'Account no longer active' });
        }

        req.user = user;
        req.userId = user._id;
        next();
    } catch (err) {
        next(err);
    }
};

function secret() {
    const s = process.env.JWT_SECRET;
    if (!s || s.length < 32) {
        throw new Error('JWT_SECRET must be set and at least 32 chars');
    }
    return s;
}

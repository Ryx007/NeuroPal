const crypto = require('crypto');

// Small in-memory rate limiting for the public deployment (one API process,
// so a Map is enough; no new dependency).
//
//   clientIp(req)    the caller's network. Behind the Cloudflare Tunnel every
//                    request arrives from the cloudflared container, so with
//                    TRUST_CLOUDFLARE=true the edge's CF-Connecting-IP header is
//                    used instead. Only set that when the API is reachable
//                    SOLELY through the tunnel (no published port), or a client
//                    could send the header itself. IPv6 callers are grouped by
//                    /64 — one customer gets a whole /64, so per-address limits
//                    would be free to dodge.
//   rateLimit(opts)  fixed-window counter middleware → 429 + Retry-After.
//   failureCounter   failed attempts per key (an account) so one account can't
//                    be password-guessed from many networks. Keys are hashed
//                    and every store is size-capped, so an attacker can't grow
//                    memory with huge or endless keys.

const MAX_KEYS = Number(process.env.RATE_LIMIT_MAX_KEYS || 50000);

function ipv6Prefix64(ip) {
    let addr = ip.split('%')[0];
    if (addr.includes('.')) return addr; // IPv4-mapped/compatible: keep as is
    const [head, tail = ''] = addr.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const missing = addr.includes('::') ? 8 - h.length - t.length : 0;
    const full = [...h, ...Array(Math.max(0, missing)).fill('0'), ...t];
    return `${full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

function clientIp(req) {
    let ip = null;
    if (process.env.TRUST_CLOUDFLARE === 'true') {
        const cf = req.headers['cf-connecting-ip'];
        if (cf) ip = String(cf).trim();
    }
    if (!ip) ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    return ip.includes(':') ? ipv6Prefix64(ip) : ip;
}

function hashKey(key) {
    return crypto.createHash('sha256').update(String(key)).digest('base64');
}

function createWindowStore(windowMs) {
    const hits = new Map(); // hashed key -> { count, resetAt }
    const sweep = () => {
        const now = Date.now();
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    };
    const timer = setInterval(sweep, Math.max(windowMs, 60 * 1000));
    if (timer.unref) timer.unref();

    return {
        hit(key) {
            const k = hashKey(key);
            const now = Date.now();
            let entry = hits.get(k);
            if (!entry || entry.resetAt <= now) {
                if (!entry && hits.size >= MAX_KEYS) {
                    // Full (someone is churning keys): refuse NEW keys until
                    // the timer sweeps expired ones. Never evict — that would
                    // drop an active lockout.
                    return { count: Infinity, resetAt: now + Math.min(windowMs, 60 * 1000), full: true };
                }
                entry = { count: 0, resetAt: now + windowMs };
                hits.set(k, entry);
            }
            entry.count += 1;
            return entry;
        },
        peek(key) {
            const entry = hits.get(hashKey(key));
            if (!entry || entry.resetAt <= Date.now()) {
                // a full store can't track a new key — treat it as limited
                if (!entry && hits.size >= MAX_KEYS) return { count: Infinity, resetAt: Date.now() + 60 * 1000 };
                return null;
            }
            return entry;
        },
        reset(key) {
            hits.delete(hashKey(key));
        },
    };
}

function tooMany(res, entry, message) {
    const retrySec = Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
    res.set('Retry-After', String(retrySec));
    return res.status(429).json({ error: message, retryAfterSec: retrySec });
}

// opts: { windowMs, max, name, message }
function rateLimit({ windowMs, max, name = 'rl', message = 'Too many requests — try again later' }) {
    const store = createWindowStore(windowMs);
    return function rateLimitMiddleware(req, res, next) {
        const entry = store.hit(`${name}:${clientIp(req)}`);
        if (entry.count > max) return tooMany(res, entry, message);
        next();
    };
}

// Attempts per key (an email). reserve() BEFORE the password check — so a
// burst of parallel guesses is counted up front, not after the slow compare —
// then clear() on success. blocked() is true once `max` attempts are used.
function failureCounter({ windowMs, max, message = 'Too many failed attempts — try again later' }) {
    const store = createWindowStore(windowMs);
    return {
        blocked(key, res) {
            const entry = store.peek(key);
            if (entry && entry.count >= max) {
                tooMany(res, entry, message);
                return true;
            }
            return false;
        },
        reserve(key) {
            store.hit(key);
        },
        clear(key) {
            store.reset(key);
        },
    };
}

module.exports = { clientIp, rateLimit, failureCounter, ipv6Prefix64 };

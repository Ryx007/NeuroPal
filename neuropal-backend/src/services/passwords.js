const crypto = require('crypto');
const { promisify } = require('util');

// Password hashing for a public server.
//
// New hashes use Node's built-in scrypt (memory-hard; runs on libuv's thread
// pool, so a flood of logins can't freeze the event loop the way pure-JS
// bcrypt does — measured 334 ms of main-thread CPU per bcryptjs compare).
// Older bcrypt hashes ("$2…") still verify, so nothing breaks for existing
// accounts. A small gate caps concurrent hash work; past a short queue the
// caller gets `busy` and answers 503 instead of letting work pile up.
//
// Format: scrypt$N$r$p$<salt b64>$<hash b64>

const scrypt = promisify(crypto.scrypt);
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 64 * 1024 * 1024;

const MAX_ACTIVE = 2;
const MAX_QUEUED = 16;
let active = 0;
const queue = [];

class BusyError extends Error {
    constructor() {
        super('The server is busy — try again in a moment');
        this.status = 503;
        this.expose = true;
    }
}

function gate(fn) {
    return new Promise((resolve, reject) => {
        const run = () => {
            active += 1;
            Promise.resolve()
                .then(fn)
                .then(resolve, reject)
                .finally(() => {
                    active -= 1;
                    const next = queue.shift();
                    if (next) next();
                });
        };
        if (active < MAX_ACTIVE) run();
        else if (queue.length < MAX_QUEUED) queue.push(run);
        else reject(new BusyError());
    });
}

async function hashPassword(password) {
    return gate(async () => {
        const salt = crypto.randomBytes(16);
        const key = await scrypt(String(password), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
        return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
    });
}

async function verifyPassword(password, stored) {
    const value = String(stored || '');
    if (value.startsWith('scrypt$')) {
        const parts = value.split('$');
        if (parts.length !== 6) return false;
        const [, n, r, p, saltB64, hashB64] = parts;
        const expected = Buffer.from(hashB64, 'base64');
        return gate(async () => {
            const key = await scrypt(String(password), Buffer.from(saltB64, 'base64'), expected.length, {
                N: Number(n),
                r: Number(r),
                p: Number(p),
                maxmem: MAXMEM,
            });
            return key.length === expected.length && crypto.timingSafeEqual(key, expected);
        });
    }
    if (value.startsWith('$2')) {
        const bcrypt = require('bcryptjs');
        return gate(() => bcrypt.compare(String(password), value));
    }
    return false; // e.g. the LOCAL_MODE marker — never a valid login
}

// For an unknown email: spend the same work so timing doesn't reveal which
// accounts exist.
let dummy = null;
async function burnDummyCheck(password) {
    if (!dummy) dummy = await hashPassword(crypto.randomBytes(12).toString('hex'));
    await verifyPassword(password, dummy);
    return false;
}

module.exports = { hashPassword, verifyPassword, burnDummyCheck, BusyError };

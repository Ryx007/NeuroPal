// The signed-in (public server) path: invite-only sign-up, login throttles,
// sliding sessions, and document tickets for the requests that can't send a
// header. Real in-memory MongoDB, real HTTP. Run: npm test
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const AdmZip = require('adm-zip');
const { MongoMemoryServer } = require('mongodb-memory-server');

const SECRET = 'test-secret-'.padEnd(48, 'x');
const INVITE = 'letmein-2026';
let mongod;
let server;
let base;
let storage;

before(async () => {
    process.env.LOCAL_MODE = 'false';
    process.env.JWT_SECRET = SECRET;
    process.env.SIGNUP_MODE = 'invite';
    process.env.SIGNUP_INVITE_CODE = INVITE;
    storage = fs.mkdtempSync(path.join(os.tmpdir(), 'np-storage-'));
    process.env.STORAGE_ROOT = storage;
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    const buildApp = require('../src/app');
    server = buildApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
    await mongod.stop();
    fs.rmSync(storage, { recursive: true, force: true });
});

const post = (p, body, headers = {}) =>
    fetch(`${base}${p}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
const bearer = (t) => ({ authorization: `Bearer ${t}` });

let token; // Ryx's session
let userId;

test('config tells the client sign-in is on and sign-up needs an invite', async () => {
    const r = await fetch(`${base}/api/auth/config`);
    assert.deepEqual(await r.json(), { localMode: false, signup: 'invite' });
});

test('sign-up without the right invite code is refused', async () => {
    const none = await post('/api/auth/register', { email: 'a@b.co', password: 'longenough1' });
    assert.equal(none.status, 403);
    const wrong = await post('/api/auth/register', { email: 'a@b.co', password: 'longenough1', inviteCode: 'nope' });
    assert.equal(wrong.status, 403);
});

test('sign-up with the invite code returns a working session', async () => {
    const r = await post('/api/auth/register', {
        email: 'Ryx@Example.com',
        password: 'correct horse battery',
        name: 'Ryx',
        inviteCode: ` ${INVITE} `,
    });
    assert.equal(r.status, 201);
    const body = await r.json();
    token = body.token;
    userId = body.user.id;
    assert.ok(token);
    assert.equal(body.user.email, 'ryx@example.com');

    const anon = await fetch(`${base}/api/auth/me`);
    assert.equal(anon.status, 401);
    const me = await fetch(`${base}/api/auth/me`, { headers: bearer(token) });
    assert.equal(me.status, 200);
    const meBody = await me.json();
    assert.equal(meBody.name, 'Ryx');
    assert.equal(meBody.token, undefined, 'a fresh token is not refreshed');
});

test('a day-old token is swapped for a fresh one on /me', async () => {
    const old = jwt.sign({ sub: userId, iat: Math.floor(Date.now() / 1000) - 2 * 86400 }, SECRET, {
        expiresIn: '30d',
    });
    const r = await fetch(`${base}/api/auth/me`, { headers: bearer(old) });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.token, 'refreshed token returned');
    assert.ok(jwt.verify(body.token, SECRET).iat > Math.floor(Date.now() / 1000) - 60);
});

test('8 wrong passwords lock the account for a while, even with the right one', async () => {
    for (let i = 0; i < 8; i += 1) {
        const r = await post('/api/auth/login', { email: 'ryx@example.com', password: `wrong-${i}` });
        assert.equal(r.status, 401);
    }
    const locked = await post('/api/auth/login', { email: 'ryx@example.com', password: 'correct horse battery' });
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers.get('retry-after')) > 0);
    // a different account is not affected
    const other = await post('/api/auth/login', { email: 'someone@else.co', password: 'whatever12' });
    assert.equal(other.status, 401);
});

let docId;
let otherDocId;

test('a document ticket reads that EPUB through the path, and nothing else', async () => {
    // A tiny EPUB-shaped zip on disk, owned by Ryx.
    const rel = path.join('documents', String(userId), 'tiny.epub');
    fs.mkdirSync(path.join(storage, 'documents', String(userId)), { recursive: true });
    const zip = new AdmZip();
    zip.addFile('META-INF/container.xml', Buffer.from('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'));
    zip.addFile('OEBPS/content.opf', Buffer.from('<package><manifest><item id="c1" href="ch1.xhtml"/><item id="s" href="style.css"/></manifest><spine><itemref idref="c1"/></spine></package>'));
    zip.addFile('OEBPS/ch1.xhtml', Buffer.from('<html><body><p>Chapter one</p></body></html>'));
    zip.addFile('OEBPS/style.css', Buffer.from('p{color:red}'));
    zip.writeZip(path.join(storage, rel));
    const { Document } = require('../src/models');
    const doc = await Document.create({ userId, title: 'Tiny', type: 'epub', file: { relativePath: rel } });
    const other = await Document.create({ userId, title: 'Other', type: 'epub', file: { relativePath: rel } });
    docId = String(doc._id);
    otherDocId = String(other._id);

    // no header, no ticket → refused
    const anon = await fetch(`${base}/api/documents/${docId}/epub/OEBPS/ch1.xhtml`);
    assert.equal(anon.status, 401);

    const t = await (await fetch(`${base}/api/documents/${docId}/ticket`, { headers: bearer(token) })).json();
    assert.ok(t.ticket && t.expiresAt);

    const ch = await fetch(`${base}/api/documents/${docId}/epub/t/${t.ticket}/OEBPS/ch1.xhtml`);
    assert.equal(ch.status, 200);
    assert.match(await ch.text(), /Chapter one/);
    // a relative sibling resolves inside the same ticketed path
    const css = await fetch(`${base}/api/documents/${docId}/epub/t/${t.ticket}/OEBPS/style.css`);
    assert.equal(css.status, 200);
    assert.equal(css.headers.get('cache-control'), 'private, max-age=86400');
    assert.equal(css.headers.get('content-security-policy'), 'sandbox');
    // served from the unpacked folder: the manifest came from the child
    const manifest = await (await fetch(`${base}/api/documents/${docId}/epub-manifest`, { headers: bearer(token) })).json();
    assert.equal(manifest.spine[0].href, 'OEBPS/ch1.xhtml');
    // no way out of the book's folder, and its marker file isn't served
    const escape = await fetch(`${base}/api/documents/${docId}/epub/t/${t.ticket}/..%2F..%2Fdocuments`);
    assert.equal(escape.status, 404);
    const marker = await fetch(`${base}/api/documents/${docId}/epub/t/${t.ticket}/.complete`);
    assert.equal(marker.status, 404);

    // the ticket is for ONE document
    const cross = await fetch(`${base}/api/documents/${otherDocId}/epub/t/${t.ticket}/OEBPS/ch1.xhtml`);
    assert.equal(cross.status, 401);
    // and is never a session
    const asSession = await fetch(`${base}/api/auth/me`, { headers: bearer(t.ticket) });
    assert.equal(asSession.status, 401);
    // nor is a session token accepted as a ticket
    const sessionAsTicket = await fetch(`${base}/api/documents/${docId}/epub/t/${token}/OEBPS/ch1.xhtml`);
    assert.equal(sessionAsTicket.status, 401);
});

test("someone else's session can't get a ticket for Ryx's document", async () => {
    const r = await post('/api/auth/register', {
        email: 'friend@example.com',
        password: 'another long one',
        inviteCode: INVITE,
    });
    const friend = (await r.json()).token;
    const t = await fetch(`${base}/api/documents/${docId}/ticket`, { headers: bearer(friend) });
    assert.equal(t.status, 404);
});

test('sign out everywhere ends every session; a password change does too', async () => {
    const login = async (password) =>
        (await post('/api/auth/login', { email: 'friend@example.com', password })).json();
    const a = (await login('another long one')).token;
    const b = (await login('another long one')).token;
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: bearer(a) })).status, 200);

    const out = await post('/api/auth/logout-all', {}, bearer(a));
    assert.equal(out.status, 200);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: bearer(a) })).status, 401);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: bearer(b) })).status, 401);

    const c = (await login('another long one')).token;
    const wrong = await post('/api/auth/password', { currentPassword: 'nope nope nope', newPassword: 'brand new secret' }, bearer(c));
    assert.equal(wrong.status, 401);
    const changed = await post('/api/auth/password', { currentPassword: 'another long one', newPassword: 'brand new secret' }, bearer(c));
    assert.equal(changed.status, 200);
    const fresh = (await changed.json()).token;
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: bearer(c) })).status, 401, 'old session ended');
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: bearer(fresh) })).status, 200);
    assert.equal((await post('/api/auth/login', { email: 'friend@example.com', password: 'brand new secret' })).status, 200);
});

test('a session stops refreshing 90 days after the sign-in', async () => {
    const now = Math.floor(Date.now() / 1000);
    const old = jwt.sign({ sub: userId, v: 0, at: now - 91 * 86400, iat: now - 2 * 86400 }, SECRET, { expiresIn: '30d' });
    const r = await fetch(`${base}/api/auth/me`, { headers: bearer(old) });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).token, undefined);
});

test('an oversized email is refused before it is stored or hashed', async () => {
    const huge = `${'a'.repeat(300000)}@x.co`;
    const t0 = Date.now();
    const r = await post('/api/auth/login', { email: huge, password: 'whatever12' });
    assert.equal(r.status, 401);
    assert.ok(Date.now() - t0 < 1000);
    const reg = await post('/api/auth/register', { email: huge, password: 'whatever12', inviteCode: INVITE });
    assert.equal(reg.status, 400);
});

test('a public server ignores a request asking for another AI provider', () => {
    const { activeProvider } = require('../src/services/aiProvider');
    process.env.AI_PROVIDER = 'gemini';
    assert.equal(activeProvider('anthropic'), 'gemini');
    assert.equal(activeProvider(), 'gemini');
});

test('each account has a daily AI budget', () => {
    const { spendAiBudget, _resetAiBudgets } = require('../src/services/aiBudget');
    _resetAiBudgets();
    process.env.AI_DAILY_LIMIT_PER_USER = '2';
    const sent = [];
    const res = { status(c) { this.code = c; return this; }, json(b) { sent.push([this.code, b]); return this; } };
    assert.equal(spendAiBudget({ userId: 'u1' }, res), true);
    assert.equal(spendAiBudget({ userId: 'u1' }, res), true);
    assert.equal(spendAiBudget({ userId: 'u1' }, res), false);
    assert.equal(sent[0][0], 429);
    assert.equal(spendAiBudget({ userId: 'u2' }, res), true, 'another account is unaffected');
    delete process.env.AI_DAILY_LIMIT_PER_USER;
});

test('IPv6 callers are grouped by /64 for rate limits', () => {
    const { ipv6Prefix64 } = require('../src/middleware/rateLimit');
    assert.equal(ipv6Prefix64('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
    assert.equal(ipv6Prefix64('2001:db8:1:2::9'), '2001:db8:1:2::/64');
    assert.equal(ipv6Prefix64('2001:db8::1'), '2001:db8:0:0::/64');
});

test('the server refuses to start in no-login mode on a public deployment', () => {
    const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
        env: { ...process.env, PUBLIC_DEPLOYMENT: 'true', LOCAL_MODE: 'true', MONGODB_URI: 'mongodb://127.0.0.1:1/x' },
        encoding: 'utf8',
        timeout: 20000,
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /LOCAL_MODE=true on a PUBLIC_DEPLOYMENT/);
});

test('…and without a real JWT secret when sign-in is on', () => {
    const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
        env: { ...process.env, LOCAL_MODE: 'false', JWT_SECRET: 'CHANGE_ME', MONGODB_URI: 'mongodb://127.0.0.1:1/x' },
        encoding: 'utf8',
        timeout: 20000,
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /JWT_SECRET must be a real secret/);
});

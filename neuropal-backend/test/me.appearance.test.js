// Integration test for the v2 appearance endpoints against a real (in-memory)
// MongoDB. Run: npm test   (first run downloads a mongod binary, ~100 MB).
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let server;
let base;

before(async () => {
    process.env.LOCAL_MODE = 'true';
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
});

// Stamps relative to the real clock, so the suite passes on any date.
const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString();
const HOUR = 3600 * 1000;

const put = (appearance) =>
    fetch(`${base}/api/me/appearance`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appearance }),
    });

test('GET returns null before anything was saved', async () => {
    const r = await fetch(`${base}/api/me/appearance`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { appearance: null });
});

test('PUT normalises junk and stores it; /auth/me carries it', async () => {
    const r = await put({
        skin: 'signal',
        signal: { acc: '#abc', base: 'Lava', brutality: 9 },
        pal: { name: '  Quarky the very long name ', colour: 'Mint' },
        home: { tiles: [{ id: 'reading', size: 'L' }, { id: 'ghost' }], rules: [{ scope: 'Weekdays', tile: 'reading', act: 'first' }] },
        updatedAt: iso(-2 * HOUR),
        extra: 'dropped',
    });
    assert.equal(r.status, 200);
    const { appearance } = await r.json();
    assert.equal(appearance.skin, 'signal');
    assert.equal(appearance.signal.acc, '#AABBCC');
    assert.equal(appearance.signal.base, 'Graphite');
    assert.equal(appearance.signal.brutality, 2);
    assert.equal(appearance.pal.name, 'Quarky the ver');
    assert.equal(appearance.pal.colour, 'Mint');
    assert.equal(appearance.home.tiles[0].id, 'reading');
    assert.equal(appearance.home.tiles.length, 6);
    assert.deepEqual(appearance.home.rules, [{ scope: 'Weekdays', tile: 'reading', act: 'first' }]);
    assert.equal(appearance.extra, undefined);

    const me = await (await fetch(`${base}/api/auth/me`)).json();
    assert.equal(me.appearance.signal.acc, '#AABBCC');
});

test('an older copy is refused with 409 and the stored copy', async () => {
    const r = await put({ skin: 'classic', updatedAt: iso(-26 * HOUR) });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.appearance.skin, 'signal');
});

test('a newer copy wins', async () => {
    const r = await put({ skin: 'classic', classic: { theme: 'sepia', accent: 'green' }, updatedAt: iso(-1 * HOUR) });
    assert.equal(r.status, 200);
    const got = await (await fetch(`${base}/api/me/appearance`)).json();
    assert.equal(got.appearance.skin, 'classic');
    assert.deepEqual(got.appearance.classic, { theme: 'sepia', accent: 'green' });
});

test('non-object payloads are rejected', async () => {
    const r = await fetch(`${base}/api/me/appearance`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appearance: 'signal' }),
    });
    assert.equal(r.status, 422);
});

test('a stamp from the future is clamped to the server clock', async () => {
    const r = await put({ skin: 'signal', updatedAt: '9999-12-31T00:00:00.000Z' });
    assert.equal(r.status, 200);
    const { appearance } = await r.json();
    assert.ok(Date.parse(appearance.updatedAt) <= Date.now(), appearance.updatedAt);
    // …so a device with a correct clock can still save right after.
    const ok = await put({ skin: 'classic', updatedAt: iso(0) });
    assert.equal(ok.status, 200);
});

test('a bogus future stamp already stored does not lock other devices out', async () => {
    await mongoose.connection.collection('users').updateMany({}, { $set: { 'appearance.updatedAt': '9999-12-31T00:00:00.000Z' } });
    const r = await put({ skin: 'signal', updatedAt: iso(0) });
    assert.equal(r.status, 200);
});

test('prototype names and nested nulls normalise instead of crashing clients', async () => {
    const r = await put({ pal: { talk: 'constructor', voice: '__proto__' }, classic: null, signal: null, updatedAt: iso(0) });
    assert.equal(r.status, 200);
    const { appearance } = await r.json();
    assert.equal(appearance.pal.talk, 'Gentle');
    assert.equal(appearance.pal.voice, 'Soft');
    assert.deepEqual(appearance.classic, { theme: 'dark', accent: 'ruby' });
});

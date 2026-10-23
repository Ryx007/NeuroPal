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
        updatedAt: '2026-10-23T10:00:00.000Z',
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
    const r = await put({ skin: 'classic', updatedAt: '2026-10-22T10:00:00.000Z' });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.appearance.skin, 'signal');
});

test('a newer copy wins', async () => {
    const r = await put({ skin: 'classic', classic: { theme: 'sepia', accent: 'green' }, updatedAt: '2026-10-24T10:00:00.000Z' });
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

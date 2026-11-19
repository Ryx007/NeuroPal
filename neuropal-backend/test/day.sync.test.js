// Day sync over HTTP (docs/DAY-SYNC.md): POST /api/me/day/sync, GET and
// DELETE /api/me/day against a real in-memory MongoDB, in public sign-in
// mode with separate accounts. The merge rules themselves are covered in
// day.merge.test.js. Run: npm test
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const SECRET = 'day-sync-test-secret-'.padEnd(48, 'x');
let mongod;
let server;
let base;
let models;

before(async () => {
    process.env.LOCAL_MODE = 'false';
    process.env.JWT_SECRET = SECRET;
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    models = require('../src/models');
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

let accounts = 0;
async function account(name = 'someone') {
    accounts += 1;
    const user = await models.User.create({ email: `${name}-${accounts}@example.com`, passwordHash: 'x', name });
    return { id: user._id, token: jwt.sign({ sub: String(user._id), v: 0 }, SECRET, { expiresIn: '1h' }) };
}

function call(method, path, who, body, rawText) {
    const headers = {};
    if (who) headers.authorization = `Bearer ${who.token}`;
    if (body !== undefined || rawText !== undefined) headers['content-type'] = 'application/json';
    return fetch(`${base}${path}`, {
        method,
        headers,
        body: rawText !== undefined ? rawText : body === undefined ? undefined : JSON.stringify(body),
    });
}
async function sync(who, body) {
    const r = await call('POST', '/api/me/day/sync', who, { v: 1, ...body });
    return { status: r.status, body: await r.json() };
}
async function getDay(who) {
    const r = await call('GET', '/api/me/day', who);
    return { status: r.status, body: await r.json() };
}
const withoutTime = ({ serverTime, ...rest }) => rest;
const storedDay = (who) => mongoose.connection.collection('daystates').findOne({ userId: who.id });
const storedDayUpdate = (who, fields) => mongoose.connection.collection('daystates').updateOne({ userId: who.id }, { $set: fields });

// Stamps relative to the real clock (one fixed base per test), so the suite
// passes on any date and every stamp is in the past unless a test says so.
function clock() {
    const t0 = Date.now();
    return (ms = 0) => new Date(t0 + ms).toISOString();
}
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const EPOCH = '1970-01-01T00:00:00.000Z';
const PAST = '2026-11-01T08:00:00.000Z';

const anchor = (id, over = {}) => ({
    id,
    title: `Anchor ${id}`,
    subtitle: '',
    time: { hour: 9, minute: 0 },
    createdAt: PAST,
    updatedAt: PAST,
    deletedAt: null,
    doneOn: null,
    tickAt: null,
    ...over,
});
const task = (id, over = {}) => ({ id, title: `Task ${id}`, subtitle: '', createdAt: EPOCH, updatedAt: EPOCH, deletedAt: null, doneOn: null, tickAt: null, ...over });
const todo = (id, over = {}) => ({ id, title: `To-do ${id}`, done: false, createdAt: PAST, updatedAt: PAST, deletedAt: null, ...over });
const line = (id, over = {}) => ({ id, text: `Thought ${id}`, at: PAST, deletedAt: null, ...over });
const checkin = (at, state = 'yellow', level = 0.5) => ({ at, state, level });

// The compare-and-set loop itself, as if several API processes raced: the
// per-person queue (one process) is turned off for the test.
function withoutQueue(fn) {
    return async () => {
        process.env.NP_DAY_QUEUE = 'off';
        try {
            await fn();
        } finally {
            delete process.env.NP_DAY_QUEUE;
        }
    };
}

test('every endpoint needs a session in public mode', async () => {
    assert.equal((await call('GET', '/api/me/day')).status, 401);
    assert.equal((await call('POST', '/api/me/day/sync', null, { v: 1 })).status, 401);
    assert.equal((await call('DELETE', '/api/me/day')).status, 401);
    const forged = { token: jwt.sign({ sub: String(new mongoose.Types.ObjectId()), v: 0 }, 'not-the-secret-'.padEnd(48, 'y')) };
    assert.equal((await call('GET', '/api/me/day', forged)).status, 401);
});

test('a day that never synced: gen 1, rev 0, everything empty, nothing created by reading', async () => {
    const me = await account();
    const { status, body } = await getDay(me);
    assert.equal(status, 200);
    assert.deepEqual(withoutTime(body), { v: 1, gen: 1, rev: 0, erased: false, anchors: [], tasks: [], todos: [], dump: [], checkins: [] });
    assert.ok(Math.abs(Date.parse(body.serverTime) - Date.now()) < 10000);
    assert.equal(await models.DayState.countDocuments({ userId: me.id }), 0);
});

test('422 only for a body that is not an object or v other than 1; bad items are dropped, not errors', async () => {
    const me = await account();
    const raw = (text) => call('POST', '/api/me/day/sync', me, undefined, text);
    for (const text of ['[1,2]', '{}', '{"v":2}', '{"v":"1"}']) {
        const r = await raw(text);
        assert.equal(r.status, 422, text);
        assert.ok((await r.json()).error);
    }
    const r = await sync(me, {
        anchors: 'not a list',
        tasks: [1, null, 'x', { id: 'bad id', title: 'T', createdAt: PAST, updatedAt: PAST }, { id: 'no-title', createdAt: PAST, updatedAt: PAST }],
        dump: [{ id: 'd-1', text: 'no time' }],
        checkins: [{ at: 'soon', state: 'red' }, { at: PAST, state: 'blue' }],
    });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.anchors, r.body.tasks, r.body.dump, r.body.checkins, r.body.rev], [[], [], [], [], 0]);
});

test('a sync answers the whole merged day, cleaned and ordered; an identical resend leaves rev alone', async () => {
    const me = await account();
    const at = clock();
    const body = {
        anchors: [
            anchor('a-late', { title: 'Wind down', time: { hour: 21, minute: 30 } }),
            anchor('a-early', {
                title: '  Morning \n  meds ',
                subtitle: 'Blue, with water',
                time: { hour: 8, minute: 15 },
                flexMinutes: 30,
                category: 'medication',
                icon: 'medication',
                createdAt: at(-2 * DAY),
                updatedAt: at(-DAY),
                doneOn: '2026-11-19',
                tickAt: at(-HOUR),
            }),
        ],
        tasks: [task('mvd-2'), task('mvd-1')],
        todos: [todo('td-2', { createdAt: at(-MIN) }), todo('td-1', { createdAt: at(-2 * MIN), done: true })],
        dump: [line('d-old', { at: at(-2 * HOUR) }), line('d-new', { at: at(-HOUR) })],
        checkins: [checkin(at(-30 * MIN), 'red', 0.9), checkin(at(-10 * MIN), 'green', 0.2)],
    };
    const first = await sync(me, body);
    assert.equal(first.status, 200);
    assert.equal(first.body.rev, 1);
    assert.equal(first.body.erased, false);
    assert.deepEqual(first.body.anchors[0], {
        id: 'a-early',
        title: 'Morning meds',
        subtitle: 'Blue, with water',
        time: { hour: 8, minute: 15 },
        flexMinutes: 30,
        category: 'medication',
        icon: 'medication',
        createdAt: at(-2 * DAY),
        updatedAt: at(-DAY),
        deletedAt: null,
        doneOn: '2026-11-19',
        tickAt: at(-HOUR),
    });
    assert.deepEqual(Object.keys(first.body.anchors[1]), ['id', 'title', 'subtitle', 'time', 'createdAt', 'updatedAt', 'deletedAt', 'doneOn', 'tickAt']);
    assert.deepEqual(first.body.anchors.map((a) => a.id), ['a-early', 'a-late'], 'by time of day');
    assert.deepEqual(first.body.tasks.map((t) => t.id), ['mvd-1', 'mvd-2'], 'by createdAt, then id');
    assert.deepEqual(first.body.todos.map((t) => [t.id, t.done]), [['td-1', true], ['td-2', false]]);
    assert.deepEqual(first.body.dump.map((d) => d.id), ['d-new', 'd-old'], 'newest first');
    assert.deepEqual(first.body.checkins, [checkin(at(-30 * MIN), 'red', 0.9), checkin(at(-10 * MIN), 'green', 0.2)]);

    const again = await sync(me, body);
    assert.equal(again.body.rev, 1, 'nothing changed, so rev stays');
    assert.deepEqual(withoutTime(again.body), withoutTime(first.body));
    assert.deepEqual(withoutTime((await getDay(me)).body), withoutTime(first.body));
    // a device that only knows some sections never touches the others
    const partial = await sync(me, { tasks: [task('mvd-1')] });
    assert.equal(partial.body.rev, 1);
    assert.equal(partial.body.dump.length, 2);
});

test('nothing from the request is stored as-is: unknown keys, __proto__ and constructor never reach the database', async () => {
    const me = await account();
    const at = clock();
    // Written by hand: JSON.stringify can't produce a literal "__proto__" key.
    const text =
        `{"v":1,"$set":{"rev":999},"anchors":[{"id":"a-1","title":"  Walk \\n\\n outside ","time":{"hour":7,"minute":5,"second":9},` +
        `"createdAt":"${at(-DAY)}","updatedAt":"2099-01-01T00:00:00Z","__proto__":{"admin":true},"constructor":{"prototype":{"x":1}},` +
        `"status":"done","location":{"lat":41.1,"lng":16.87,"radius":150,"__proto__":{"y":1}},"icon":"${'i'.repeat(50)}"}],` +
        `"todos":[{"id":"td-1","title":"x","done":"yes","createdAt":"${at(-DAY)}","updatedAt":"${at(-DAY)}","deletedAt":null,"$where":"1"}],` +
        `"dump":[{"id":"d-1","text":"  a\\tb  ","at":"${at(-HOUR)}","mood":"low"}]}`;
    const r = await call('POST', '/api/me/day/sync', me, undefined, text);
    assert.equal(r.status, 200);
    const answer = await r.json();
    const stored = await storedDay(me);
    assert.deepEqual(Object.keys(stored).sort(), ['_id', 'anchors', 'createdAt', 'dump', 'gen', 'rev', 'tasks', 'todos', 'updatedAt', 'userId']);
    assert.equal(stored.rev, 1);
    const a = stored.anchors[0];
    assert.deepEqual(Object.keys(a), ['id', 'title', 'subtitle', 'time', 'icon', 'location', 'createdAt', 'updatedAt', 'deletedAt', 'doneOn', 'tickAt']);
    assert.equal(a.title, 'Walk outside');
    assert.deepEqual(a.time, { hour: 7, minute: 5 });
    assert.deepEqual(a.location, { lat: 41.1, lng: 16.87, radius: 150 });
    assert.equal(a.icon, 'i'.repeat(40));
    assert.equal(a.updatedAt, answer.serverTime, 'a stamp from the future is set to the server clock');
    assert.deepEqual(stored.todos[0], { id: 'td-1', title: 'x', done: false, createdAt: at(-DAY), updatedAt: at(-DAY), deletedAt: null });
    assert.deepEqual(stored.dump[0], { id: 'd-1', text: 'a b', at: at(-HOUR), deletedAt: null });
    assert.equal({}.admin, undefined);
});

test('a deletion leaves a tombstone without content; a stale copy cannot refill it; Undo is an edit', async () => {
    const me = await account();
    const at = clock();
    const original = anchor('a-1', { title: 'Therapy at five', createdAt: at(-DAY), updatedAt: at(-HOUR), doneOn: '2026-11-19', tickAt: at(-HOUR) });
    await sync(me, { anchors: [original] });
    const deleted = await sync(me, { anchors: [{ ...original, deletedAt: at(-MIN) }] });
    assert.deepEqual(deleted.body.anchors, [{ id: 'a-1', createdAt: at(-DAY), updatedAt: at(-HOUR), deletedAt: at(-MIN) }]);
    // a device that was offline edited it before the deletion and syncs now
    const stale = await sync(me, { anchors: [{ ...original, title: 'Therapy at six', updatedAt: at(-30 * MIN) }] });
    assert.deepEqual(stale.body.anchors, [{ id: 'a-1', createdAt: at(-DAY), updatedAt: at(-30 * MIN), deletedAt: at(-MIN) }]);
    assert.equal(JSON.stringify(await storedDay(me)).includes('Therapy'), false, 'the text is gone from the server');
    // Undo: the same item again with updatedAt = now
    const undo = await sync(me, { anchors: [{ ...original, updatedAt: at(0) }] });
    assert.equal(undo.body.anchors[0].title, 'Therapy at five');
    assert.equal(undo.body.anchors[0].deletedAt, null);
    assert.equal(undo.body.anchors[0].doneOn, '2026-11-19');
});

test('a tick on one device and an edit on another both survive; un-ticking is a tick', async () => {
    const me = await account();
    const at = clock();
    const starter = task('mvd-1', { title: 'Take meds' });
    await sync(me, { tasks: [starter] });
    await sync(me, { tasks: [{ ...starter, title: 'Take meds with food', updatedAt: at(-10 * MIN) }] });
    const ticked = await sync(me, { tasks: [{ ...starter, doneOn: '2026-11-19', tickAt: at(-5 * MIN) }] });
    assert.equal(ticked.body.tasks[0].title, 'Take meds with food', 'the tick did not bring back the old title');
    assert.equal(ticked.body.tasks[0].doneOn, '2026-11-19');
    const unticked = await sync(me, { tasks: [{ ...starter, doneOn: null, tickAt: at(-MIN) }] });
    assert.deepEqual([unticked.body.tasks[0].doneOn, unticked.body.tasks[0].tickAt], [null, at(-MIN)]);
    const late = await sync(me, { tasks: [{ ...starter, doneOn: '2026-11-19', tickAt: at(-5 * MIN) }] });
    assert.equal(late.body.tasks[0].doneOn, null, 'an older tick loses');
    assert.equal(late.body.rev, unticked.body.rev);
});

test('the brain dump keeps the first copy; a deleted line never comes back', async () => {
    const me = await account();
    const at = clock();
    const thought = line('d-1', { text: 'check the SPAD calibration', at: at(-HOUR) });
    await sync(me, { dump: [thought] });
    const again = await sync(me, { dump: [{ ...thought, text: 'something else', at: at(-30 * MIN) }] });
    assert.equal(again.body.dump[0].text, 'check the SPAD calibration');
    assert.equal(again.body.rev, 1);
    const deleted = await sync(me, { dump: [{ id: 'd-1', deletedAt: at(-MIN) }] });
    assert.deepEqual(deleted.body.dump, [{ id: 'd-1', deletedAt: at(-MIN) }]);
    const back = await sync(me, { dump: [thought] });
    assert.deepEqual(back.body.dump, [{ id: 'd-1', deletedAt: at(-MIN) }]);
    assert.equal(back.body.rev, deleted.body.rev);
});

test('check-ins: union by time, refined within a minute, the newest 200 sent oldest first', async () => {
    const me = await account();
    const at = clock();
    const first = await sync(me, {
        checkins: [checkin(at(-10 * MIN), 'red', 0.9), checkin(at(-10 * MIN + 30000), 'yellow', 0.6), checkin(at(-2 * MIN), 'green', 0.2)],
    });
    assert.deepEqual(first.body.checkins.map((c) => c.at), [at(-10 * MIN + 30000), at(-2 * MIN)]);
    assert.equal(first.body.rev, 1);
    // another device still has the check-in that was refined: nothing changes
    const old = await sync(me, { checkins: [checkin(at(-10 * MIN), 'red', 0.9)] });
    assert.equal(old.body.rev, 1);
    assert.equal(old.body.checkins.length, 2);
    // a new one 30 s after a stored one refines it
    const refined = await sync(me, { checkins: [checkin(at(-2 * MIN + 30000), 'green', 0.1)] });
    assert.deepEqual(refined.body.checkins.map((c) => c.at), [at(-10 * MIN + 30000), at(-2 * MIN + 30000)]);
    assert.equal(refined.body.rev, 2);
    // the same moment twice: the greater canonical JSON wins, in either order
    const tie = await sync(me, { checkins: [checkin(at(-2 * MIN + 30000), 'red', 0.1)] });
    assert.equal(tie.body.checkins[1].state, 'red');
    const smaller = await sync(me, { checkins: [checkin(at(-2 * MIN + 30000), 'green', 0.1)] });
    assert.equal(smaller.body.checkins[1].state, 'red');
    assert.equal(smaller.body.rev, tie.body.rev);
    const many = Array.from({ length: 250 }, (_, i) => checkin(at(-DAY + i * 2 * MIN)));
    const full = await sync(me, { checkins: many });
    assert.equal(full.body.checkins.length, 200);
    assert.equal(full.body.checkins[199].at, at(-2 * MIN + 30000));
    assert.deepEqual(full.body.checkins.map((c) => c.at), full.body.checkins.map((c) => c.at).sort());
    assert.equal(await models.DayCheckin.countDocuments({ userId: me.id }), 252);
});

test('the server keeps the newest 5000 check-ins; older ones change nothing', async () => {
    const me = await account();
    const at = clock();
    const batch = (from) => Array.from({ length: 2000 }, (_, i) => checkin(at(-30 * DAY + (from + i) * 2 * MIN)));
    for (const from of [0, 2000, 4000]) assert.equal((await sync(me, { checkins: batch(from) })).status, 200);
    assert.equal(await models.DayCheckin.countDocuments({ userId: me.id }), 5000);
    const oldest = await models.DayCheckin.findOne({ userId: me.id }).sort({ at: 1 }).lean();
    assert.equal(oldest.at.toISOString(), at(-30 * DAY + 1000 * 2 * MIN));
    const rev = (await getDay(me)).body.rev;
    const resend = await sync(me, { checkins: batch(0).slice(0, 50) });
    assert.equal(resend.body.rev, rev);
    assert.equal(await models.DayCheckin.countDocuments({ userId: me.id }), 5000);
});

test('stored caps: 200 live anchors, 3000 tombstones per section', async () => {
    const me = await account();
    const at = clock();
    const anchors = Array.from({ length: 205 }, (_, i) => anchor(`a-${i}`, { createdAt: at(-DAY + i * 1000), updatedAt: at(-DAY + i * 1000) }));
    const r = await sync(me, { anchors });
    assert.equal(r.body.anchors.length, 200);
    assert.ok(!r.body.anchors.some((a) => ['a-0', 'a-4'].includes(a.id)), 'the oldest went first');
    const gone = Array.from({ length: 3010 }, (_, i) => task(`t-${i}`, { createdAt: at(-DAY), updatedAt: at(-DAY), deletedAt: at(-DAY + (i + 1) * 1000) }));
    const t = await sync(me, { tasks: gone });
    assert.equal(t.body.tasks.length, 3000);
    assert.ok(!t.body.tasks.some((x) => ['t-0', 't-9'].includes(x.id)), 'the oldest deletions went first');
    assert.ok(t.body.tasks.some((x) => x.id === 't-10'));
});

test('clearing a full list of to-dos or dump lines: a device that synced before brings nothing back', async () => {
    const me = await account();
    const at = clock();
    const liveCount = (list) => list.filter((x) => x.deletedAt === null).length;
    // Both devices synced 1000 done to-dos and 1000 dump lines; then one
    // device clears them all ("Clear done", deleting line by line).
    const todos = Array.from({ length: 1000 }, (_, i) => todo(`td-${i}`, { done: true }));
    const dump = Array.from({ length: 1000 }, (_, i) => line(`d-${i}`, { text: `private thought ${i}`, at: at(-DAY + i * 1000) }));
    assert.equal((await sync(me, { todos, dump })).status, 200);
    const cleared = await sync(me, {
        todos: todos.map((t, i) => ({ ...t, deletedAt: at(-HOUR + i) })),
        dump: dump.map((d, i) => ({ id: d.id, deletedAt: at(-HOUR + i) })),
    });
    assert.deepEqual([liveCount(cleared.body.todos), liveCount(cleared.body.dump)], [0, 0]);
    // The other device still has them all and syncs late.
    const stale = await sync(me, { todos, dump });
    assert.deepEqual([liveCount(stale.body.todos), liveCount(stale.body.dump)], [0, 0], 'nothing deleted came back');
    assert.equal(JSON.stringify(stale.body).includes('private thought'), false);
});

test('one request holds a full section and all its tombstones', async () => {
    const me = await account();
    const at = clock();
    // A device with 3000 deletions kept, listed first, and 1000 live to-dos.
    const gone = Array.from({ length: 3000 }, (_, i) => ({ id: `g-${i}`, createdAt: PAST, updatedAt: PAST, deletedAt: at(-DAY + i * 1000) }));
    const live = Array.from({ length: 1000 }, (_, i) => todo(`l-${i}`, { createdAt: at(-HOUR + i), updatedAt: at(-HOUR + i) }));
    const r = await sync(me, { todos: [...gone, ...live] });
    assert.equal(r.status, 200);
    assert.equal(r.body.todos.filter((t) => t.deletedAt === null).length, 1000, 'no live to-do was cut off');
    assert.equal(r.body.todos.filter((t) => t.deletedAt !== null).length, 3000);
});

test('stored stamps are not clamped again when read back: a deletion stays a deletion', async () => {
    const me = await account();
    const at = clock();
    const therapy = task('t-1', { title: 'Therapy', createdAt: PAST, updatedAt: PAST });
    await sync(me, { tasks: [therapy] });
    // A deletion that arrived inside the 60-second clock slack, then the
    // server's clock stepped back: its stored stamps are now in the future.
    await storedDayUpdate(me, { tasks: [{ id: 't-1', createdAt: PAST, updatedAt: at(30 * 1000), deletedAt: at(90 * 1000) }] });
    const read = await getDay(me);
    assert.deepEqual(read.body.tasks, [{ id: 't-1', createdAt: PAST, updatedAt: at(30 * 1000), deletedAt: at(90 * 1000) }]);
    const stale = await sync(me, { tasks: [therapy] });
    assert.equal(stale.status, 200);
    assert.equal(stale.body.tasks.length, 1);
    assert.notEqual(stale.body.tasks[0].deletedAt, null, 'the stale copy did not bring "Therapy" back');
    assert.equal(JSON.stringify(stale.body).includes('Therapy'), false);
});

test('the sync body is read only after the session check', async () => {
    const me = await account();
    // Broken JSON: without a session the body is never parsed (401, not 400).
    assert.equal((await call('POST', '/api/me/day/sync', null, undefined, '{"v":1,')).status, 401);
    assert.equal((await call('POST', '/api/me/day/sync', me, undefined, '{"v":1,')).status, 400);
    // A body between the general 5 MB and this route's 10 MB, without a session.
    const big = JSON.stringify({ v: 1, dump: [{ id: 'd-1', text: 'x'.repeat(6 * 1024 * 1024), at: PAST }] });
    assert.equal((await call('POST', '/api/me/day/sync', null, undefined, big)).status, 401);
    // Other routes still parse first, with the general limit.
    assert.equal((await call('POST', '/api/auth/login', null, undefined, '{"email":')).status, 400);
});

test('this route takes a day at every cap (10 MB); other routes keep 5 MB', async () => {
    const me = await account();
    const at = clock();
    const long = '\u601d'.repeat(2000); // three bytes a character in UTF-8: about 6 KB a line
    const dump = Array.from({ length: 1000 }, (_, i) => line(`d-${i}`, { text: long, at: at(-DAY + i * 1000) }));
    const r = await sync(me, { dump });
    assert.equal(r.status, 200);
    assert.equal(r.body.dump.length, 1000);
    assert.equal(r.body.dump[0].text, long);
    const big = await call('POST', '/api/auth/login', null, undefined, JSON.stringify({ email: 'x@example.com', password: 'y'.repeat(6 * 1024 * 1024) }));
    assert.equal(big.status, 413);
});

test('gen: DELETE erases everywhere; an older gen gets the erased day; none, 0, equal or higher merge', async () => {
    const me = await account();
    const at = clock();
    const first = await sync(me, { anchors: [anchor('a-1')], dump: [line('d-1')], checkins: [checkin(at(-MIN))] });
    assert.equal(first.body.gen, 1);
    const del = await call('DELETE', '/api/me/day', me);
    assert.equal(del.status, 200);
    assert.deepEqual(await del.json(), { deleted: true, gen: 2 });
    const erased = await getDay(me);
    assert.equal(erased.body.gen, 2);
    assert.deepEqual([erased.body.anchors, erased.body.dump, erased.body.checkins], [[], [], []]);
    assert.equal(await models.DayCheckin.countDocuments({ userId: me.id }), 0, 'the history is gone from the disk');
    // a device that synced before the erase still holds gen 1 and its old day
    const stale = await sync(me, { gen: 1, anchors: [anchor('a-1')], dump: [line('d-1')], checkins: [checkin(at(-MIN))] });
    assert.equal(stale.body.erased, true);
    assert.equal(stale.body.gen, 2);
    assert.deepEqual([stale.body.anchors, stale.body.dump, stale.body.checkins], [[], [], []]);
    assert.equal(stale.body.rev, erased.body.rev, 'nothing was merged');
    // a device that never synced (no gen, or 0) adds its day back; so does one at the current gen
    const fresh = await sync(me, { anchors: [anchor('a-new')] });
    assert.deepEqual([fresh.body.erased, fresh.body.anchors.map((a) => a.id)], [false, ['a-new']]);
    assert.equal((await sync(me, { gen: 0, todos: [todo('td-1')] })).body.todos.length, 1);
    assert.equal((await sync(me, { gen: 2, tasks: [task('mvd-1')] })).body.tasks.length, 1);
    // a server restored from an older backup: the device's gen is higher, merge as usual
    const higher = await sync(me, { gen: 7, dump: [line('d-2')] });
    assert.deepEqual([higher.body.erased, higher.body.gen, higher.body.dump.length], [false, 2, 1]);
    // erasing a day that never synced still moves to gen 2
    const nobody = await account();
    assert.deepEqual(await (await call('DELETE', '/api/me/day', nobody)).json(), { deleted: true, gen: 2 });
});

test('one account can never read or change another account’s day', async () => {
    const ryx = await account('ryx');
    const friend = await account('friend');
    const at = clock();
    await sync(ryx, {
        anchors: [anchor('a-1', { title: 'Ryx meds' })],
        dump: [line('d-1', { text: 'a private thought' })],
        checkins: [checkin(at(-MIN), 'red', 1)],
    });
    const seen = await getDay(friend);
    assert.deepEqual([seen.body.anchors, seen.body.dump, seen.body.checkins], [[], [], []]);
    // the same ids from the friend's device stay the friend's
    const theirs = await sync(friend, { anchors: [anchor('a-1', { title: 'Friend walk', updatedAt: at(0) })], dump: [{ id: 'd-1', deletedAt: at(0) }] });
    assert.equal(theirs.body.anchors[0].title, 'Friend walk');
    assert.equal(JSON.stringify(theirs.body).includes('private thought'), false);
    assert.equal((await call('DELETE', '/api/me/day', friend)).status, 200);
    const mine = await getDay(ryx);
    assert.equal(mine.body.anchors[0].title, 'Ryx meds');
    assert.equal(mine.body.dump[0].text, 'a private thought');
    assert.equal(mine.body.checkins.length, 1);
    assert.equal(mine.body.gen, 1);
});

test('overlapping syncs for one person lose nothing, and each moves rev once (compare-and-set, no queue)', withoutQueue(async () => {
    const me = await account();
    const at = clock();
    await sync(me, { anchors: [anchor('seed')] }); // the document exists: these race on rev
    const N = 24;
    const results = await Promise.all(
        Array.from({ length: N }, (_, i) =>
            sync(me, {
                anchors: [anchor(`a-${i}`)],
                tasks: [task(`t-${i}`)],
                todos: [todo(`td-${i}`)],
                dump: [line(`d-${i}`)],
                checkins: [checkin(at(-HOUR + i * 2 * MIN))],
            }),
        ),
    );
    assert.deepEqual(results.map((r) => r.status), Array(N).fill(200));
    const { body } = await getDay(me);
    for (let i = 0; i < N; i += 1) {
        assert.ok(body.anchors.some((a) => a.id === `a-${i}`), `anchor ${i}`);
        assert.ok(body.tasks.some((t) => t.id === `t-${i}`), `task ${i}`);
        assert.ok(body.todos.some((t) => t.id === `td-${i}`), `to-do ${i}`);
        assert.ok(body.dump.some((d) => d.id === `d-${i}`), `dump ${i}`);
    }
    assert.equal(body.anchors.length, N + 1);
    assert.equal(body.checkins.length, N);
    assert.equal(body.rev, N + 1);
}));

test('queued: overlapping syncs of one person each take one round and lose nothing', async () => {
    const me = await account();
    await sync(me, { anchors: [anchor('seed')] });
    const model = models.DayState;
    const own = Object.prototype.hasOwnProperty.call(model, 'updateOne');
    const original = model.updateOne;
    let writes = 0;
    model.updateOne = function countWrites(...args) {
        writes += 1;
        return original.apply(this, args);
    };
    try {
        const N = 16;
        const results = await Promise.all(Array.from({ length: N }, (_, i) => sync(me, { todos: [todo(`td-${i}`)] })));
        assert.deepEqual(results.map((r) => r.status), Array(N).fill(200));
        assert.equal(writes, N, 'no sync lost a round to another one');
        const { body } = await getDay(me);
        assert.equal(body.todos.length, N);
        assert.equal(body.rev, N + 1);
    } finally {
        if (own) model.updateOne = original;
        else delete model.updateOne;
    }
});

test('the first syncs of a new person, racing each other, create one day (compare-and-set, no queue)', withoutQueue(async () => {
    const me = await account();
    const N = 12;
    const results = await Promise.all(Array.from({ length: N }, (_, i) => sync(me, { todos: [todo(`td-${i}`)] })));
    assert.deepEqual(results.map((r) => r.status), Array(N).fill(200));
    assert.equal(await models.DayState.countDocuments({ userId: me.id }), 1);
    const { body } = await getDay(me);
    assert.equal(body.todos.length, N);
    assert.equal(body.rev, N);
}));

test('check-ins sent at the same moment within a minute of each other still end up refined (compare-and-set, no queue)', withoutQueue(async () => {
    const me = await account();
    const at = clock();
    for (let round = 0; round < 8; round += 1) {
        const t = -DAY + round * 10 * MIN;
        await Promise.all([sync(me, { checkins: [checkin(at(t))] }), sync(me, { checkins: [checkin(at(t + 30000))] })]);
    }
    const rows = await models.DayCheckin.find({ userId: me.id }).sort({ at: 1 }).lean();
    assert.deepEqual(
        rows.map((r) => r.at.toISOString()),
        Array.from({ length: 8 }, (_, round) => at(-DAY + round * 10 * MIN + 30000)),
    );
}));

test('the same moment from two devices at once: the greater canonical JSON wins whatever the timing (compare-and-set, no queue)', withoutQueue(async () => {
    const me = await account();
    const at = clock();
    for (let round = 0; round < 8; round += 1) {
        const moment = at(-DAY + round * 10 * MIN);
        const send = (state) => sync(me, { checkins: [checkin(moment, state, 0.8)] });
        // Calls start in array order: odd rounds send green first.
        await Promise.all(round % 2 ? [send('green'), send('red')] : [send('red'), send('green')]);
    }
    const rows = await models.DayCheckin.find({ userId: me.id }).lean();
    assert.equal(rows.length, 8);
    assert.deepEqual(rows.map((r) => r.state), Array(8).fill('red'));
}));

test('an erase racing a sync wins: nothing of the old day survives, not even on disk', async () => {
    const me = await account();
    const at = clock();
    let gen = 1;
    for (let round = 0; round < 8; round += 1) {
        // Odd rounds give the sync a head start, so both orders happen.
        const lag = round % 2 ? 4 + round : 0;
        const [s, d] = await Promise.all([
            sync(me, { gen, anchors: [anchor(`a-${round}`)], checkins: [checkin(at(-HOUR + round * 2 * MIN))] }),
            new Promise((r) => setTimeout(r, lag)).then(() => call('DELETE', '/api/me/day', me)).then((r) => r.json()),
        ]);
        assert.equal(s.status, 200);
        gen = d.gen;
        const { body } = await getDay(me);
        assert.deepEqual([body.anchors, body.checkins], [[], []], `round ${round}`);
        assert.equal(await models.DayCheckin.countDocuments({ userId: me.id }), 0, `round ${round}`);
    }
});

test('check-in rows of an earlier generation are never shown and are cleared by the next sync', async () => {
    const me = await account();
    const at = clock();
    await sync(me, { checkins: [checkin(at(-HOUR))] });
    await call('DELETE', '/api/me/day', me);
    // What a sync that raced the erase (or crashed mid-way) could leave behind.
    await models.DayCheckin.collection.insertOne({ userId: me.id, gen: 1, at: new Date(at(-30 * MIN)), state: 'red', level: 1 });
    assert.deepEqual((await getDay(me)).body.checkins, []);
    const r = await sync(me, { checkins: [checkin(at(-29 * MIN))] });
    assert.deepEqual(r.body.checkins, [checkin(at(-29 * MIN))]);
    assert.equal(await models.DayCheckin.countDocuments({ userId: me.id, gen: 1 }), 0);
    // a new check-in at exactly the moment of a leftover row takes its place
    await models.DayCheckin.collection.insertOne({ userId: me.id, gen: 1, at: new Date(at(-10 * MIN)), state: 'red', level: 1 });
    const same = await sync(me, { checkins: [checkin(at(-10 * MIN), 'green', 0)] });
    assert.deepEqual(same.body.checkins.slice(-1), [checkin(at(-10 * MIN), 'green', 0)]);
});

test('no body, check-in or dump text reaches a log line or an error message', async () => {
    const me = await account();
    const at = clock();
    const MARK = 'zz-private-marker-7f3';
    const lines = [];
    const saved = {};
    for (const k of ['log', 'info', 'warn', 'error', 'debug']) {
        saved[k] = console[k];
        console[k] = (...args) => {
            lines.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
        };
    }
    const findOne = models.DayState.findOne;
    try {
        await sync(me, { anchors: [anchor('a-1', { title: MARK })], dump: [line('d-1', { text: MARK })], checkins: [checkin(at(-MIN))] });
        await call('POST', '/api/me/day/sync', me, undefined, `{"v":3,"dump":[{"text":"${MARK}"}]}`);
        // A database failure whose error carries the failed operation, as
        // bulk-write and duplicate-key errors do.
        models.DayState.findOne = () => ({
            lean: () =>
                Promise.reject(
                    Object.assign(new Error(`write failed: ${MARK}`), { code: 11000, keyValue: { text: MARK }, writeErrors: [{ op: { text: MARK } }] }),
                ),
        });
        const r = await call('POST', '/api/me/day/sync', me, { v: 1, dump: [line('d-2', { text: MARK })] });
        assert.equal(r.status, 500);
        assert.equal((await r.text()).includes(MARK), false);
        // Broken JSON: the parser's own message quotes up to the first ten
        // characters of the body ("Unexpected token 'p', "pz7k" is not
        // valid JSON").
        const SHORT = 'pz7k';
        const broken = await call('POST', '/api/me/day/sync', me, undefined, SHORT);
        assert.equal(broken.status, 400);
        assert.equal((await broken.text()).includes(SHORT), false);
    } finally {
        models.DayState.findOne = findOne;
        Object.assign(console, saved);
    }
    assert.ok(lines.some((l) => l.includes('Day sync failed')), 'the failure itself is logged');
    assert.equal(lines.join('\n').includes(MARK), false, lines.join('\n'));
});

test('in LOCAL_MODE the local user needs no token', async () => {
    process.env.LOCAL_MODE = 'true';
    try {
        const r = await sync(null, { todos: [todo('td-local')] });
        assert.equal(r.status, 200);
        assert.equal(r.body.todos[0].id, 'td-local');
        assert.equal((await getDay(null)).body.todos.length, 1);
    } finally {
        process.env.LOCAL_MODE = 'false';
    }
});

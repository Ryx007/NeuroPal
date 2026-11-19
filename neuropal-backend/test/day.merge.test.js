// Day sync merge rules (docs/DAY-SYNC.md §4–§6) as pure functions — no
// database. The properties the contract promises are checked on thousands
// of cases from a seeded generator, so any failure reproduces exactly.
// Run: npm test
const assert = require('node:assert/strict');
const { test } = require('node:test');

const day = require('../src/services/dayMerge');

const NOW = Date.parse('2026-11-20T00:00:00.000Z');
const json = (v) => JSON.stringify(v);
const merge = (kind, ...lists) => day.mergeSection(kind, ...lists);

// ---- a small seeded generator (mulberry32) ----------------------------------

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const chance = (r, p) => r() < p;

// Few distinct moments, so equal timestamps are common. Some are spelled
// differently but mean the same instant (they must tie after cleaning), and
// one is far in the future (clamped to NOW by the clock rule).
const STAMPS = [
    '2026-11-18T08:00:00.000Z',
    '2026-11-18T09:00:00.000Z',
    '2026-11-18T09:00:00Z',
    '2026-11-18T10:00:00.000+01:00',
    '2026-11-19T08:00:00.000Z',
    '2026-11-19T12:30:00.000Z',
    '2099-01-01T00:00:00.000Z',
];
const IDS = ['x1', 'x2', 'x3', 'x4'];
const stampOf = (r) => pick(r, STAMPS);

// One device's copy of an item: sometimes a contentless tombstone (as the
// server returns them), sometimes deleted-then-undone (deletedAt < updatedAt),
// optional fields present or missing, ticks or none, an unknown field now
// and then.
function rawItem(kind, r, id) {
    if (kind === 'dump') {
        const item = { id };
        if (chance(r, 0.3)) item.deletedAt = stampOf(r);
        if (!item.deletedAt || chance(r, 0.5)) {
            item.text = pick(r, ['call the lab', 'buy  milk ', 'buy milk', 'what was that paper']);
            item.at = stampOf(r);
        }
        return item;
    }
    const item = { id, createdAt: stampOf(r), updatedAt: stampOf(r) };
    if (chance(r, 0.4)) item.deletedAt = stampOf(r);
    else if (chance(r, 0.5)) item.deletedAt = null;
    if (item.deletedAt && chance(r, 0.25)) return item; // tombstone-shaped
    if (kind === 'anchors') {
        item.title = pick(r, ['Meds', '  Meds ', 'Walk', 'Lunch break']);
        if (chance(r, 0.7)) item.subtitle = pick(r, ['', 'Blue pill', 'with water']);
        item.time = pick(r, [{ hour: 8, minute: 15 }, { hour: 8, minute: 15 }, { hour: 12, minute: 0 }, { hour: 21, minute: 30 }]);
        if (chance(r, 0.4)) item.flexMinutes = pick(r, [0, 15, 30, 120]);
        if (chance(r, 0.4)) item.category = pick(r, ['medication', 'break', 'study']);
        if (chance(r, 0.3)) item.icon = pick(r, ['pill', 'walk']);
        if (chance(r, 0.2)) item.location = pick(r, [{ lat: 41.1, lng: 16.8, radius: 150 }, { lat: 41.2, lng: 16.9, radius: 300 }]);
    } else if (kind === 'tasks') {
        item.title = pick(r, ['Take meds', 'Eat something', 'Drink water']);
        if (chance(r, 0.6)) item.subtitle = pick(r, ['', 'Morning dosage']);
    } else {
        item.title = pick(r, ['Email the lab', 'Book the room', 'Email  the lab']);
        if (chance(r, 0.7)) item.done = chance(r, 0.5);
    }
    if (kind !== 'todos' && chance(r, 0.6)) {
        item.tickAt = stampOf(r);
        item.doneOn = pick(r, [null, '2026-11-18', '2026-11-19']);
    }
    if (chance(r, 0.1)) item.status = 'done';
    return item;
}

// One device's state: each id at most once (as a device holds it).
function state(kind, r) {
    const out = [];
    for (const id of IDS) {
        if (!chance(r, 0.6)) continue;
        const item = day.normalizeItem(kind, rawItem(kind, r, id), NOW);
        if (item) out.push(item);
    }
    return out;
}

const KINDS = ['anchors', 'tasks', 'todos', 'dump'];
const CASES = 3000;

function checkShape(kind, list, ctx) {
    for (const item of list) {
        if (day.isTombstone(item)) {
            const keys = kind === 'dump' ? ['id', 'deletedAt'] : ['id', 'createdAt', 'updatedAt', 'deletedAt'];
            assert.deepEqual(Object.keys(item), keys, `a tombstone carries no content ${ctx}`);
        } else {
            assert.equal(item.deletedAt, null, ctx);
            assert.ok(kind === 'dump' ? item.text : item.title, ctx);
        }
    }
    assert.equal(json(list), json(day.orderSection(kind, list)), `ordered per §5 ${ctx}`);
    assert.equal(new Set(list.map((i) => i.id)).size, list.length, `one copy per id ${ctx}`);
}

for (const kind of KINDS) {
    test(`${kind}: merge is commutative and idempotent (${CASES} generated cases)`, () => {
        const r = rng(0xda7 + kind.length);
        for (let n = 0; n < CASES; n += 1) {
            const a = state(kind, r);
            const b = state(kind, r);
            const ctx = `[${kind} case ${n}]`;
            const ab = merge(kind, a, b);
            assert.equal(json(ab), json(merge(kind, b, a)), `merge(a,b) = merge(b,a) ${ctx}`);
            const s = merge(kind, a);
            assert.equal(json(merge(kind, s, s)), json(s), `merge(s,s) = s ${ctx}`);
            assert.equal(json(merge(kind, s, a)), json(s), `sending the same items again changes nothing ${ctx}`);
            assert.equal(json(merge(kind, ab, b)), json(ab), `re-sending b after merging it changes nothing ${ctx}`);
            checkShape(kind, ab, ctx);
        }
    });

    test(`${kind}: merge is associative (${CASES} generated cases)`, (t) => {
        const r = rng(0xa55 + kind.length);
        let tickCorners = 0;
        for (let n = 0; n < CASES; n += 1) {
            const [a, b, c] = [state(kind, r), state(kind, r), state(kind, r)];
            const ctx = `[${kind} case ${n}]`;
            const left = merge(kind, merge(kind, a, b), c);
            const right = merge(kind, a, merge(kind, b, c));
            checkShape(kind, left, ctx);
            if (json(left) === json(right)) continue;
            // The one documented exception (see the next test): a tick that
            // meets a tombstone is removed with it, so for an anchor or task
            // that is deleted and then undone, the tick can depend on whether
            // an old tick arrived before or after the Undo. Everything else —
            // definition, stamps, deletion, order — must still agree.
            assert.ok(kind === 'anchors' || kind === 'tasks', `associative ${ctx}`);
            const noTick = (list) => list.map(({ doneOn, tickAt, ...rest }) => rest);
            assert.equal(json(noTick(left)), json(noTick(right)), `only a tick may differ ${ctx}`);
            const ab = new Map(merge(kind, a, b).map((i) => [i.id, i]));
            const bc = new Map(merge(kind, b, c).map((i) => [i.id, i]));
            left.forEach((item, i) => {
                if (json(item) === json(right[i])) return;
                assert.ok(!day.isTombstone(item) && !day.isTombstone(right[i]), ctx);
                const met = [ab.get(item.id), bc.get(item.id)].some((x) => x && day.isTombstone(x));
                assert.ok(met, `the tick differs only after meeting a tombstone ${ctx}`);
                tickCorners += 1;
            });
        }
        t.diagnostic(`${kind}: ${tickCorners} tick-after-undo corners in ${CASES} cases`);
    });
}

const T = (h) => `2026-11-19T${String(h).padStart(2, '0')}:00:00.000Z`;
const anchor = (over) =>
    day.normalizeItem('anchors', { id: 'x', title: 'Meds', time: { hour: 8, minute: 0 }, createdAt: T(1), updatedAt: T(1), ...over }, NOW);

test('the one order-dependent corner: a tick that meets a tombstone goes with it', () => {
    const ticked = anchor({ tickAt: T(3), doneOn: '2026-11-19' }); // phone ticked it
    const deleted = anchor({ deletedAt: T(4) }); // laptop deleted it
    const undone = anchor({ updatedAt: T(5) }); // laptop's Undo (no tick there)
    const tickFirst = merge('anchors', merge('anchors', [ticked], [deleted]), [undone]);
    const undoFirst = merge('anchors', [ticked], merge('anchors', [deleted], [undone]));
    assert.equal(tickFirst[0].tickAt, null, 'the tick reached the tombstone and was removed with it');
    assert.equal(undoFirst[0].tickAt, T(3), 'the tick arrived after the Undo and counts');
    assert.equal(json({ ...tickFirst[0], doneOn: 0, tickAt: 0 }), json({ ...undoFirst[0], doneOn: 0, tickAt: 0 }));
});

test('definition: the later edit wins whole; a tie goes to the greater canonical JSON', () => {
    const a = anchor({ title: 'Morning meds', updatedAt: T(5), icon: 'pill' });
    const b = anchor({ title: 'Meds', subtitle: 'with water', updatedAt: T(4), category: 'medication', createdAt: T(0) });
    const m = day.mergeItem('anchors', a, b);
    assert.equal(m.title, 'Morning meds');
    assert.equal(m.subtitle, '', 'fields are never mixed');
    assert.equal(m.category, undefined, 'fields are never mixed');
    assert.equal(m.icon, 'pill');
    assert.equal(m.createdAt, T(0), 'createdAt is the earlier one');
    const x = anchor({ title: 'Apple', updatedAt: T(5) });
    const y = anchor({ title: 'Banana', updatedAt: T(5) });
    assert.equal(day.mergeItem('anchors', x, y).title, 'Banana');
    assert.equal(day.mergeItem('anchors', y, x).title, 'Banana');
});

test('tick: later tickAt wins, no tick loses, a tie goes to the greater doneOn, un-tick is a tick', () => {
    const def = anchor({ title: 'Renamed', updatedAt: T(6) });
    const ticked = anchor({ tickAt: T(3), doneOn: '2026-11-19' });
    const m = day.mergeItem('anchors', def, ticked);
    assert.equal(m.title, 'Renamed', 'the tick does not bring back the old definition');
    assert.equal(m.doneOn, '2026-11-19', 'the edit does not drop the tick');
    const untick = anchor({ tickAt: T(4), doneOn: null });
    assert.equal(day.mergeItem('anchors', m, untick).doneOn, null);
    const tieA = anchor({ tickAt: T(3), doneOn: '2026-11-18' });
    const tieB = anchor({ tickAt: T(3), doneOn: '2026-11-19' });
    assert.equal(day.mergeItem('anchors', tieA, tieB).doneOn, '2026-11-19');
    const tieNull = anchor({ tickAt: T(3), doneOn: null });
    assert.equal(day.mergeItem('anchors', tieNull, tieA).doneOn, '2026-11-18', 'null is the smallest doneOn');
    const noTimeTick = anchor({ doneOn: '2026-11-19' });
    assert.equal(noTimeTick.doneOn, null, 'a doneOn without tickAt is no tick');
});

test('deletion: deletedAt >= updatedAt deletes; undo is an edit; a stale copy cannot refill a tombstone', () => {
    const live = anchor({ title: 'Secret plan', updatedAt: T(2), tickAt: T(2), doneOn: '2026-11-19', icon: 'pill' });
    const gone = day.mergeItem('anchors', live, anchor({ updatedAt: T(2), deletedAt: T(3) }));
    assert.deepEqual(gone, { id: 'x', createdAt: T(1), updatedAt: T(2), deletedAt: T(3) });
    // a stale device still has the item, even one it edited offline after
    // the deleted version but before the deletion: still deleted, no content
    const stale = anchor({ title: 'Secret plan v2', updatedAt: '2026-11-19T02:30:00.000Z', tickAt: T(3), doneOn: '2026-11-19' });
    const still = day.mergeItem('anchors', gone, stale);
    assert.deepEqual(still, { id: 'x', createdAt: T(1), updatedAt: '2026-11-19T02:30:00.000Z', deletedAt: T(3) });
    assert.equal(json(still).includes('Secret'), false);
    // undo = send it again with updatedAt = now
    const undo = day.mergeItem('anchors', still, anchor({ title: 'Secret plan', updatedAt: T(4) }));
    assert.equal(undo.title, 'Secret plan');
    assert.equal(undo.deletedAt, null, 'deletedAt < updatedAt is stored as null');
    // content sent along with a tombstone never gets in
    const raw = day.normalizeItem('tasks', { id: 't', title: 'Hidden', createdAt: T(1), updatedAt: T(1), deletedAt: T(1), doneOn: '2026-11-19', tickAt: T(1) }, NOW);
    assert.deepEqual(raw, { id: 't', createdAt: T(1), updatedAt: T(1), deletedAt: T(1) });
});

test('dump: the copy written first keeps its text; a deletion is final and leaves {id, deletedAt}', () => {
    const d = (over) => day.normalizeItem('dump', { id: 'd1', text: 'call mum', at: T(2), ...over }, NOW);
    assert.equal(day.mergeDumpItem(d({}), d({ text: 'changed', at: T(3) })).text, 'call mum');
    assert.equal(day.mergeDumpItem(d({ text: 'changed', at: T(3) }), d({})).text, 'call mum');
    const tomb = day.mergeDumpItem(d({}), d({ deletedAt: T(4) }));
    assert.deepEqual(tomb, { id: 'd1', deletedAt: T(4) });
    assert.deepEqual(day.mergeDumpItem(tomb, d({ at: T(9) })), tomb, 'there is no restore');
});

test('responses are ordered: anchors by time then id, tasks by createdAt then id, dump newest first', () => {
    const a = (id, hour, minute, over = {}) => anchor({ id, time: { hour, minute }, ...over });
    const anchors = merge('anchors', [a('b', 9, 0), a('z', 7, 30), a('a', 9, 0), a('gone', 1, 0, { deletedAt: T(5) })]);
    assert.deepEqual(anchors.map((x) => x.id), ['z', 'a', 'b', 'gone']);
    const t = (id, createdAt) => day.normalizeItem('tasks', { id, title: id, createdAt, updatedAt: createdAt }, NOW);
    assert.deepEqual(merge('tasks', [t('mvd-2', T(0)), t('t9', T(2)), t('mvd-1', T(0))]).map((x) => x.id), ['mvd-1', 'mvd-2', 't9']);
    const d = (id, at, deletedAt = null) => day.normalizeItem('dump', { id, text: id, at, deletedAt }, NOW);
    assert.deepEqual(merge('dump', [d('old', T(1)), d('new', T(5)), d('del', T(3), T(6))]).map((x) => x.id), ['new', 'old', 'del']);
});

// ---- cleaning ---------------------------------------------------------------

test('text is trimmed, collapsed, cut without splitting a character, and cleaning twice changes nothing', () => {
    assert.equal(day.cleanText('  a \n\t b   c ', 100), 'a b c');
    assert.equal(day.cleanText('abc def', 4), 'abc', 'a cut that ends on a space is trimmed');
    assert.equal(day.cleanText(`${'x'.repeat(9)}😀`, 10), 'x'.repeat(9), 'no half emoji');
    assert.equal(day.cleanText('a\uD800b', 10), 'a�b', 'a lone surrogate becomes U+FFFD');
    assert.equal(day.cleanText(42, 10), null);
    const r = rng(7);
    const parts = [' ', '\n', 'a', 'é', '😀', '\uD83D', '  ', 'b'];
    for (let n = 0; n < 2000; n += 1) {
        let s = '';
        for (let i = 0; i < 12; i += 1) s += pick(r, parts);
        const once = day.cleanText(s, 7);
        assert.equal(day.cleanText(once, 7), once);
        assert.ok(once.length <= 7);
    }
});

test('timestamps: strict ISO-8601, normalised to toISOString, future ones set to the server clock', () => {
    const p = (s) => day.parseStamp(s);
    assert.equal(p('2026-11-19T17:20:00.000Z'), Date.UTC(2026, 10, 19, 17, 20));
    assert.equal(p('2026-11-19T18:20:00+01:00'), Date.UTC(2026, 10, 19, 17, 20));
    assert.equal(p('2026-11-19T17:20Z'), Date.UTC(2026, 10, 19, 17, 20));
    assert.equal(p('2026-11-19T17:20:00.123456Z'), Date.UTC(2026, 10, 19, 17, 20, 0, 123));
    assert.equal(p('2024-02-29T00:00:00Z'), Date.UTC(2024, 1, 29));
    for (const bad of ['2026-02-30T00:00:00Z', '2026-11-19T24:00:00Z', '2026-11-19T17:20:00', '2026-11-19', '1', '', 1700000000000, null, '9999-12-31T23:59:59.999-01:00']) {
        assert.ok(Number.isNaN(p(bad)), String(bad));
    }
    const future = day.normalizeItem('todos', { id: 'f', title: 'x', createdAt: '2099-01-01T00:00:00Z', updatedAt: new Date(NOW + 59000).toISOString() }, NOW);
    assert.equal(future.createdAt, new Date(NOW).toISOString(), 'more than 60 s ahead: set to the server clock');
    assert.equal(future.updatedAt, new Date(NOW + 59000).toISOString(), 'within 60 s: kept');
});

test('items are rebuilt field by field: unknown keys, __proto__ and constructor never get through', () => {
    const raw = JSON.parse(
        '{"id":"a-1","title":" Meds ","time":{"hour":8,"minute":15,"x":1},"createdAt":"2026-11-19T08:00:00Z",' +
            '"updatedAt":"2026-11-19T08:00:00Z","__proto__":{"polluted":true},"constructor":{"x":1},"status":"done",' +
            '"location":{"lat":41.1,"lng":16.8,"radius":150,"__proto__":{"y":1}},"flexMinutes":null,"category":"nope","icon":""}',
    );
    const item = day.normalizeItem('anchors', raw, NOW);
    assert.deepEqual(Object.keys(item), ['id', 'title', 'subtitle', 'time', 'location', 'createdAt', 'updatedAt', 'deletedAt', 'doneOn', 'tickAt']);
    assert.deepEqual(item.time, { hour: 8, minute: 15 });
    assert.deepEqual(Object.keys(item.location), ['lat', 'lng', 'radius']);
    assert.equal(Object.getPrototypeOf(item), Object.prototype);
    assert.equal({}.polluted, undefined);
    assert.equal(item.title, 'Meds');
});

test('bad items are dropped, never thrown: wrong shape, bad id, empty title, unparseable time', () => {
    const base = { id: 'ok', title: 'T', time: { hour: 1, minute: 2 }, createdAt: T(1), updatedAt: T(1) };
    const bad = [
        null,
        'x',
        [],
        { ...base, id: 'has space' },
        { ...base, id: 'x'.repeat(65) },
        { ...base, id: 7 },
        { ...base, title: '   ' },
        { ...base, title: 5 },
        { ...base, time: { hour: 24, minute: 0 } },
        { ...base, time: { hour: 1.5, minute: 0 } },
        { ...base, createdAt: 'yesterday' },
        { ...base, updatedAt: undefined },
        { ...base, deletedAt: 'soon' },
        { ...base, tickAt: 'now' },
        { ...base, doneOn: '2026-13-01', tickAt: T(1) },
    ];
    for (const raw of bad) assert.equal(day.normalizeItem('anchors', raw, NOW), null, json(raw));
    assert.ok(day.normalizeItem('anchors', base, NOW));
    assert.equal(day.normalizeItem('anchors', { ...base, id: 'A.z_0:9-' }, NOW).id, 'A.z_0:9-');
    assert.equal(day.normalizeItem('anchors', { ...base, flexMinutes: 999 }, NOW).flexMinutes, 120);
    assert.equal(day.normalizeCheckin({ at: T(1), state: 'blue' }, NOW), null);
    assert.deepEqual(day.normalizeCheckin({ at: T(1), state: 'red', level: 7, x: 1 }, NOW), { at: T(1), state: 'red', level: 1 });
    assert.deepEqual(day.normalizeCheckin({ at: T(1), state: 'red' }, NOW), { at: T(1), state: 'red', level: null });
});

test('a request: at most 2000 items per section, sections not sent stay untouched, odd gen counts as none', () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, createdAt: T(1), updatedAt: T(1) }));
    const req = day.normalizeRequest({ v: 1, gen: '3', tasks: many, todos: 'nope', anchors: [null, 1, {}] }, NOW);
    assert.equal(req.sections.tasks.length, 2000);
    assert.equal(req.sections.todos, null);
    assert.equal(req.sections.dump, null);
    assert.deepEqual(req.sections.anchors, []);
    assert.equal(req.checkins, null);
    assert.equal(req.gen, 0);
    assert.equal(day.normalizeRequest({ v: 1, gen: 4 }, NOW).gen, 4);
    assert.equal(day.normalizeRequest({ v: 1, gen: 2.5 }, NOW).gen, 0);
    assert.equal(day.normalizeRequest({ v: 1, gen: -1 }, NOW).gen, 0);
    const stored = { anchors: [], tasks: [], todos: [day.normalizeItem('todos', { id: 'keep', title: 'K', createdAt: T(1), updatedAt: T(1) }, NOW)], dump: [] };
    assert.equal(day.mergeSections(stored, req.sections).todos[0].id, 'keep');
});

test('caps: live items over the limit and tombstones over 500 — the oldest go first', () => {
    const stamp = (i) => new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString();
    const anchors = Array.from({ length: 205 }, (_, i) =>
        day.normalizeItem('anchors', { id: `a${i}`, title: 'A', time: { hour: 8, minute: 0 }, createdAt: stamp(i), updatedAt: stamp(i) }, NOW),
    );
    const kept = merge('anchors', anchors);
    assert.equal(kept.length, 200);
    assert.ok(!kept.some((a) => ['a0', 'a1', 'a2', 'a3', 'a4'].includes(a.id)));
    const tombs = Array.from({ length: 510 }, (_, i) =>
        day.normalizeItem('tasks', { id: `t${i}`, createdAt: stamp(0), updatedAt: stamp(0), deletedAt: stamp(i) }, NOW),
    );
    const live = [day.normalizeItem('tasks', { id: 'live', title: 'L', createdAt: stamp(0), updatedAt: stamp(0) }, NOW)];
    const tasks = merge('tasks', tombs, live);
    assert.equal(tasks.filter(day.isTombstone).length, 500);
    assert.ok(!tasks.some((t) => t.id === 't9'), 'the oldest tombstones went first');
    assert.ok(tasks.some((t) => t.id === 'live'));
    const dump = Array.from({ length: 1003 }, (_, i) => day.normalizeItem('dump', { id: `d${i}`, text: 'x', at: stamp(i) }, NOW));
    const keptDump = merge('dump', dump);
    assert.equal(keptDump.length, 1000);
    assert.equal(keptDump[0].id, 'd1002');
    assert.ok(!keptDump.some((d) => d.id === 'd0'));
});

// ---- check-ins ----------------------------------------------------------------

const at = (sec) => new Date(Date.UTC(2026, 10, 19, 10) + sec * 1000).toISOString();
const ci = (sec, state = 'yellow', level = 0.5) => ({ at: at(sec), state, level });

test('check-ins: the 60-second rule on chains', () => {
    const times = (list) => day.mergeCheckins(list).map((c) => (Date.parse(c.at) - Date.parse(at(0))) / 1000);
    assert.deepEqual(times([ci(0), ci(50), ci(100), ci(150)]), [150], 'a chain collapses to its last');
    assert.deepEqual(times([ci(0), ci(60)]), [0, 60], 'exactly 60 s apart: both stay');
    assert.deepEqual(times([ci(0), ci(59.999)]), [59.999]);
    assert.deepEqual(times([ci(0), ci(30), ci(91), ci(120)]), [30, 120], 'a 61 s gap splits the chain');
    assert.deepEqual(times([ci(100), ci(0), ci(50)]), [100], 'input order does not matter');
});

test('check-ins: union by at — the same at twice keeps the greater canonical JSON', () => {
    const a = ci(0, 'green', 0.2);
    const b = ci(0, 'red', 0.9);
    assert.deepEqual(day.mergeCheckins([a], [b]), [b]);
    assert.deepEqual(day.mergeCheckins([b], [a]), [b]);
    assert.deepEqual(day.mergeCheckins([ci(0, 'red', null)], [ci(0, 'red', 0.4)]), [ci(0, 'red', null)]);
});

test(`check-ins: idempotent, never invents an entry, keeps the newest (${CASES} generated cases)`, () => {
    const r = rng(0xc0ffee);
    for (let n = 0; n < CASES; n += 1) {
        const list = [];
        const count = Math.floor(r() * 12);
        for (let i = 0; i < count; i += 1) {
            list.push(ci(Math.floor(r() * 40) * 20, pick(r, ['green', 'yellow', 'red']), pick(r, [null, 0, 0.5, 1])));
        }
        const other = list.filter(() => chance(r, 0.5));
        const s = day.mergeCheckins(list);
        const ctx = `[check-in case ${n}]`;
        assert.equal(json(day.mergeCheckins(s, s)), json(s), `merge(s,s) = s ${ctx}`);
        assert.equal(json(day.mergeCheckins(s, list)), json(s), `re-sending changes nothing ${ctx}`);
        assert.equal(json(day.mergeCheckins(list, other)), json(day.mergeCheckins(other, list)), ctx);
        for (let i = 1; i < s.length; i += 1) {
            assert.ok(Date.parse(s[i].at) - Date.parse(s[i - 1].at) >= 60000, `no two within a minute ${ctx}`);
        }
        for (const c of s) assert.ok(list.some((x) => json(x) === json(c)), ctx);
        if (list.length) {
            const newest = list.reduce((m, c) => (c.at > m ? c.at : m), '');
            assert.equal(s[s.length - 1].at, newest, `the newest survives ${ctx}`);
        }
    }
});

test('check-ins: two arrival orders may differ by one entry inside two minutes (§5, harmless)', () => {
    // The server holds 0:50 from the phone, which has since refined it to
    // 1:40 locally. The laptop has a check-in at 0:00.
    const stored = [ci(50)];
    const laptopFirst = day.mergeCheckins(day.mergeCheckins(stored, [ci(0)]), [ci(100)]);
    const phoneFirst = day.mergeCheckins(day.mergeCheckins(stored, [ci(100)]), [ci(0)]);
    assert.deepEqual(laptopFirst.map((c) => c.at), [at(100)]);
    assert.deepEqual(phoneFirst.map((c) => c.at), [at(0), at(100)]);
});

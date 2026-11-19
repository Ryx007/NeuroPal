// The per-key queue day sync uses to handle one person's syncs one at a time
// (src/utils/keyedQueue.js). Run: npm test
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { keyedQueue, FULL } = require('../src/utils/keyedQueue');

// A task that waits for its gate to open, recording when it starts and ends.
function gated(log, name) {
    let open;
    const gate = new Promise((resolve) => {
        open = resolve;
    });
    const task = async () => {
        log.push(`start ${name}`);
        await gate;
        log.push(`end ${name}`);
        return name;
    };
    return { task, open };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('one key runs its tasks one at a time, in arrival order', async () => {
    const q = keyedQueue({ maxPending: 8 });
    const log = [];
    const a = gated(log, 'a');
    const b = gated(log, 'b');
    const c = gated(log, 'c');
    const results = [q.run('ryx', a.task), q.run('ryx', b.task), q.run('ryx', c.task)];
    await tick();
    assert.deepEqual(log, ['start a']);
    b.open(); // b is ready first, but waits its turn
    c.open();
    await tick();
    assert.deepEqual(log, ['start a']);
    a.open();
    assert.deepEqual(await Promise.all(results), ['a', 'b', 'c']);
    assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
    assert.equal(q.keys(), 0, 'an idle key is forgotten');
});

test('different keys never wait for each other', async () => {
    const q = keyedQueue({ maxPending: 8 });
    const log = [];
    const slow = gated(log, 'ryx');
    const quick = gated(log, 'friend');
    const first = q.run('ryx', slow.task);
    const second = q.run('friend', quick.task);
    await tick();
    assert.deepEqual(log.sort(), ['start friend', 'start ryx']);
    quick.open();
    assert.equal(await second, 'friend');
    slow.open();
    assert.equal(await first, 'ryx');
});

test('a task that throws passes its error on and does not stop the next one', async () => {
    const q = keyedQueue({ maxPending: 8 });
    const failing = q.run('ryx', async () => {
        throw new Error('storage down');
    });
    const next = q.run('ryx', async () => 'still runs');
    const syncThrow = q.run('ryx', () => {
        throw new Error('thrown before any await');
    });
    const last = q.run('ryx', () => 'and so does this');
    await assert.rejects(failing, /storage down/);
    assert.equal(await next, 'still runs');
    await assert.rejects(syncThrow, /thrown before any await/);
    assert.equal(await last, 'and so does this');
    await tick();
    assert.equal(q.keys(), 0);
});

test('past maxPending running and waiting, run() answers FULL without running the task', async () => {
    const q = keyedQueue({ maxPending: 3 });
    const log = [];
    const gates = ['a', 'b', 'c'].map((name) => gated(log, name));
    const running = gates.map((g) => q.run('ryx', g.task));
    let ranTooMany = false;
    const refused = await q.run('ryx', async () => {
        ranTooMany = true;
    });
    assert.equal(refused, FULL);
    assert.equal(ranTooMany, false);
    // other keys are unaffected
    assert.equal(await q.run('friend', async () => 'fine'), 'fine');
    for (const g of gates) g.open();
    assert.deepEqual(await Promise.all(running), ['a', 'b', 'c']);
    // room again once they are done
    assert.equal(await q.run('ryx', async () => 'room again'), 'room again');
});

test('maxPending must be a positive integer', () => {
    for (const bad of [0, -1, 1.5, '3', undefined, Infinity]) {
        assert.throws(() => keyedQueue({ maxPending: bad }), TypeError);
    }
});

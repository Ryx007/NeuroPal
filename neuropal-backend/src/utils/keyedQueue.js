// Runs tasks one at a time per key, in arrival order, within this process.
//
// Day sync uses it per person (docs/DAY-SYNC.md §6): every round of the sync's
// compare-and-set loop re-reads and re-merges the whole day, so overlapping
// syncs of one person mostly cost each other rounds. Queued, each sync takes
// one round, and the loop's retries are left for what a queue can't see (a
// second API process).
//
// A key holds at most `maxPending` tasks, running and waiting together. Past
// that, run() resolves to FULL without running the task, so a burst of tiny
// requests can't pile up behind one person without bound.
//
// A task's turn ends when it settles or after `maxRunMs`, whichever comes
// first: a database call that never returns must not hold the person's queue
// for ever. The task itself keeps running; whatever the queue serialised for
// must stay correct without it (day sync's compare-and-set loop does).

const FULL = Symbol('keyedQueue.full');

function keyedQueue({ maxPending, maxRunMs = 30 * 1000 }) {
    if (!Number.isSafeInteger(maxPending) || maxPending < 1) {
        throw new TypeError('keyedQueue: maxPending must be a positive integer');
    }
    if (!Number.isSafeInteger(maxRunMs) || maxRunMs < 1) {
        throw new TypeError('keyedQueue: maxRunMs must be a positive integer');
    }
    const queues = new Map(); // key → { tail: Promise, pending: number }

    function settle(key, q) {
        q.pending -= 1;
        if (q.pending === 0 && queues.get(key) === q) queues.delete(key);
    }

    function run(key, task) {
        let q = queues.get(key);
        if (!q) {
            q = { tail: Promise.resolve(), pending: 0 };
            queues.set(key, q);
        }
        if (q.pending >= maxPending) return Promise.resolve(FULL);
        q.pending += 1;
        // The task starts once the turn before it is over, whether that task
        // succeeded, threw or ran out of time.
        const before = q.tail;
        const result = before.then(() => task());
        // Its own turn starts at the same moment, so its clock never runs
        // while it is still waiting.
        const turnOver = before.then(
            () =>
                new Promise((resolve) => {
                    const timer = setTimeout(resolve, maxRunMs);
                    if (typeof timer.unref === 'function') timer.unref();
                    const done = () => {
                        clearTimeout(timer);
                        resolve();
                    };
                    result.then(done, done);
                }),
        );
        q.tail = turnOver.then(() => settle(key, q));
        return result;
    }

    return {
        run,
        // How many keys have tasks right now (for tests).
        keys: () => queues.size,
    };
}

module.exports = { keyedQueue, FULL };

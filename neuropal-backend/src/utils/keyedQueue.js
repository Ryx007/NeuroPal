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

const FULL = Symbol('keyedQueue.full');

function keyedQueue({ maxPending }) {
    if (!Number.isSafeInteger(maxPending) || maxPending < 1) {
        throw new TypeError('keyedQueue: maxPending must be a positive integer');
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
        // The task starts once everything queued before it has settled,
        // whether that succeeded or threw.
        const result = q.tail.then(() => task());
        q.tail = result.then(
            () => settle(key, q),
            () => settle(key, q),
        );
        return result;
    }

    return {
        run,
        // How many keys have tasks right now (for tests).
        keys: () => queues.size,
    };
}

module.exports = { keyedQueue, FULL };

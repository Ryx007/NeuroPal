const { Worker } = require('worker_threads');

// Event-loop watchdog. If the main thread stops turning (a pathological
// regex, a runaway synchronous loop) the API looks alive to Docker but
// answers nobody — and `restart: unless-stopped` never restarts a container
// that's merely unhealthy. A tiny worker thread watches a heartbeat the main
// thread writes every second; after WATCHDOG_STALL_SEC of silence it kills
// the whole process, so Docker restarts it.
//
// WATCHDOG_STALL_SEC  default 60; 0 = off

function startWatchdog() {
    const stallSec = Number(process.env.WATCHDOG_STALL_SEC ?? 60);
    if (!stallSec || stallSec <= 0) return null;

    const shared = new Int32Array(new SharedArrayBuffer(4));
    const beat = () => Atomics.store(shared, 0, Math.floor(Date.now() / 1000));
    beat();
    const timer = setInterval(beat, 1000);
    timer.unref();

    const worker = new Worker(
        `
        const { workerData } = require('worker_threads');
        const shared = workerData.shared;
        setInterval(() => {
            const last = Atomics.load(shared, 0);
            const silent = Math.floor(Date.now() / 1000) - last;
            if (silent > workerData.stallSec) {
                console.error('[watchdog] event loop stalled for ' + silent + 's — exiting so the container restarts');
                process.kill(process.pid, 'SIGKILL');
            }
        }, 5000);
        `,
        { eval: true, workerData: { shared, stallSec } },
    );
    worker.unref();
    return worker;
}

module.exports = { startWatchdog };

const path = require('path');
const { fork } = require('child_process');

// Work that must never run inside the shared API process — parsing a user's
// book, unpacking an EPUB — runs here, in a child process with a heap cap, an
// RSS guard (childWorker.js) and a timeout. A hostile or broken file can then
// only take down its child.
//
// Each kind of job has its own queue, one job at a time by default, so a
// 30-minute OCR run never makes someone wait to open a book, and the API
// container's memory isn't shared by a crowd of children.
//
// CHILD_HEAP_MB       default 512
// CHILD_RSS_LIMIT_MB  default 700 (keep children × this well under the
//                     API container's mem_limit)
// EXTRACT_CONCURRENCY default 1 (for 'extract'; 'epub' is always 1)

const queues = new Map(); // kind -> { active, waiting: [] }

function concurrencyFor(kind) {
    if (kind === 'extract') return Math.max(1, Number(process.env.EXTRACT_CONCURRENCY || 1));
    return 1;
}

function runChildJob(job, { timeoutMs = 10 * 60 * 1000, onProgress } = {}) {
    const kind = job.kind;
    if (!queues.has(kind)) queues.set(kind, { active: 0, waiting: [] });
    const q = queues.get(kind);
    return new Promise((resolve, reject) => {
        const start = () => {
            q.active += 1;
            launch(job, { timeoutMs, onProgress })
                .then(resolve, reject)
                .finally(() => {
                    q.active -= 1;
                    const next = q.waiting.shift();
                    if (next) next();
                });
        };
        if (q.active < concurrencyFor(kind)) start();
        else q.waiting.push(start);
    });
}

function launch(job, { timeoutMs, onProgress }) {
    const heapMb = Number(process.env.CHILD_HEAP_MB || 512);
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            fn(value);
        };
        const child = fork(path.join(__dirname, 'childWorker.js'), [], {
            execArgv: [`--max-old-space-size=${heapMb}`],
            serialization: 'advanced', // big strings and arrays without JSON
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        });
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            finish(reject, new Error('reading this file took too long and was stopped'));
        }, timeoutMs);

        child.on('message', (msg) => {
            if (!msg || typeof msg !== 'object') return;
            if (msg.type === 'progress') {
                try {
                    onProgress?.(msg.done, msg.total);
                } catch (e) {
                    // progress is best-effort
                }
            } else if (msg.type === 'done') {
                finish(resolve, msg.result);
            } else if (msg.type === 'error') {
                const err = new Error(msg.message);
                if (msg.status) {
                    err.status = msg.status;
                    err.expose = true;
                }
                finish(reject, err);
            }
        });
        child.on('error', (err) => finish(reject, err));
        child.on('exit', (code, signal) => {
            finish(
                reject,
                new Error(
                    signal
                        ? `reading this file was stopped (${signal}) — it may be too large or damaged`
                        : `reading this file failed (exit ${code})`,
                ),
            );
        });
        child.send(job);
    });
}

module.exports = { runChildJob };

// Child-process side of childJobs.js. Receives ONE job, runs it, sends the
// result back, exits.
//   {kind:'extract', filePath, docType, opts}  → textExtractor.extractText
//   {kind:'epub-unpack', src, dest}             → epubUnpack.unpackEpub

// Off-heap memory (Buffers from unzipping) isn't bounded by
// --max-old-space-size, so watch the whole process too.
const RSS_LIMIT = Number(process.env.CHILD_RSS_LIMIT_MB || 700) * 1024 * 1024;
const guard = setInterval(() => {
    if (process.memoryUsage().rss > RSS_LIMIT) {
        process.send?.({ type: 'error', message: 'the file needs more memory to read than this server allows' });
        process.exit(3);
    }
}, 100);
guard.unref();

async function run(job) {
    if (job.kind === 'extract') {
        const { extractText } = require('./textExtractor');
        return extractText(job.filePath, job.docType, {
            ...job.opts,
            onOcrProgress: (done, total) => process.send?.({ type: 'progress', done, total }),
        });
    }
    if (job.kind === 'epub-unpack') {
        return require('./epubUnpack').unpackEpub(job.src, job.dest);
    }
    throw new Error(`unknown job kind: ${job.kind}`);
}

process.once('message', async (job) => {
    try {
        const result = await run(job);
        process.send({ type: 'done', result }, () => process.exit(0));
    } catch (err) {
        process.send(
            { type: 'error', message: String(err?.message || err), status: err?.expose ? err.status : undefined },
            () => process.exit(1),
        );
    }
});

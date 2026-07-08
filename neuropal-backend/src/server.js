require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const buildApp = require('./app');
const { ensureCollection } = require('./db/qdrant');
const { getModelName, getDim } = require('./services/embedder');

const DEFAULT_MONGODB_URI =
    'mongodb://127.0.0.1:27017/neuropal?replicaSet=rs0';

async function main() {
    // Storage root must exist before the upload route is ever hit.
    const storageRoot = path.resolve(process.env.STORAGE_ROOT || './storage');
    fs.mkdirSync(storageRoot, { recursive: true });
    // eslint-disable-next-line no-console
    console.log('[storage] root:', storageRoot);

    const uri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
        appName: 'neuropal-api',
    });
    // eslint-disable-next-line no-console
    console.log('[db] connected to', mongoose.connection.name);

    // Qdrant collection bootstrap — non-fatal. If it fails the API still
    // boots and uploads work; ingest will fail and surface the error on
    // the Document row.
    try {
        await ensureCollection(getModelName(), getDim());
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[qdrant] bootstrap failed (continuing):', err.message || err);
    }

    const app = buildApp();
    const port = parseInt(process.env.PORT || '4000', 10);
    app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`[api] listening on :${port}`);
    });

    // Drop-folder ingestion — single-user concept, so LOCAL_MODE only.
    // Non-fatal: the API works fine without it.
    if (process.env.LOCAL_MODE === 'true') {
        try {
            const { startInboxWatcher } = require('./services/inboxWatcher');
            startInboxWatcher();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[inbox] failed to start (continuing):', err.message || err);
        }
    }

    // Documents whose ingest died with a previous process (restart/crash)
    // would sit in 'parsing'/'embedding' forever — re-kick them.
    try {
        const { resumeStuckIngests } = require('./services/ingestPipeline');
        resumeStuckIngests().catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[ingest] resume scan failed (continuing):', err.message || err);
        });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ingest] resume scan failed (continuing):', err.message || err);
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[fatal]', err);
    process.exit(1);
});

// Surface unhandled rejections instead of swallowing them — much easier
// debugging when an async route bug nukes a request.
process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[unhandledRejection]', reason);
});

mongoose.connection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.warn('[db] disconnected');
});
mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] error', err);
});

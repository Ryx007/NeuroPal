const { QdrantClient } = require('@qdrant/js-client-rest');

// Qdrant client + collection bootstrap.
//
// Singleton — we want one HTTP/2 connection pool, not one per request.
// The collection name is the embedding model name (per DocumentChunk spec)
// so a model upgrade means a fresh collection rather than a destructive
// re-index of the existing one.

let _client = null;

function getQdrant() {
    if (_client) return _client;
    const url = process.env.QDRANT_URL;
    if (!url) throw new Error('QDRANT_URL is not set');
    const apiKey = process.env.QDRANT_API_KEY || undefined;
    _client = new QdrantClient(apiKey ? { url, apiKey } : { url });
    return _client;
}

// Idempotent — safe to call on every boot. Creates the collection if it
// doesn't exist, then adds keyword payload indexes on userId + documentId
// so $vectorSearch-style filters stay fast.
//
// On failure: logs and resolves null so the API still starts (uploads can
// queue, ingest will retry on next boot or via /reingest).
async function ensureCollection(collectionName, dim) {
    try {
        const qdrant = getQdrant();

        let exists = false;
        try {
            await qdrant.getCollection(collectionName);
            exists = true;
        } catch (e) {
            // 404 = doesn't exist; anything else we let bubble up
            const status = e?.status || e?.response?.status;
            if (status && status !== 404) throw e;
        }

        if (!exists) {
            await qdrant.createCollection(collectionName, {
                vectors: { size: dim, distance: 'Cosine' },
            });
            // eslint-disable-next-line no-console
            console.log(`[qdrant] created collection ${collectionName} (dim=${dim})`);
        }

        // Payload indexes — `createPayloadIndex` is idempotent.
        await safeCreatePayloadIndex(qdrant, collectionName, 'userId');
        await safeCreatePayloadIndex(qdrant, collectionName, 'documentId');

        // eslint-disable-next-line no-console
        console.log(`[qdrant] ready: ${collectionName}`);
        return collectionName;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[qdrant] ensureCollection failed:', err.message || err);
        return null;
    }
}

async function safeCreatePayloadIndex(qdrant, collectionName, field) {
    try {
        await qdrant.createPayloadIndex(collectionName, {
            field_name: field,
            field_schema: 'keyword',
        });
    } catch (e) {
        // Already exists or non-fatal — keep going.
    }
}

module.exports = { getQdrant, ensureCollection };

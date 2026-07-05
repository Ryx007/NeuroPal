# NeuroPal — Mongoose schemas

13 schemas covering Phase 1–8 of the
[App Development Plan](../_unpacked/idea/idea_file_0__%20NeuroPal%20_%20App%20Development%20Plan%20(1)%2090f3f89fce56836a931f0119fc039697.md),
designed for Mongoose 8 against **self-hosted MongoDB 7+ Community Edition**.
Files live on the **local server filesystem**, not S3/R2.

> **Stack note** — the plan doc names FastAPI + Supabase + pgvector. This
> set targets the Node + Express + Mongoose + Qdrant pivot we're on
> instead. Atlas-only features (`$vectorSearch`, `$search`) are NOT used.

## File layout

```
src/
├── db/connect.js              Singleton Mongoose connection
├── storage/local.js           Local-filesystem helper (path computation, IO)
└── models/
    ├── index.js               Re-exports all models
    ├── User.js                Auth + profile + condition flags + reader tweaks
    ├── Document.js            Uploaded paper/book metadata + on-disk file ref
    ├── DocumentChunk.js       RAG chunks + Qdrant point id (vectors live in Qdrant)
    ├── ReadingSession.js      Per-user-per-doc progress + time spent
    ├── ChatMessage.js         Doc-grounded Q&A, threaded, with citations
    ├── CompanionMessage.js    AI companion chat w/ context-bundle snapshots
    ├── Anchor.js              Recurring anchor templates
    ├── DailyLog.js            Per-day state checkins + MVD + protocols
    ├── FrameworkConfig.js     SCAFFOLD: float zones, task menu, MVD template
    ├── Resource.js            Science library entries
    ├── Professional.js        ND-affirming professional directory
    ├── SpendingLog.js         Financial entries with state correlation
    ├── TtsCache.js            Audio chunk cache (on-disk file), TTL-expiring
    └── AuditLog.js            Security/compliance event log, TTL-expiring
```

## Index inventory

Each model has its indexes defined inline at the bottom of its file. Quick
summary so you can see them without opening every file:

| Model | Indexes |
|-------|---------|
| `User` | `email` unique (partial: !deleted), `deletedAt+updatedAt`, `entitlement.tier+renewsAt` |
| `Document` | `userId+createdAt`, `userId+status`, `userId+meta.doi` unique sparse, `userId+meta.arxivId` unique sparse, `userId+file.checksumSha256` unique sparse (file de-dup), `deletedAt+updatedAt`, text on title+subtitle |
| `DocumentChunk` | `documentId+chunkIndex` unique, `documentId+vectorId`, `userId+documentId`. **Vectors live in Qdrant, not Mongo** — see "RAG" section below. |
| `ReadingSession` | `userId+documentId` unique, `userId+completedAt+lastOpenedAt` |
| `ChatMessage` | `threadId+createdAt`, `userId+documentId+createdAt`, `userId+createdAt` |
| `CompanionMessage` | `threadId+createdAt`, `userId+createdAt` |
| `Anchor` | `userId+deletedAt+time.hour+time.minute`, `userId+archivedAt+notify.enabled` |
| `DailyLog` | `userId+date` unique, `userId+date desc` |
| `FrameworkConfig` | `userId` unique |
| `Resource` | `doi` unique sparse, `conditionTags+qualityType+publishedAt`, text on title+abstract+plainSummary |
| `Professional` | `location.country+city`, `conditionsSpecialised`, `approaches`, `2dsphere` on coordinates, text on name+city |
| `SpendingLog` | `userId+spentAt`, `userId+nervousStateAtTime+spentAt`, `userId+category+spentAt` |
| `TtsCache` | `contentHash` unique, **TTL on `expiresAt`**, `hitCount+lastUsedAt` |
| `AuditLog` | `userId+createdAt`, `severity+createdAt`, **TTL on `expiresAt`** |

## Important deployment notes

### 1. RAG vector storage — **Qdrant alongside Mongo**

Self-hosted Mongo Community has no native vector index. We pair it with
Qdrant, which runs as a single Docker container next to the API:

```yaml
# docker-compose.yml fragment
services:
  qdrant:
    image: qdrant/qdrant:v1.13
    ports: ["6333:6333", "6334:6334"]
    volumes:
      - ./data/qdrant:/qdrant/storage
```

**Split of responsibility:**

- **Mongo (`DocumentChunk`)** — chunk text, metadata, source-position
  anchor, and a `vectorId` foreign key
- **Qdrant** — the embedding vector + a payload `{ userId, documentId, chunkId }`
  used both for filtering and for hydrating Mongo on a hit

**Bootstrap one Qdrant collection per embedding model** (mixing dims breaks
search):

| Model | `vectors.size` | `vectors.distance` |
|-------|----------------|--------------------|
| `text-embedding-3-small` (OpenAI) | 1536 | Cosine |
| `text-embedding-3-large` (OpenAI) | 3072 | Cosine |
| `voyage-2` / `voyage-3` (Voyage) | 1024 | Cosine |
| `bge-large-en-v1.5` (local sentence-transformers) | 1024 | Cosine |
| `nomic-embed-text-v1.5` (local Ollama) | 768 | Cosine |

Full bootstrap + search snippets are in
[`src/models/DocumentChunk.js`](src/models/DocumentChunk.js).

**Fallback for very early dev** — `DocumentChunk.embedding: [Number]` still
exists (with `select: false`) for app-side cosine over a small corpus. Don't
ship to production with this enabled; ~6KB/chunk in Mongo at 1536 dims
balloons disk fast and search latency is O(n).

### 2. File storage — local filesystem

Set `NEUROPAL_STORAGE_ROOT` (e.g. `/var/lib/neuropal/storage`) and the
process user must own it. Documents land at:

```
$NEUROPAL_STORAGE_ROOT/documents/<userId>/<documentId>/<sanitised-name>.<ext>
```

TTS audio at:

```
$NEUROPAL_STORAGE_ROOT/tts/<contentHash[0:2]>/<contentHash>.mp3
```

The 2-char prefix shards the directory so a single folder doesn't grow past
~256 entries × further sub-shards. All path computation goes through
[`src/storage/local.js`](src/storage/local.js) — never construct paths by
string concatenation in route handlers (the helper protects against
traversal attacks).

Serve files through an Express controller, not `express.static`, so you can
enforce row-level auth (the file at `documents/<userId>/...` should only be
readable by that user):

```js
app.get('/api/documents/:id/raw', requireAuth, async (req, res) => {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc?.file?.relativePath) return res.sendStatus(404);
    res.type(doc.file.mimeType);
    storage.createReadStream(doc.file.relativePath).pipe(res);
});
```

**Backup** — back up `$NEUROPAL_STORAGE_ROOT` and the Mongo dump together
on the same cron, otherwise restore mismatches the two.

### 3. TTL indexes (auto-purge)

Two collections have TTL indexes that delete rows after their `expiresAt`:

- `TtsCache` — 30 days from creation. **Pair with a filesystem sweep** —
  the TTL deletes the Mongo row but NOT the file on disk. Wire a daily
  cron that lists `$NEUROPAL_STORAGE_ROOT/tts/**` and removes any file
  whose `contentHash` no longer has a Mongo row.
- `AuditLog` — 13 months from creation. No on-disk twin — purely Mongo.

You don't need a cron job for the Mongo side. MongoDB Community's TTL
monitor runs every 60s.

### 4. Soft-delete sweep (manual cron)

`User.deletedAt`, `Document.deletedAt`, `Anchor.deletedAt`,
`Professional.deletedAt` are soft-delete tombstones. There's no automatic
purge — wire a cron task that runs daily and hard-deletes rows where
`deletedAt < (now - 30 days)`, plus their related state:

| Tombstone | Cascade — Mongo | Cascade — disk | Cascade — Qdrant |
|-----------|-----------------|----------------|------------------|
| `User` | `Document`, `DocumentChunk`, `ReadingSession`, `ChatMessage`, `CompanionMessage`, `Anchor`, `DailyLog`, `SpendingLog`, `FrameworkConfig` | `documents/<userId>/*` | delete by filter `{ userId }` |
| `Document` | `DocumentChunk`, `ReadingSession` for that doc, `ChatMessage` for that doc | `documents/<userId>/<documentId>/` | delete by filter `{ documentId }` |
| `Anchor` | none required (template gone, history kept in `DailyLog`) | — | — |
| `Professional` | none | — | — |

### 5. Timezone discipline for `DailyLog.date`

`DailyLog.date` is a **string** in `YYYY-MM-DD` format, **in the user's
timezone**, not UTC. The API layer must resolve `User.timezone` before
inserting. This avoids the bug where someone in IST checks in at 1 AM and
the log lands on the wrong day.

## Connecting

```js
const { connectDb } = require('./src/db/connect');
const { User, Document } = require('./src/models');

await connectDb();                          // call once at boot
const u = await User.findOne({ email });    // models are ready
```

`connectDb()` is idempotent and uses `MONGODB_URI` from the environment.

## Required env vars

```bash
# Mongo
MONGODB_URI=mongodb://neuropal:<pw>@127.0.0.1:27017/neuropal?authSource=admin

# Local file storage
NEUROPAL_STORAGE_ROOT=/var/lib/neuropal/storage

# Qdrant (RAG)
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=<optional, only if you set one in qdrant config>

# Embedding provider (pick one per env)
OPENAI_API_KEY=...                # or
VOYAGE_API_KEY=...                # or local — Ollama / sentence-transformers
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536

# Claude API
ANTHROPIC_API_KEY=...

# TTS
ELEVENLABS_API_KEY=...
GOOGLE_TTS_KEY_FILE=/path/to/sa.json    # fallback
```

## What I deliberately didn't put in here

- **Refresh-token storage** — kept as a `refreshTokenJtis: [String]` array
  inside `User` (with `select: false` so it never leaks). Promote to a
  separate `Session` model if you start needing per-device revocation,
  device fingerprinting, or > ~10 active sessions per user.
- **Notification preferences as a separate model** — embedded under
  `Anchor.notify` for now. Same call as above.
- **Body-doubling rooms** (Phase 3, premium tier) — out of scope until
  the WebRTC piece lands. Add a `BodyDoublingRoom` model then.
- **Smartwatch state** (Phase 10) — schema-less for now; the watch sends
  state checkins through the existing `DailyLog.checkins.other[]` array.

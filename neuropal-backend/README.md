# NeuroPal — Mongoose schemas

13 schemas covering Phase 1–8 of the
[App Development Plan](../_unpacked/idea/idea_file_0__%20NeuroPal%20_%20App%20Development%20Plan%20(1)%2090f3f89fce56836a931f0119fc039697.md),
designed for Mongoose 8 against MongoDB 7+ / Atlas.

> **Stack note** — the plan doc names FastAPI + Supabase + pgvector. This
> set targets the Node + Express + Mongoose pivot we're on instead. RAG
> still works: MongoDB Atlas Vector Search replaces pgvector.

## File layout

```
src/
├── db/connect.js              Singleton Mongoose connection
└── models/
    ├── index.js               Re-exports all models
    ├── User.js                Auth + profile + condition flags + reader tweaks
    ├── Document.js            Uploaded paper/book metadata + ingest state
    ├── DocumentChunk.js       RAG chunks + embeddings (Atlas Vector Search)
    ├── ReadingSession.js      Per-user-per-doc progress + time spent
    ├── ChatMessage.js         Doc-grounded Q&A, threaded, with citations
    ├── CompanionMessage.js    AI companion chat w/ context-bundle snapshots
    ├── Anchor.js              Recurring anchor templates
    ├── DailyLog.js            Per-day state checkins + MVD + protocols
    ├── FrameworkConfig.js     SCAFFOLD: float zones, task menu, MVD template
    ├── Resource.js            Science library entries
    ├── Professional.js        ND-affirming professional directory
    ├── SpendingLog.js         Financial entries with state correlation
    ├── TtsCache.js            Audio chunk cache, TTL-expiring
    └── AuditLog.js            Security/compliance event log, TTL-expiring
```

## Index inventory

Each model has its indexes defined inline at the bottom of its file. Quick
summary so you can see them without opening every file:

| Model | Indexes |
|-------|---------|
| `User` | `email` unique (partial: !deleted), `deletedAt+updatedAt`, `entitlement.tier+renewsAt` |
| `Document` | `userId+createdAt`, `userId+status`, `userId+meta.doi` unique sparse, `userId+meta.arxivId` unique sparse, `deletedAt+updatedAt`, text on title+subtitle |
| `DocumentChunk` | `documentId+chunkIndex` unique, `documentId`, `userId+documentId`, **vector index on `embedding` (define in Atlas UI — see file)** |
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

### 1. Vector index for RAG (manual, Atlas-only)

`DocumentChunk.embedding` is searched via `$vectorSearch`, which requires
a **Search Index** of type `vectorSearch`. Mongoose **cannot** create this
from the schema — you have to create it in the Atlas UI (or via the Atlas
Admin API). The exact JSON definition is at the bottom of
[`models/DocumentChunk.js`](src/models/DocumentChunk.js).

Set `numDimensions` to match the embedding model:

| Model | Dimensions |
|-------|------------|
| `text-embedding-3-small` | 1536 |
| `text-embedding-3-large` | 3072 |
| `voyage-2` | 1024 |
| `voyage-3` | 1024 |

Pin one model per environment — mixing dimensions in the same index breaks
search.

### 2. TTL indexes (auto-purge)

Two collections have TTL indexes that delete rows after their `expiresAt`:

- `TtsCache` — 30 days from creation
- `AuditLog` — 13 months from creation

You don't need a cron job for either. MongoDB's TTL monitor runs every 60s.

### 3. Soft-delete sweep (manual cron)

`User.deletedAt`, `Document.deletedAt`, `Anchor.deletedAt`, `Professional.deletedAt`
are soft-delete tombstones. There's no automatic purge — wire a cron task
that runs daily and hard-deletes rows where `deletedAt < (now - 30 days)`.
Cascade-delete the related `Document`/`DocumentChunk`/`ReadingSession`/
`ChatMessage`/`CompanionMessage`/`Anchor`/`DailyLog`/`SpendingLog` rows
when a `User` is purged.

### 4. Timezone discipline for `DailyLog.date`

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

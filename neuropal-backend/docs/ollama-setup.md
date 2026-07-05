# Ollama Setup — NeuroPal Embedding Layer

This guide walks through installing Ollama on the NeuroPal server
(`161.97.154.212`), pulling the embedding model, and verifying the
backend can reach it. Once done, document ingest will go from `pending`
all the way to `ready` instead of failing at the embedding step.

---

## What Ollama is doing in this stack

Ollama runs the **text-to-vector** layer of the RAG pipeline. Nothing more.

```
Document upload  →  pdf-parse  →  chunker  →  OLLAMA (embeds)  →  MongoDB + Qdrant  →  ready
User question    →  OLLAMA (embeds the question)  →  Qdrant search  →  Claude  →  answer
```

It's a single-purpose service: receive text, return a 768-dimensional
float vector. No API keys, no billing, no per-token fees. The model
weights are open-source (Apache 2.0) and downloaded once to disk
(~274 MB for `nomic-embed-text`).

The reasoning layer (composing actual answers) stays with Claude — Ollama
only generates the search vectors that let us find the right passages.

---

## Step 1 — Install Ollama on the server

```bash
# SSH into the server
ssh your-user@161.97.154.212

# Install Ollama (single binary, ~150 MB download)
curl -fsSL https://ollama.com/install.sh | sh

# This sets up Ollama as a systemd service AND drops the `ollama` CLI on PATH.
# Confirm the service is running:
sudo systemctl status ollama
# Expected: "active (running)"
```

If `systemctl status ollama` says inactive, start it:

```bash
sudo systemctl enable ollama
sudo systemctl start ollama
```

---

## Step 2 — Open Ollama to your LAN

By default Ollama listens on `127.0.0.1:11434` (localhost only). If your
Node backend lives on the same box as Ollama, that's fine. If the backend
ever runs on a different host (or you want to test from your laptop),
you need to bind Ollama to all interfaces.

```bash
# Edit the systemd unit override
sudo systemctl edit ollama

# Paste this and save (Ctrl-X, Y, Enter on nano):
#
#   [Service]
#   Environment="OLLAMA_HOST=0.0.0.0:11434"
#
# Then reload + restart
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Open the firewall port:

```bash
# UFW (Ubuntu default)
sudo ufw allow 11434/tcp

# Or raw iptables (if UFW isn't installed)
sudo iptables -A INPUT -p tcp --dport 11434 -j ACCEPT
```

> **Security note**: Ollama has NO built-in authentication. If your
> server is internet-facing, **don't open 11434 to the public** — instead
> put it behind nginx with basic auth, or keep it bound to `127.0.0.1` and
> have the Node backend connect locally.

---

## Step 3 — Pull the embedding model

```bash
# Still SSH'd into the server
ollama pull nomic-embed-text

# ~274 MB, takes a minute or two
```

Verify:

```bash
ollama list
# Expected:
# NAME                      ID            SIZE     MODIFIED
# nomic-embed-text:latest   0a109f422b47  274 MB   2 minutes ago
```

---

## Step 4 — Smoke-test the embedding endpoint

From the server:

```bash
curl http://localhost:11434/api/embeddings \
  -d '{"model":"nomic-embed-text","prompt":"quantum decoherence"}'

# Expected: {"embedding":[-0.023,0.156,-0.089, ... 768 numbers]}
```

From your laptop (only works if you did Step 2):

```bash
curl http://161.97.154.212:11434/api/tags
# Expected: {"models":[{"name":"nomic-embed-text:latest", ...}]}

curl http://161.97.154.212:11434/api/embeddings \
  -d '{"model":"nomic-embed-text","prompt":"hello"}'
# Expected: {"embedding":[...]}
```

If the curl from your laptop times out, the firewall is still blocking.
Recheck Step 2.

---

## Step 5 — Configure the backend

Your `neuropal-backend/.env` should already have these values from
earlier setup. Confirm they look right:

```env
EMBEDDER=ollama
OLLAMA_URL=http://161.97.154.212:11434
OLLAMA_MODEL=nomic-embed-text
EMBEDDING_DIM=768
```

If Ollama is on the same box as the backend, switch `OLLAMA_URL` to
`http://localhost:11434` for lower latency.

Restart the backend:

```bash
cd neuropal-backend
npm run dev
```

Watch the boot log. You should see:

```
[storage] root: /…/storage
[db] connected to neuropal
[qdrant] created collection nomic-embed-text-v1.5 (dim=768)
[qdrant] ready: nomic-embed-text-v1.5
[api] listening on :4000
```

No more `[qdrant] ensureCollection failed: Unauthorized` and no more
"Ollama unreachable" errors.

---

## Step 6 — End-to-end test

```bash
# Register a test user
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ollama-test@local","password":"password1234"}' \
  | jq -r .token)

# Upload a small text file
echo -e "Paragraph one.\n\nParagraph two." > /tmp/test.txt
DOC_ID=$(curl -s -X POST http://localhost:4000/api/documents/upload \
  -H "x-session: $TOKEN" \
  -F "file=@/tmp/test.txt" \
  -F "title=Ollama Test" \
  | jq -r ._id)

# Poll status — should reach "ready" within ~3 seconds
for i in $(seq 1 10); do
  STATUS=$(curl -s http://localhost:4000/api/documents/$DOC_ID \
    -H "x-session: $TOKEN" | jq -r .status)
  echo "t+${i}s: $STATUS"
  [ "$STATUS" = "ready" ] && break
  sleep 1
done

# Ask a question — should return an actual answer
curl -s -X POST http://localhost:4000/api/documents/$DOC_ID/query \
  -H "x-session: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is paragraph one about?"}' | jq
```

If you see `status: "ready"` and the query returns a Claude-generated
answer with citations, the whole RAG pipeline is wired correctly.

---

## Trying other embedding models

`nomic-embed-text` is the default because it's small, fast, and good
enough. Other open-source embedders run on Ollama too:

| Model | Dim | Size | When to use |
|-------|-----|------|-------------|
| `nomic-embed-text` | 768 | 274 MB | Default — best quality-to-size ratio |
| `bge-large-en-v1.5` | 1024 | 670 MB | Slightly higher quality, double the size |
| `mxbai-embed-large` | 1024 | 670 MB | Comparable to bge, sometimes wins on MTEB |
| `snowflake-arctic-embed:335m` | 1024 | 670 MB | Snowflake's open model, very strong on retrieval |

To swap:

```bash
# On server
ollama pull bge-large-en-v1.5

# On backend .env, update both lines:
OLLAMA_MODEL=bge-large-en-v1.5
EMBEDDING_DIM=1024

# Restart backend, then re-ingest any existing docs:
# (each doc gets new vectors in a new Qdrant collection named after the model)
curl -X POST http://localhost:4000/api/documents/<DOC_ID>/reingest \
  -H "x-session: $TOKEN"
```

Existing chunks stay in the old Qdrant collection (`nomic-embed-text-v1.5`)
until you re-ingest. The backend's embedder.js `OLLAMA_MODEL_MAP` already
knows both model names.

---

## Hosted alternatives (only if you outgrow self-hosted)

If you ever need higher-throughput embedding than a CPU server can give
(>1000 chunks per minute sustained), three drop-in options exist:

| Provider | What it is | API-key needed | Pricing |
|----------|------------|----------------|---------|
| **OpenAI** | `text-embedding-3-small` / `large` | Yes (`sk-...`) | $0.02 / 1M tokens (small), $0.13 / 1M (large) |
| **Voyage AI** | `voyage-3`, `voyage-3-large` | Yes | ~$0.06 / 1M tokens |
| **Together AI** | Llama-Embed, M2-BERT etc. | Yes | ~$0.01 / 1M tokens |

The backend's `src/services/embedder.js` already has the OpenAI path
implemented — just flip `EMBEDDER=openai` and add `OPENAI_API_KEY` to
`.env`. Voyage / Together would need their respective HTTP calls added
to the same file. Happy to wire one of them up if needed.

For now: **stick with Ollama**. NeuroPal's product principle is
"User data never leaves your server", and that's only honored by
self-hosted embeddings.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `[ingest] failed: getaddrinfo ENOTFOUND` | OLLAMA_URL hostname doesn't resolve | Use IP, not domain |
| `[ingest] failed: connect ECONNREFUSED` | Ollama isn't listening on the URL the backend uses | `systemctl status ollama` + check `OLLAMA_HOST` |
| `[ingest] failed: connect ETIMEDOUT` | Firewall blocks 11434 | Step 2 |
| `[ingest] failed: Request failed with status code 404` | Model isn't pulled | `ollama pull <model>` |
| `[ingest] failed: Ollama returned no embedding` | Wrong model name in OLLAMA_MODEL | `ollama list` to see exact names |
| Embeddings work but Qdrant upsert fails 401 | QDRANT_API_KEY missing or wrong | Set in `.env` |

---

## Service management cheat sheet

```bash
# Status
sudo systemctl status ollama

# Logs (live tail)
sudo journalctl -u ollama -f

# Restart after .env or config change
sudo systemctl restart ollama

# Stop / start
sudo systemctl stop ollama
sudo systemctl start ollama

# Disable autostart on boot
sudo systemctl disable ollama

# Disk usage of pulled models
du -sh ~/.ollama/models/
ollama list
```

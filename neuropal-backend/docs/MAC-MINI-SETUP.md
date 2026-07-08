# Mac Mini M4 — Backend Host Setup

Complete bring-up guide for the NeuroPal backend on the Mac Mini. Self-contained:
no prior chat context needed. Follow top to bottom; ~30 minutes plus model
download time.

The Mini is the always-on backend host (Build Brief §1–§3). Every other device
(S24 Ultra, iPhone, MacBooks) is a thin client hitting `http://<mini-ip>:4000`.

---

## 0. Prerequisites (one-time installs)

```bash
# Homebrew (if not present)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node 20+ (backend runtime)
brew install node@22 git

# Docker Desktop (Mongo + Qdrant containers)
brew install --cask docker
# Launch Docker.app once so the daemon starts; enable "Start Docker Desktop
# when you sign in" in its settings.
# (Alternative: `brew install --cask orbstack` — lighter, drop-in compatible.)

# Ollama (local embeddings + offline reasoning)
brew install --cask ollama
# Launch Ollama.app once; it serves on localhost:11434 and autostarts.
```

## 1. Get the code

```bash
# GitHub (primary path — repo: Ryx007/NeuroPal, private)
git clone https://github.com/Ryx007/NeuroPal.git
cd NeuroPal/neuropal-backend
```

No GitHub access on the Mini yet? Either `gh auth login` first, or rsync from
the MacBook Pro over the LAN:

```bash
# Run ON the MacBook Pro (replace <mini-ip>):
rsync -av --exclude node_modules --exclude .git.corrupt.bak \
  "/Users/ryx/Documents/Gitkraken/App Dev/NeuroPal/" \
  ryx@<mini-ip>:~/NeuroPal/
```

## 2. Environment file

`.env` is git-ignored (it holds secrets), so it must be created on the Mini:

```bash
cp .env.example .env
```

Then edit `.env` — every value below is required:

| Key | Value on the Mini |
|---|---|
| `PORT` | `4000` |
| `MONGO_ROOT_USER` / `MONGO_ROOT_PASSWORD` | pick credentials; compose seeds Mongo with them on first start |
| `MONGODB_URI` | `mongodb://<user>:<url-escaped-pw>@localhost:27017/neuropal?authSource=admin` (escape `!` as `%21`) |
| `QDRANT_URL` | `http://localhost:6333` |
| `QDRANT_API_KEY` | empty (local Qdrant, no auth) |
| `EMBEDDER` | `ollama` |
| `OLLAMA_URL` | `http://localhost:11434` |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` |
| `EMBEDDING_DIM` | `768` |
| `AI_PROVIDER` | `gemini` (or `ollama` for fully-offline, `anthropic` for paid) |
| `GEMINI_API_KEY` | free key from https://aistudio.google.com → "Get API key" |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `OLLAMA_CHAT_MODEL` | `qwen2.5:7b` |
| `LOCAL_MODE` | `true` (single-user, no login) |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `STORAGE_ROOT` | `./storage` |
| `INBOX_DIR` | `/Users/ryx/NeuroPal-Inbox` — watched drop-folder; files dropped here auto-ingest into the library (LOCAL_MODE only; optional, defaults to `<STORAGE_ROOT>/inbox`) |

Faster alternative: copy the working `.env` from the MacBook Pro:

```bash
# ON the MacBook Pro:
scp "/Users/ryx/Documents/Gitkraken/App Dev/NeuroPal/neuropal-backend/.env" ryx@<mini-ip>:~/NeuroPal/neuropal-backend/.env
# Then on the Mini just paste GEMINI_API_KEY if still blank.
```

## 3. Databases (Docker)

```bash
cd ~/NeuroPal/neuropal-backend
docker compose up -d
docker compose ps        # both neuropal-mongo and neuropal-qdrant "running"
```

Data persists in named volumes (`neuropal-mongo-data`, `neuropal-qdrant-data`)
across restarts and `docker compose down`. Only `down -v` wipes it.

## 4. Ollama models

```bash
ollama pull nomic-embed-text   # embeddings, ~274 MB
ollama pull qwen2.5:7b         # local reasoning fallback, ~4.7 GB
ollama list                    # both should appear
```

## 5. Install + run the backend

```bash
npm install
npm run dev        # node --watch src/server.js
```

Expected boot log:

```
[storage] root: /Users/ryx/NeuroPal/neuropal-backend/storage
[db] connected to neuropal
[qdrant] created collection nomic-embed-text-v1.5 (dim=768)   ← first boot only
[qdrant] ready: nomic-embed-text-v1.5
[api] listening on :4000
```

## 6. Phase 0 acceptance test

```bash
# Databases
curl -s localhost:6333/collections | head -c 200; echo
docker exec neuropal-mongo mongosh --quiet --eval "db.adminCommand('ping')" \
  -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin

# Ollama
curl -s localhost:11434/api/tags | head -c 300; echo

# Backend
curl -s localhost:4000/healthz
```

## 7. Phase 1 acceptance test (Module 0 backend loop, via curl)

`LOCAL_MODE=true` means no token is needed — every request is the local user.

```bash
# 1) Upload a real PDF
DOC=$(curl -s -X POST localhost:4000/api/documents/upload \
  -F "file=@$HOME/Downloads/some-paper.pdf" | python3 -c 'import json,sys; print(json.load(sys.stdin)["_id"])')
echo "doc: $DOC"

# 2) Watch status walk pending→parsing→chunking→embedding→ready
watch -n1 "curl -s localhost:4000/api/documents/$DOC | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[\"status\"], d.get(\"ingestError\",\"\"))'"

# 3) Full text (for TTS)
curl -s localhost:4000/api/documents/$DOC/text | head -c 400; echo

# 4) Grounded Q&A via Gemini (default provider)
curl -s -X POST localhost:4000/api/documents/$DOC/query \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is the main result of this paper?"}' | python3 -m json.tool

# 5) Same question through the local model (offline path)
curl -s -X POST localhost:4000/api/documents/$DOC/query \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is the main result of this paper?","provider":"ollama"}' | python3 -m json.tool

# 6) Which provider is active?
curl -s localhost:4000/api/ai/provider | python3 -m json.tool
```

## 8. LAN exposure (for the phones + laptops)

```bash
ipconfig getifaddr en0     # → the Mini's LAN IP, e.g. 192.168.0.50
```

- macOS will prompt "Allow node to accept incoming connections" on first
  external hit — click Allow (or System Settings → Network → Firewall →
  Options → add node).
- Give the Mini a static IP / DHCP reservation in your router so the IP
  doesn't drift.
- Frontend env (on whatever machine runs Expo):
  `EXPO_PUBLIC_API_BASE_URL=http://<mini-ip>:4000`

Sanity check from another device on the same WiFi:
`curl http://<mini-ip>:4000/healthz`

## 9. Keep it always-on

- System Settings → Energy → **Prevent automatic sleeping when the display is
  off: ON**, **Start up automatically after a power failure: ON**.
- Docker Desktop + Ollama: enable "open at login" in each app's settings.
- Backend as a service (survives reboots) — simplest is pm2:

```bash
npm install -g pm2
pm2 start src/server.js --name neuropal-api --cwd ~/NeuroPal/neuropal-backend
pm2 save
pm2 startup    # prints one sudo command — run it
```

## 10. Day-2 operations

```bash
pm2 logs neuropal-api          # backend logs
docker compose logs -f         # DB logs
docker compose down            # stop DBs (data kept)
git pull && npm install && pm2 restart neuropal-api   # deploy an update
```

# NeuroPal — Travel Restore (USB → MacBook Air)

> Self-contained. You do **not** need chat history or internet-at-the-airport
> to follow this. It restores the Mini's NeuroPal onto the laptop.
>
> _Pack created 2026-08-04 22:27 · repo at `d1d3088` · Mini was `192.168.3.229`_

---

## What's on the USB

`/Volumes/<USB>/neuropal-travel/` — **data only**. Code comes from git,
models re-download.

| File | What it is |
|---|---|
| `neuropal.archive` | Mongo dump (gzipped) — **4 documents, 3 notes** |
| `qdrant/` | Qdrant snapshot — **1029 points**, `nomic-embed-text-v1.5` |
| `storage.tar.gz` | The uploaded books/PDFs themselves (137 MB) |
| `env.backup` | The backend `.env` — **contains `GEMINI_API_KEY` and the Mongo password. Keep this USB on you.** |
| `MANIFEST.txt` | The counts above, to verify against after restoring |

## Before you fly (needs internet)

```bash
# Docker Desktop, then:
brew install node@20 git gh ollama python3
git clone https://github.com/Ryx007/NeuroPal.git ~/Dev/NeuroPal
```

Node 20 is what the Mini runs (`v20.20.2`). Ollama's `nomic-embed-text` model
downloads during the restore — **do not substitute another embedder**, the
1029 restored vectors are 768-dim and switching invalidates every one.

## Restore (one command)

```bash
cd ~/Dev/NeuroPal
./scripts/unpack-on-laptop.sh /Volumes/<USB>/neuropal-travel
```

That script does all eight steps: copies `.env` and rewrites the
machine-specific paths, brings up Mongo + Qdrant in Docker, restores the dump
and the snapshot, unpacks `storage/`, pulls the Ollama embedder, builds the
mathserve venv, and starts all three services under pm2.

**Verify:** it prints `documents=` / `notes=` / points at the end. They must
match `MANIFEST.txt` (4 / 3 / 1029). Then:

```bash
curl 'http://localhost:4000/healthz?deps=1'    # mongo, qdrant, ollama, extractor all up:true
```

## Then start the web app

The backend does **not** serve the web app any more — that's a separate
process on its own port.

```bash
cd ~/Dev/NeuroPal/neuropal-expo-app
npx expo export -p web          # populates WEB_DIST; the restore script already pointed .env at it
open http://localhost:8081
```

- **:8081** = `neuropal-web`, the web app. It proxies `/api`, `/healthz`,
  `/katex`, `/apk` to the API.
- **:4000** = `neuropal-api`, API only. `http://localhost:4000/` is a 404 by
  design — don't panic, that's not a broken install.
- Dev server if you're editing: `npx expo start --web --port 8082`
  (**8082**, because 8081 is taken and Metro also defaults to 8081).

Settings → Backend connection should read **"Connected · this server"**. That
exact wording is the proof the web app resolved the API through the proxy.

## Phone (S24)

The APK's baked addresses point at the Mini and are dead once you leave.
**No rebuild needed** — repoint it at runtime:

> Settings → Backend connection → Backend address →
> `http://<laptop-ip>:4000` → **Save & test**

Get the laptop IP with `ipconfig getifaddr en0`. Same Wi-Fi, laptop awake.
Note the phone talks to **:4000** (the API), not :8081.

Better if you can: install Tailscale on the laptop and sign into the same
tailnet (the S24 is already enrolled), then use the laptop's MagicDNS name —
that survives any network change.

## Going home — getting work back to the Mini

Code: just `git push` from the laptop; the Mini pulls.

**Data does not merge.** If you read/annotate on the laptop, the laptop's
Mongo is authoritative for that work and the Mini's is stale. Re-pack from
the laptop and restore onto the Mini the same way, or accept the split. There
is no sync between the two — deciding which side wins is a manual choice.

## If something fails

| Symptom | Cause / fix |
|---|---|
| `MONGO_ROOT_PASSWORD is empty` | `env.backup` didn't copy; re-run with the USB mounted |
| Mongo won't start | Docker Desktop isn't running |
| Restore counts don't match MANIFEST | The snapshot upload failed — reingest that collection, or re-pack |
| Ask/Q&A returns nothing | Qdrant snapshot missing → the books are readable but need a reingest |
| Equations show as raw LaTeX | KaTeX isn't reachable: `curl -I localhost:8081/katex/katex.min.css` should be 200 |
| Web app 404s everywhere | `WEB_DIST` is empty — run `npx expo export -p web` |
| `pm2` services died on reboot | Run the `sudo` line that `pm2 startup` printed, then `pm2 save` |

Deeper context — architecture, every established root cause, decisions and
rejected alternatives — is in the repo: `docs/HANDOFF.md`, then
`docs/BRAIN.md`.

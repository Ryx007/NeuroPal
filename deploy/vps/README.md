# NeuroPal backend on the Contabo VPS

The public backend: **https://api.ryx007.work**, signed-in (no `LOCAL_MODE`),
behind a Cloudflare Tunnel.

```
phone / laptop ──HTTPS──▶ Cloudflare edge ──tunnel──▶ cloudflared ─▶ api:4000
                                                                     ├─ mongo   (MongoDB 8.0)
                                                                     ├─ qdrant  (vectors, API key)
                                                                     └─ ollama  (nomic-embed-text)
```

- **No host ports.** Every service sits on one private Docker network;
  cloudflared dials out to Cloudflare. The server's other services (nginx on
  80/443, mail, :8081) are not touched, and nothing here listens on the
  internet.
- **Own data.** Separate MongoDB/Qdrant/Ollama containers and volumes
  (compose project `neuropal-v2`), so nothing is shared with anything else on
  the server.
- **Sign-in on.** New accounts need the invite code (`SIGNUP_INVITE_CODE` in
  `.env`). Login is rate-limited per address and per account.

## First install (as root on the VPS)

```bash
git clone --branch v2-platform https://github.com/Ryx007/NeuroPal.git /opt/neuropal
cd /opt/neuropal/deploy/vps
./bootstrap.sh      # secrets → .env, asks for the Gemini key, builds, starts
./tunnel.sh         # prints a Cloudflare link once; then https://api.ryx007.work
```

`bootstrap.sh` doesn't install Docker. The server is shared, so installing
system packages is a deliberate step of its own.

## Update to the latest code

```bash
cd /opt/neuropal && git pull && cd deploy/vps && docker compose up -d --build api
```

## Everyday

| | |
|---|---|
| Status | `docker compose ps` |
| API log | `docker compose logs -f api` |
| Health | `curl https://api.ryx007.work/healthz?deps=1` |
| Invite code | `grep SIGNUP_INVITE_CODE .env` |
| Stop / start | `docker compose down` / `docker compose up -d` (data survives) |

## Backups

`backup` dumps MongoDB every night to `deploy/vps/backups/` and keeps 14
days. Uploaded files live in the `neuropal-v2_storage` volume. Vectors are
derived: Settings → Reingest all rebuilds them from MongoDB. Copy the
backups off the server now and then:

```bash
scripts/pull-backup.sh      # on the Mac: rsyncs backups/ to ~/NeuroPal-backups
```

## Limits worth knowing

- **Uploads over 100 MB** fail: Cloudflare's free plan caps a request body
  at 100 MB. Bigger books need chunked upload (not built yet).
- **No Nougat math tier** here. It needs the Mac's GPU, so PDFs use
  pdf-parse (with OCR for scans). `/healthz?deps=1` reports the extractor
  as `disabled`.
- The AI provider is whatever `.env` says. With free Gemini, Google may
  use what you send to improve its products (docs/HANDOFF.md §0).

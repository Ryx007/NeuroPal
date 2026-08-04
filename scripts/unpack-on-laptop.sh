#!/usr/bin/env bash
# unpack-on-laptop.sh — run on the MACBOOK AIR (Apple Silicon).
# Restores the NeuroPal backend and starts all THREE services:
#   neuropal-api        :4000  Express API
#   neuropal-web        :8081  static web app + /api,/healthz,/katex,/apk proxy
#   neuropal-mathserve  :8077  nougat math extraction (Python venv, MPS)
#
#   ./scripts/unpack-on-laptop.sh /Volumes/<USB>/neuropal-travel
#
# Prereqs (need internet — do them before you fly, or at home in India):
#   Docker Desktop · brew install node@20 git gh ollama · python3
#   git clone https://github.com/Ryx007/NeuroPal.git ~/Dev/NeuroPal

set -euo pipefail

SRC="${1:-}"
[[ -n "$SRC" && -d "$SRC" ]] || { echo "usage: $0 /Volumes/<USB>/neuropal-travel" >&2; exit 1; }

REPO="${REPO:-$HOME/Dev/NeuroPal}"
BACKEND="${BACKEND:-$REPO/neuropal-backend}"
MATHSERVE="${MATHSERVE:-$REPO/neuropal-mathserve}"
MONGO_CT="${MONGO_CT:-neuropal-mongo}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
WITH_QWEN="${WITH_QWEN:-0}"   # WITH_QWEN=1 to also pull the 4.7GB offline chat fallback

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }

[[ -d "$BACKEND" ]] || die "backend not found at $BACKEND — clone the repo first, or set REPO=/path/to/NeuroPal"
[[ -f "$SRC/MANIFEST.txt" ]] && { echo; cat "$SRC/MANIFEST.txt"; } || warn "no MANIFEST.txt — is $SRC the right folder?"

say "0/8  Prerequisites"
command -v docker >/dev/null || die "Docker not installed"
docker info >/dev/null 2>&1 || die "Docker isn't running — start Docker Desktop"
command -v node >/dev/null   || die "Node not installed (brew install node@20)"
command -v python3 >/dev/null || die "python3 not found (needed for mathserve)"
command -v ollama >/dev/null || warn "Ollama missing — embeddings/ingest will fail until installed"
echo "    ✓ docker $(docker --version | awk '{print $3}' | tr -d ,) · node $(node --version) · python $(python3 -V 2>&1 | awk '{print $2}')"

# ---------- 1. .env ----------
say "1/8  Config (.env) + machine-specific paths"
[[ -f "$BACKEND/.env" ]] && cp "$BACKEND/.env" "$BACKEND/.env.bak.$(date +%s)" && warn "existing .env backed up"
cp "$SRC/env.backup" "$BACKEND/.env"; chmod 600 "$BACKEND/.env"

NEW_STORAGE="$HOME/NeuroPal-storage"
NEW_INBOX="$HOME/NeuroPal-Inbox"
NEW_WEBDIST="$REPO/neuropal-expo-app/dist"
mkdir -p "$NEW_STORAGE" "$NEW_INBOX"

set_env() {  # set_env KEY VALUE — replace or append, macOS sed
  local k="$1" v="$2" f="$BACKEND/.env"
  if grep -qE "^$k=" "$f"; then
    python3 - "$f" "$k" "$v" <<'PY'
import sys,re
f,k,v=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(f).read()
s=re.sub(rf'^{re.escape(k)}=.*$', f'{k}={v}', s, count=1, flags=re.M)
open(f,'w').write(s)
PY
  else
    printf '%s=%s\n' "$k" "$v" >> "$f"
  fi
}
set_env STORAGE_ROOT "$NEW_STORAGE"
set_env INBOX_DIR    "$NEW_INBOX"
set_env WEB_DIST     "$NEW_WEBDIST"
set_env APK_PATH     ""            # no Android toolchain here; nothing to serve at /apk
echo "    ✓ STORAGE_ROOT=$NEW_STORAGE"
echo "    ✓ INBOX_DIR=$NEW_INBOX"
echo "    ✓ WEB_DIST=$NEW_WEBDIST   (populate with: npx expo export -p web)"

get_env() { grep -E "^$1=" "$BACKEND/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r'; }
MONGO_URI="$(get_env MONGODB_URI || true)"
MONGO_USER="$(printf '%s' "$MONGO_URI" | sed -n 's#^mongodb://\([^:]*\):.*#\1#p')"
MONGO_PASS="$(printf '%s' "$MONGO_URI" | sed -n 's#^mongodb://[^:]*:\([^@]*\)@.*#\1#p')"
MONGO_PASS="$(printf '%s' "$MONGO_PASS" | python3 -c 'import sys,urllib.parse;sys.stdout.write(urllib.parse.unquote(sys.stdin.read()))' 2>/dev/null || printf '%s' "$MONGO_PASS")"
MONGO_DB="$(printf '%s' "$MONGO_URI" | sed -n 's#.*/\([^/?]*\)\(?.*\)\?$#\1#p')"; MONGO_DB="${MONGO_DB:-neuropal}"
MONGO_USER="${MONGO_USER:-$(get_env MONGO_ROOT_USER || echo admin)}"
[[ -n "$MONGO_PASS" ]] || MONGO_PASS="$(get_env MONGO_ROOT_PASSWORD || true)"
grep -qE '^MONGO_ROOT_PASSWORD=.+' "$BACKEND/.env" \
  || die "MONGO_ROOT_PASSWORD is empty in .env — docker compose requires it (see .env.example)"
[[ -n "$(get_env GEMINI_API_KEY || true)" ]] \
  || warn "GEMINI_API_KEY is empty — AI_PROVIDER=gemini needs it (aistudio.google.com)"

# ---------- 2. databases ----------
say "2/8  MongoDB + Qdrant (Docker)"
( cd "$BACKEND" && docker compose up -d )
printf "    waiting for Mongo"
for _ in $(seq 1 60); do
  docker exec "$MONGO_CT" mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1 && break
  printf "."; sleep 2
done; echo

# ---------- 3. restore mongo ----------
say "3/8  Restoring MongoDB"
AUTH=(--username "$MONGO_USER" --authenticationDatabase admin)
[[ -n "${MONGO_PASS:-}" ]] && AUTH+=(--password "$MONGO_PASS")
if [[ -f "$SRC/neuropal.archive" ]]; then
  docker cp "$SRC/neuropal.archive" "$MONGO_CT:/tmp/np.archive"
  docker exec "$MONGO_CT" mongorestore "${AUTH[@]}" --archive=/tmp/np.archive --gzip --drop
  docker exec "$MONGO_CT" rm -f /tmp/np.archive
elif [[ -f "$SRC/mongo-volume.tar.gz" ]]; then
  warn "raw-volume mode — stopping Mongo to swap its data dir"
  VOL=$(docker inspect "$MONGO_CT" -f '{{range .Mounts}}{{if eq .Destination "/data/db"}}{{.Name}}{{end}}{{end}}')
  docker stop "$MONGO_CT" >/dev/null
  docker run --rm -v "$VOL:/data" -v "$SRC:/in" alpine sh -c 'rm -rf /data/* && tar xzf /in/mongo-volume.tar.gz -C /data'
  docker start "$MONGO_CT" >/dev/null; sleep 8
else
  die "no Mongo dump in $SRC"
fi
DOCS=$(docker exec "$MONGO_CT" mongosh "${AUTH[@]}" --quiet \
  --eval "db.getSiblingDB('$MONGO_DB').documents.countDocuments({deletedAt:null})" 2>/dev/null | tr -d '\r' || echo "?")
NOTES=$(docker exec "$MONGO_CT" mongosh "${AUTH[@]}" --quiet \
  --eval "db.getSiblingDB('$MONGO_DB').notes.countDocuments({deletedAt:null})" 2>/dev/null | tr -d '\r' || echo "?")
echo "    ✓ documents=$DOCS  notes=$NOTES   (compare with MANIFEST)"

# ---------- 4. restore qdrant ----------
say "4/8  Restoring Qdrant"
printf "    waiting for Qdrant"
for _ in $(seq 1 45); do curl -fsS "$QDRANT_URL/collections" >/dev/null 2>&1 && break; printf "."; sleep 2; done; echo
if compgen -G "$SRC/qdrant/*" >/dev/null; then
  for F in "$SRC"/qdrant/*; do
    B=$(basename "$F"); C="${B%%--*}"
    echo "    · $C"
    curl -fsS -X POST "$QDRANT_URL/collections/$C/snapshots/upload?priority=snapshot" \
      -H 'Content-Type:multipart/form-data' -F "snapshot=@$F" >/dev/null \
      || warn "upload failed for $C — reingest that collection later"
    PTS=$(curl -fsS "$QDRANT_URL/collections/$C" \
      | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["points_count"])' 2>/dev/null || echo "?")
    echo "      ✓ $PTS points"
  done
else
  warn "no snapshots in pack — reading works, Ask/Q&A needs a reingest"
fi

# ---------- 5. files ----------
say "5/8  Uploaded documents"
if [[ -f "$SRC/storage.tar.gz" ]]; then
  tar xzf "$SRC/storage.tar.gz" -C "$NEW_STORAGE"
  echo "    ✓ $(du -sh "$NEW_STORAGE" | cut -f1)"
else
  warn "no storage.tar.gz — reader will have no source files"
fi

# ---------- 6. ollama ----------
say "6/8  Ollama models (downloading — you said internet is good)"
if command -v ollama >/dev/null; then
  pgrep -qx ollama || (brew services start ollama >/dev/null 2>&1 || (ollama serve >/dev/null 2>&1 &)); sleep 3
  # Embeddings MUST stay nomic-embed-text (768 dims) — switching embedders
  # invalidates every vector in the restored Qdrant collection.
  ollama pull nomic-embed-text || warn "pull failed — retry later: ollama pull nomic-embed-text"
  [[ "$WITH_QWEN" = "1" ]] && { echo "    pulling qwen2.5:7b (~4.7GB)…"; ollama pull qwen2.5:7b || warn "qwen pull failed"; } \
    || echo "    · skipping qwen2.5:7b (Gemini is your provider). WITH_QWEN=1 to add the offline fallback."
fi

# ---------- 7. mathserve ----------
say "7/8  Math extraction service (nougat on MPS)"
if [[ -d "$MATHSERVE" ]]; then
  ( cd "$MATHSERVE"
    [[ -d .venv ]] || python3 -m venv .venv          # venv is NOT portable — always built here
    .venv/bin/pip install -q --upgrade pip
    .venv/bin/pip install -q -r requirements.txt )
  echo "    ✓ venv ready (model ~1GB downloads to ~/.cache/huggingface on first job)"
else
  warn "no neuropal-mathserve/ — equations fall back to pdf-parse"
fi

# ---------- 8. services ----------
say "8/8  Starting services under pm2"
command -v pm2 >/dev/null || npm i -g pm2
cd "$BACKEND"; [[ -d node_modules ]] || { echo "    npm ci…"; npm ci; }

pm2 delete neuropal-api neuropal-web neuropal-mathserve >/dev/null 2>&1 || true
pm2 start src/server.js    --name neuropal-api
pm2 start src/webServer.js --name neuropal-web
[[ -d "$MATHSERVE/.venv" ]] && ( cd "$MATHSERVE" && pm2 start server.py --name neuropal-mathserve --interpreter "$MATHSERVE/.venv/bin/python" )
pm2 save
echo; echo "    reboot persistence — run the sudo line pm2 prints:"; pm2 startup | tail -2

sleep 4
say "Health"
curl -fsS 'http://localhost:4000/healthz?deps=1' && echo || warn "no response — pm2 logs neuropal-api"

cat <<EOF

────────────────────────────────────────────────────────────
 Backend is live on this laptop.

 Web app:   cd $REPO/neuropal-expo-app
            npx expo export -p web      # populates WEB_DIST
            open http://localhost:8081
   or dev:  npx expo start --web --port 8082

 PHONE (S24): the APK's baked hosts point at the Mini and are
 now dead. Repoint WITHOUT rebuilding:
   Settings → Backend connection → set the override to
     http://<this-mac-ip>:4000      (ipconfig getifaddr en0)
   Same Wi-Fi, laptop awake.

 Better: install Tailscale on this Mac and sign into the same
 tailnet (the S24 is already enrolled) — then use this Mac's
 MagicDNS name and it works on any network.
────────────────────────────────────────────────────────────
EOF

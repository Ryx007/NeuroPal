#!/usr/bin/env bash
# pack-for-travel.sh — run on the MAC MINI.
# Packs the NeuroPal *data* the MacBook Air needs. Code comes from git;
# models and images come from the internet (you have good internet in India).
#
#   ./scripts/pack-for-travel.sh /Volumes/<USB>/neuropal-travel
#
# Packs:  Mongo dump · Qdrant snapshots · storage/ · backend .env
# Skips:  the git repo (clone it — a USB .git copy corrupted it once),
#         node_modules, Ollama models, HuggingFace/nougat cache, Docker images,
#         the mathserve .venv (not portable between machines).

set -euo pipefail

DEST="${1:-}"
[[ -n "$DEST" ]] || { echo "usage: $0 /Volumes/<USB>/neuropal-travel" >&2; exit 1; }

REPO="${REPO:-$HOME/Documents/Gitkraken/NeuroPal}"
BACKEND="${BACKEND:-$REPO/neuropal-backend}"
MONGO_CT="${MONGO_CT:-neuropal-mongo}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }

[[ -f "$BACKEND/.env" ]] || die "no .env at $BACKEND — set BACKEND=/path/to/neuropal-backend"
mkdir -p "$DEST"
say "Packing into $DEST"

# ---------- read config ----------
ENV_FILE="$BACKEND/.env"
get_env() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r'; }

MONGO_URI="$(get_env MONGODB_URI || true)"
STORAGE_ROOT="$(get_env STORAGE_ROOT || true)"
[[ -n "$STORAGE_ROOT" ]] || STORAGE_ROOT="./storage"
[[ "$STORAGE_ROOT" = /* ]] || STORAGE_ROOT="$BACKEND/${STORAGE_ROOT#./}"

MONGO_USER="$(printf '%s' "$MONGO_URI" | sed -n 's#^mongodb://\([^:]*\):.*#\1#p')"
MONGO_PASS="$(printf '%s' "$MONGO_URI" | sed -n 's#^mongodb://[^:]*:\([^@]*\)@.*#\1#p')"
# .env.example says specials are URL-escaped in the URI (! -> %21); mongodump needs the literal.
MONGO_PASS="$(printf '%s' "$MONGO_PASS" | python3 -c 'import sys,urllib.parse;sys.stdout.write(urllib.parse.unquote(sys.stdin.read()))' 2>/dev/null || printf '%s' "$MONGO_PASS")"
MONGO_DB="$(printf '%s' "$MONGO_URI" | sed -n 's#.*/\([^/?]*\)\(?.*\)\?$#\1#p')"
MONGO_DB="${MONGO_DB:-neuropal}"
MONGO_USER="${MONGO_USER:-$(get_env MONGO_ROOT_USER || echo admin)}"
[[ -n "$MONGO_PASS" ]] || MONGO_PASS="$(get_env MONGO_ROOT_PASSWORD || true)"

echo "    backend : $BACKEND"
echo "    storage : $STORAGE_ROOT"
echo "    mongo   : $MONGO_DB (user $MONGO_USER)"

docker info >/dev/null 2>&1 || die "Docker isn't running — start Docker Desktop"
docker ps --format '{{.Names}}' | grep -qx "$MONGO_CT" \
  || die "container '$MONGO_CT' not running — 'docker compose up -d' in $BACKEND"

AUTH=(--username "$MONGO_USER" --authenticationDatabase admin)
[[ -n "${MONGO_PASS:-}" ]] && AUTH+=(--password "$MONGO_PASS")

# ---------- 1. Mongo ----------
say "1/5  MongoDB dump"
if docker exec "$MONGO_CT" sh -c 'command -v mongodump' >/dev/null 2>&1; then
  docker exec "$MONGO_CT" mongodump "${AUTH[@]}" --db "$MONGO_DB" \
    --archive=/tmp/np.archive --gzip
  docker cp "$MONGO_CT:/tmp/np.archive" "$DEST/neuropal.archive"
  docker exec "$MONGO_CT" rm -f /tmp/np.archive
  echo "    ✓ $(du -h "$DEST/neuropal.archive" | cut -f1)"
else
  warn "mongodump not in the image — raw volume copy instead"
  VOL=$(docker inspect "$MONGO_CT" -f '{{range .Mounts}}{{if eq .Destination "/data/db"}}{{.Name}}{{end}}{{end}}')
  [[ -n "$VOL" ]] || die "could not find the Mongo data volume"
  docker stop "$MONGO_CT" >/dev/null
  docker run --rm -v "$VOL:/data" -v "$DEST:/out" alpine tar czf /out/mongo-volume.tar.gz -C /data .
  docker start "$MONGO_CT" >/dev/null; sleep 6
  echo "    ✓ mongo-volume.tar.gz"
fi

DOC_COUNT=$(docker exec "$MONGO_CT" mongosh "${AUTH[@]}" --quiet \
  --eval "db.getSiblingDB('$MONGO_DB').documents.countDocuments({deletedAt:null})" 2>/dev/null | tr -d '\r' || echo "?")
NOTE_COUNT=$(docker exec "$MONGO_CT" mongosh "${AUTH[@]}" --quiet \
  --eval "db.getSiblingDB('$MONGO_DB').notes.countDocuments({deletedAt:null})" 2>/dev/null | tr -d '\r' || echo "?")

# ---------- 2. Qdrant ----------
say "2/5  Qdrant snapshots"
mkdir -p "$DEST/qdrant"
COLLS=$(curl -fsS "$QDRANT_URL/collections" 2>/dev/null \
  | python3 -c 'import sys,json;print("\n".join(c["name"] for c in json.load(sys.stdin)["result"]["collections"]))' 2>/dev/null || true)
PTS_MANIFEST=""
if [[ -z "$COLLS" ]]; then
  warn "Qdrant unreachable — skipping (Ask/Q&A would need a reingest on the laptop)"
else
  for C in $COLLS; do
    echo "    · $C"
    SNAP=$(curl -fsS -X POST "$QDRANT_URL/collections/$C/snapshots" \
      | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["name"])')
    curl -fsS -o "$DEST/qdrant/$C--$SNAP" "$QDRANT_URL/collections/$C/snapshots/$SNAP"
    PTS=$(curl -fsS "$QDRANT_URL/collections/$C" \
      | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["points_count"])' 2>/dev/null || echo "?")
    PTS_MANIFEST+="$C=$PTS "
    echo "      ✓ $PTS points"
  done
fi

# ---------- 3. storage ----------
say "3/5  Uploaded documents"
if [[ -d "$STORAGE_ROOT" ]]; then
  tar czf "$DEST/storage.tar.gz" -C "$STORAGE_ROOT" .
  echo "    ✓ $(du -h "$DEST/storage.tar.gz" | cut -f1)"
else
  warn "STORAGE_ROOT missing at $STORAGE_ROOT — the reader would have no source files!"
fi

# ---------- 4. env ----------
say "4/5  Config"
cp "$ENV_FILE" "$DEST/env.backup"; chmod 600 "$DEST/env.backup"
echo "    ✓ env.backup (contains GEMINI_API_KEY + Mongo password — keep this USB on you)"

# ---------- 5. manifest ----------
say "5/5  Manifest"
cat > "$DEST/MANIFEST.txt" <<EOF
NeuroPal travel pack
created       : $(date '+%Y-%m-%d %H:%M:%S')
from          : $(hostname)
repo          : $REPO
storage root  : $STORAGE_ROOT
mongo db      : $MONGO_DB
documents     : $DOC_COUNT
notes         : $NOTE_COUNT
qdrant points : ${PTS_MANIFEST:-none}

Restore:  ./scripts/unpack-on-laptop.sh <this-folder>
Verify after restore: documents/notes/points must match the numbers above.
EOF
cat "$DEST/MANIFEST.txt"
sync
say "DONE — $(du -sh "$DEST" | cut -f1) at $DEST"
echo "Eject: diskutil eject /Volumes/<USB>"

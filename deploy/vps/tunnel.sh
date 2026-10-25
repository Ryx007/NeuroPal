#!/usr/bin/env bash
# Publish the API at https://<hostname> through a Cloudflare Tunnel.
#
#   ./tunnel.sh                       # hostname defaults to api.ryx007.work
#   ./tunnel.sh api.example.com
#
# First run prints a Cloudflare login link: open it, pick the domain, click
# Authorize. Then the tunnel is created, the DNS record added, and
# cloudflared/config.yml written. Safe to re-run.
# No port on this server is opened — cloudflared dials OUT to Cloudflare.
set -euo pipefail
cd "$(dirname "$0")"

HOST="${1:-api.ryx007.work}"
NAME="neuropal-api"
IMAGE="cloudflare/cloudflared:2026.10.3"
DIR="$PWD/cloudflared"
# The account-wide login cert can manage every tunnel and DNS record in the
# zone, so it lives OUTSIDE the folder the running container mounts.
ADMIN="/root/.neuropal-cloudflared"

mkdir -p "$DIR" "$ADMIN"
# the image runs as the unprivileged user 65532; the admin folder is root's
chown 65532:65532 "$DIR"
chmod 700 "$DIR" "$ADMIN"
# bring a cert from an interrupted earlier run back for the management steps
[ -f "$ADMIN/cert.pem" ] && [ ! -f "$DIR/cert.pem" ] && mv "$ADMIN/cert.pem" "$DIR/cert.pem"

cf() { docker run --rm -v "$DIR:/home/nonroot/.cloudflared" "$IMAGE" "$@"; }

if [ ! -f "$DIR/cert.pem" ]; then
    echo "Open the link below, choose the domain for $HOST, and click Authorize:"
    cf tunnel login
fi

if ! ls "$DIR"/*.json >/dev/null 2>&1; then
    # a tunnel of that name may already exist in the account (from another
    # machine) — its credentials aren't here, so pick a free name instead
    created=""
    for n in "$NAME" "$NAME-2" "$NAME-3" "$NAME-4"; do
        if cf tunnel create "$n"; then created="$n"; break; fi
    done
    [ -n "$created" ] || { echo "tunnel: could not create a tunnel (see the errors above)" >&2; exit 1; }
fi
TUNNEL_ID="$(basename "$(ls "$DIR"/*.json | head -1)" .json)"
echo "tunnel: $TUNNEL_ID"

# Adds a proxied CNAME  $HOST -> <id>.cfargotunnel.com. If the name already
# has a DNS record, this fails loudly — check the record in Cloudflare first.
if ! out="$(cf tunnel route dns "$TUNNEL_ID" "$HOST" 2>&1)"; then
    echo "$out"
    if echo "$out" | grep -qi "already"; then
        echo "tunnel: $HOST already has a DNS record. If it's this tunnel, that's fine; otherwise remove it in Cloudflare and run ./tunnel.sh again." >&2
    else
        exit 1
    fi
else
    echo "$out"
fi

cat > "$DIR/config.yml" <<YAML
tunnel: $TUNNEL_ID
credentials-file: /etc/cloudflared/$TUNNEL_ID.json
ingress:
  - hostname: $HOST
    service: http://api:4000
    originRequest:
      connectTimeout: 30s
  - service: http_status:404
YAML
chown 65532:65532 "$DIR/config.yml"
chmod 600 "$DIR"/*
# the login cert leaves the mounted folder
[ -f "$DIR/cert.pem" ] && mv "$DIR/cert.pem" "$ADMIN/cert.pem" && chmod 600 "$ADMIN/cert.pem"

# from now on every `docker compose …` here includes the tunnel
grep -q '^COMPOSE_PROFILES=' .env || printf 'COMPOSE_PROFILES=tunnel\n' >> .env
docker compose --profile tunnel up -d cloudflared
echo "Done. In a minute: curl https://$HOST/healthz"

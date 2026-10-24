#!/usr/bin/env bash
# NeuroPal VPS bootstrap — safe to run again (it never overwrites a secret).
#
#   cd /opt/neuropal/deploy/vps && ./bootstrap.sh
#
# 1. checks Docker + the compose plugin (it does NOT install them: the server
#    is shared, so installing system packages is a deliberate separate step)
# 2. writes ./.env with fresh random secrets for anything missing
# 3. asks for the Gemini key if it's empty (hidden input; skipped when not
#    interactive)
# 4. builds and starts the stack (no host ports — see docker-compose.yml)
# The Cloudflare Tunnel is set up separately: ./tunnel.sh
set -euo pipefail
cd "$(dirname "$0")"

die() { echo "bootstrap: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "Docker is not installed (https://docs.docker.com/engine/install/)"
docker compose version >/dev/null 2>&1 || die "the Docker compose plugin is missing (apt install docker-compose-plugin)"
command -v openssl >/dev/null 2>&1 || die "openssl is missing"

umask 077
touch .env
chmod 600 .env

# Add KEY=VALUE only if KEY isn't in .env yet.
ensure() {
    local key="$1" value="$2"
    if ! grep -q "^${key}=" .env; then
        printf '%s=%s\n' "$key" "$value" >> .env
        echo "  + $key"
    fi
}

echo "[1/3] secrets in ./.env"
ensure MONGO_ROOT_USER neuropal
ensure MONGO_ROOT_PASSWORD "$(openssl rand -hex 24)"
ensure MONGO_APP_USER neuropal_app
ensure MONGO_APP_PASSWORD "$(openssl rand -hex 24)"
ensure QDRANT_API_KEY "$(openssl rand -hex 24)"
ensure JWT_SECRET "$(openssl rand -hex 32)"
ensure SIGNUP_MODE invite
# 128 bits: a shared code that never expires must not be guessable
ensure SIGNUP_INVITE_CODE "np-$(openssl rand -hex 16)"
ensure AI_DAILY_LIMIT_PER_USER 150
ensure AI_PROVIDER gemini
ensure GEMINI_API_KEY ""
ensure GEMINI_MODEL gemini-flash-latest
ensure ANTHROPIC_API_KEY ""
ensure ANTHROPIC_MODEL claude-sonnet-4-5
ensure CORS_ORIGINS "https://ryx007.work,https://www.ryx007.work"
ensure APK_PATH ""

if grep -q '^GEMINI_API_KEY=$' .env && [ -t 0 ]; then
    echo
    read -r -s -p "Gemini API key (from aistudio.google.com — input hidden, Enter to skip): " key
    echo
    if [ -n "$key" ]; then
        # replace the empty line in place; the key never touches the shell history
        tmp="$(mktemp)"
        awk -v k="$key" 'BEGIN{done=0} /^GEMINI_API_KEY=$/ && !done {print "GEMINI_API_KEY=" k; done=1; next} {print}' .env > "$tmp"
        cat "$tmp" > .env
        rm -f "$tmp"
        echo "  saved GEMINI_API_KEY"
    fi
fi

mkdir -p backups cloudflared

echo "[2/3] building and starting the stack"
# (the tunnel joins later: ./tunnel.sh enables its compose profile)
docker compose up -d --build

echo "[3/3] waiting for the API"
for i in $(seq 1 60); do
    if docker compose exec -T api node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
        docker compose exec -T api node -e "fetch('http://127.0.0.1:4000/healthz?deps=1').then(r=>r.json()).then(j=>console.log(JSON.stringify(j.deps)))"
        echo
        echo "API is up (inside the private network)."
        echo "Invite code for new accounts: $(grep '^SIGNUP_INVITE_CODE=' .env | cut -d= -f2-)"
        [ -f cloudflared/config.yml ] || echo "Next: ./tunnel.sh to publish it at https://api.ryx007.work"
        exit 0
    fi
    sleep 3
done
docker compose logs --tail=60 api
die "the API did not come up — see the log above"

#!/usr/bin/env bash
# One command to install or update the NeuroPal backend on the VPS, as root,
# from any SSH session (laptop, or a phone SSH app):
#
#   curl -fsSL https://raw.githubusercontent.com/Ryx007/NeuroPal/v2-platform/deploy/vps/install.sh | bash
#
# Clones (or fast-forwards) the repo into /opt/neuropal, then runs
# bootstrap.sh (secrets, Gemini key prompt, build, start) and tunnel.sh
# (Cloudflare link, https://api.ryx007.work). Changes nothing else on the
# server. Needs git and Docker with the compose plugin already installed.
set -euo pipefail

BRANCH="${NEUROPAL_BRANCH:-v2-platform}"
DIR="${NEUROPAL_DIR:-/opt/neuropal}"
REPO="https://github.com/Ryx007/NeuroPal.git"

[ "$(id -u)" = "0" ] || { echo "install: run this as root" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "install: git is not installed (apt install git)" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "install: Docker is not installed — see https://docs.docker.com/engine/install/" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "install: the Docker compose plugin is missing (apt install docker-compose-plugin)" >&2; exit 1; }

if [ -d "$DIR/.git" ]; then
    git -C "$DIR" fetch --quiet origin "$BRANCH"
    git -C "$DIR" checkout --quiet "$BRANCH"
    git -C "$DIR" merge --ff-only --quiet "origin/$BRANCH"
else
    git clone --quiet --branch "$BRANCH" "$REPO" "$DIR"
fi
echo "code: $(git -C "$DIR" log --oneline -1)"

cd "$DIR/deploy/vps"
# piped from curl, stdin is this script — the prompts read the terminal
./bootstrap.sh < /dev/tty
./tunnel.sh < /dev/tty

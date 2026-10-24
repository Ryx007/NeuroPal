#!/usr/bin/env bash
# Copy the VPS's nightly MongoDB dumps to this Mac (an off-server copy).
#   scripts/pull-backup.sh [destination]      default: ~/NeuroPal-backups
set -euo pipefail
DEST="${1:-$HOME/NeuroPal-backups}"
HOST="${NEUROPAL_VPS:-root@161.97.154.212}"
KEY="${NEUROPAL_VPS_KEY:-$HOME/.ssh/neuropal_vps}"
mkdir -p "$DEST"
rsync -av -e "ssh -i $KEY -o IdentitiesOnly=yes" "$HOST:/opt/neuropal/deploy/vps/backups/" "$DEST/"
echo "Backups are in $DEST"

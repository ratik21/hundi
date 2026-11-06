#!/usr/bin/env bash
# Starts the relayer behind a public tunnel, then points the live app at it.
# Run this again if the laptop slept or the network changed. Testnet only.
set -euo pipefail
cd "$(dirname "$0")/.."
LOGS="${TMPDIR:-/tmp}/hundi-relayer"
mkdir -p "$LOGS"

pkill -f "apps/relayer/src/index.ts" || true
pkill -f "cloudflared tunnel --no-autoupdate --url http://localhost:8787" || true

nohup caffeinate -i bun apps/relayer/src/index.ts >"$LOGS/relayer.log" 2>&1 &
nohup cloudflared tunnel --no-autoupdate --url http://localhost:8787 >"$LOGS/tunnel.log" 2>&1 &

url=""
for _ in $(seq 1 30); do
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/tunnel.log" | head -1 || true)
  [ -n "$url" ] && break
  sleep 1
done
[ -n "$url" ] || { echo "The tunnel did not start. See $LOGS/tunnel.log"; exit 1; }

echo "$url" >apps/pwa/public/relayer.txt
~/.local/bin/mb-heavy bun run build >/dev/null
vercel deploy apps/pwa/dist --prod --yes --project hundi >/dev/null 2>&1
echo "Relayer live at $url"

#!/usr/bin/env bash
# Bundles the relayer into one file and deploys it as a Vercel function.
# Set RELAYER_PRIVATE_KEY and RPC_1874 on the Vercel project first. Testnet only.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=.relayer-deploy
mkdir -p "$OUT/api"
bun build apps/relayer/src/vercel.ts --target=node --format=esm --outfile="$OUT/api/submit.js"
echo '{ "type": "module" }' >"$OUT/package.json"
printf ".env*\n" >"$OUT/.vercelignore"
vercel deploy "$OUT" --prod --yes --project hundi-relayer

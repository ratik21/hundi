#!/usr/bin/env bash
# Runs three wallets and the chai shop against a local fork, with hot reload.
# Usage: bun run lab [--ios]. With --ios, it opens the wallets in the iOS Simulator.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.foundry/bin:$PATH"
mkdir -p .lab

for port in 8599 5190 5191 5192 5193 5194; do
  lsof -ti "tcp:$port" -s tcp:listen | xargs kill 2>/dev/null || true
done

nohup anvil --port 8599 --fork-url https://rpc.testnet.whitechain.io/ --hardfork osaka --silent >.lab/anvil.log 2>&1 &
nohup bun scripts/lab/relay.ts >.lab/relay.log 2>&1 &

export VITE_LAB_URL=http://localhost:5190
export VITE_RPC_URL=http://localhost:8599
export VITE_RELAYER_FILE=/no-relayer.txt
for port in 5191 5192 5193; do
  (cd apps/pwa && exec nohup bunx vite --port "$port" --strictPort --host) >".lab/wallet-$port.log" 2>&1 &
done
(cd apps/shop && exec nohup bunx vite --port 5194 --strictPort --host) >.lab/shop.log 2>&1 &

for _ in $(seq 1 60); do
  cast chain-id --rpc-url http://127.0.0.1:8599 >/dev/null 2>&1 && break
  sleep 1
done

if [ "${1:-}" = "--ios" ]; then
  device=$(xcrun simctl list devices available | grep -m1 'iPhone 17 Pro (' | grep -oE '[0-9A-F-]{36}')
  xcrun simctl boot "$device" 2>/dev/null || true
  open -a Simulator
  xcrun simctl bootstatus "$device" -b >/dev/null
  for port in 5191 5192 5193; do
    xcrun simctl openurl "$device" "http://localhost:$port/"
  done
fi

echo "Customer http://localhost:5191"
echo "Stall    http://localhost:5192"
echo "Supplier http://localhost:5193"
echo "Shop     http://localhost:5194"

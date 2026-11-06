#!/usr/bin/env bash
# Runs three wallets and the chai shop against a local fork, with hot reload.
# Usage: bun run lab [--ios] [--testnet].
# --ios opens each wallet in its own iOS Simulator.
# --testnet uses the real Whitechain testnet and spends test funds from the relayer account.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.foundry/bin:$PATH"
mkdir -p .lab

for port in 8599 5190 5191 5192 5193 5194; do
  lsof -ti "tcp:$port" -s tcp:listen | xargs kill 2>/dev/null || true
done

TESTNET=""
IOS=""
for arg in "$@"; do
  [ "$arg" = "--testnet" ] && TESTNET=1
  [ "$arg" = "--ios" ] && IOS=1
done

export VITE_LAB_URL=http://localhost:5190
export VITE_RELAYER_FILE=/no-relayer.txt
if [ -n "$TESTNET" ]; then
  export LAB_TESTNET=1
  export VITE_RELAYER_URL=http://localhost:8787
else
  nohup anvil --port 8599 --fork-url https://rpc.testnet.whitechain.io/ --hardfork osaka --silent >.lab/anvil.log 2>&1 &
  export VITE_RPC_URL=http://localhost:8599
fi
nohup bun scripts/lab/relay.ts >.lab/relay.log 2>&1 &

for port in 5191 5192 5193; do
  (cd apps/pwa && exec nohup bunx vite --port "$port" --strictPort --host) >".lab/wallet-$port.log" 2>&1 &
done
(cd apps/shop && exec nohup bunx vite --port 5194 --strictPort --host) >.lab/shop.log 2>&1 &

if [ -z "$TESTNET" ]; then
  for _ in $(seq 1 60); do
    cast chain-id --rpc-url http://127.0.0.1:8599 >/dev/null 2>&1 && break
    sleep 1
  done
fi

if [ -n "$IOS" ]; then
  port=5191
  for name in "iPhone 17 Pro" "iPhone 17e" "iPhone Air"; do
    device=$(xcrun simctl list devices available | grep -m1 "$name (" | grep -oE '[0-9A-F-]{36}')
    xcrun simctl boot "$device" 2>/dev/null || true
    xcrun simctl bootstatus "$device" -b >/dev/null
    xcrun simctl openurl "$device" "http://localhost:$port/"
    port=$((port + 1))
  done
  open -a Simulator
fi

echo "Customer http://localhost:5191"
echo "Stall    http://localhost:5192"
echo "Supplier http://localhost:5193"
echo "Shop     http://localhost:5194"

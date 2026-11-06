#!/usr/bin/env bash
# Opens one URL per iOS Simulator, and fails loudly if any stays on its home screen.
# Usage: scripts/lab/sims.sh <customer url> <stall url> <supplier url>
set -euo pipefail

NAMES=("iPhone 17 Pro" "iPhone 17e" "iPhone Air")
ATTEMPTS=8
RETRY_SECONDS=5

device_of() {
  xcrun simctl list devices available | grep -m1 "$1 (" | grep -oE '[0-9A-F-]{36}'
}

safari_running() {
  xcrun simctl spawn "$1" launchctl list 2>/dev/null | grep -q "UIKitApplication:com.apple.mobilesafari"
}

# openurl times out while a just-booted device settles, so the check is Safari itself.
open_on() {
  for _ in $(seq 1 "$ATTEMPTS"); do
    xcrun simctl openurl "$1" "$2" 2>/dev/null || true
    sleep 1
    safari_running "$1" && return 0
    sleep "$RETRY_SECONDS"
  done
  return 1
}

for name in "${NAMES[@]}"; do
  xcrun simctl boot "$(device_of "$name")" 2>/dev/null || true
done
for name in "${NAMES[@]}"; do
  xcrun simctl bootstatus "$(device_of "$name")" -b >/dev/null
done
open -a Simulator

index=0
for url in "$@"; do
  name=${NAMES[$index]}
  if open_on "$(device_of "$name")" "$url"; then
    echo "$name opened $url"
  else
    echo "$name never opened $url" >&2
    exit 1
  fi
  index=$((index + 1))
done

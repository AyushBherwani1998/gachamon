#!/usr/bin/env bash
# Fetch a fresh TSLA/USD price update from Pyth Hermes and print shell exports:
#
#   source <(script/pyth-update.sh)
#   MONAD_RPC=https://rpc.monad.xyz forge test --match-test test_Fork_FullPull -vv
#
# Requires PYTH_API_KEY in the environment. The key is server-side only: never put it
# in browser code or a NEXT_PUBLIC_* variable.
#
# Optional: PYTH_HERMES_URL (default https://pyth.dourolabs.app/hermes)
set -euo pipefail

if [[ -z "${PYTH_API_KEY:-}" ]]; then
  echo "PYTH_API_KEY is not set" >&2
  exit 1
fi

FEED_ID="${PYTH_FEED_ID:-0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1}" # Equity.US.TSLA/USD
HERMES_URL="${PYTH_HERMES_URL:-https://pyth.dourolabs.app/hermes}"

RESPONSE="$(
  curl -sS --fail-with-body \
    -H "Authorization: Bearer ${PYTH_API_KEY}" \
    "${HERMES_URL}/v2/updates/price/latest?ids[]=${FEED_ID}&encoding=hex&parsed=true"
)"

RESPONSE="$RESPONSE" python3 - <<'PY'
import json
import os
import sys

response = json.loads(os.environ["RESPONSE"])
updates = response["binary"]["data"]
if not updates:
    sys.exit("Hermes returned no binary update data")

# priceUpdateData is a bytes[]; our fork tests use the first (TSLA) update.
update = updates[0]
if not update.startswith("0x"):
    update = "0x" + update

parsed = response["parsed"]
if not parsed:
    sys.exit("Hermes returned no parsed price data")

publish_time = parsed[0]["price"]["publish_time"]

print(f"PYTH_UPDATE_HEX={update}")
print(f"PYTH_PUBLISH_TIME={publish_time}")
PY

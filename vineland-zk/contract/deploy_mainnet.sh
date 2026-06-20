#!/usr/bin/env bash
# Deploy the Vineland ZK verifier to Stellar MAINNET and verify the mandate_sd proof.
#
# ⚠️  REAL MONEY. NOT run automatically. Requires:
#   1. A funded mainnet Stellar account (a few XLM for fees + rent).
#   2. That account configured as a stellar-cli identity (its name in MAINNET_IDENT).
#   3. Explicit operator intent: set VINELAND_MAINNET_GO=1 to arm it.
#
# BN254 host functions are live on mainnet since Protocol 25 (X-Ray, Feb 2026),
# so the verify is expected to cost ~44.6M instructions (measured on localnet).
# This is UNAUDITED. Do not protect real funds with it.
#
# Usage:  MAINNET_IDENT=<your-funded-key> VINELAND_MAINNET_GO=1 ./deploy_mainnet.sh
set -euo pipefail
cd "$(dirname "$0")"

: "${MAINNET_IDENT:?set MAINNET_IDENT to a funded mainnet stellar-cli identity}"
if [ "${VINELAND_MAINNET_GO:-0}" != "1" ]; then
  echo "Refusing to deploy to mainnet without VINELAND_MAINNET_GO=1 (real money)."; exit 1
fi

stellar network add mainnet \
  --rpc-url https://mainnet.sorobanrpc.com \
  --network-passphrase "Public Global Stellar Network ; September 2015" 2>/dev/null || true

stellar contract build
CID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/vineland_zk_verifier.wasm \
  --source "$MAINNET_IDENT" --network mainnet)
echo "MAINNET_CONTRACT_ID=$CID"

python3 - "$CID" "$MAINNET_IDENT" "../build_sd/invoke_args.json" <<'PY'
import json, sys, subprocess
cid, ident, argsf = sys.argv[1], sys.argv[2], sys.argv[3]
a = json.load(open(argsf))
jarr = lambda l: "[" + ",".join(f'"{x}"' for x in l) + "]"
cmd = ["stellar","contract","invoke","--id",cid,"--source",ident,
       "--network","mainnet","--send","yes","--","verify",
       "--alpha",a["alpha"],"--beta",a["beta"],"--gamma",a["gamma"],"--delta",a["delta"],
       "--ic",jarr(a["ic"]),"--a",a["a"],"--b",a["b"],"--c",a["c"],"--pubs",jarr(a["pubs"])]
subprocess.run(cmd, check=True)
PY

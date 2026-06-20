#!/usr/bin/env bash
# Deploy the Vineland ZK verifier to Stellar TESTNET and verify the mandate_sd proof.
# Free (friendbot-funded). Reproduces the live testnet artifact.
set -euo pipefail
cd "$(dirname "$0")"

IDENT="${IDENT:-vinelandzk}"
ARGS="../build_sd/invoke_args.json"

stellar contract build
stellar keys generate "$IDENT" --network testnet 2>/dev/null || true
stellar keys fund "$IDENT" --network testnet 2>/dev/null || true

CID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/vineland_zk_verifier.wasm \
  --source "$IDENT" --network testnet)
echo "CONTRACT_ID=$CID"

# assemble + run the verify invoke from the snarkjs artifacts
python3 - "$CID" "$ARGS" <<'PY'
import json, sys, subprocess
cid, argsf = sys.argv[1], sys.argv[2]
a = json.load(open(argsf))
jarr = lambda l: "[" + ",".join(f'"{x}"' for x in l) + "]"
cmd = ["stellar","contract","invoke","--id",cid,"--source","vinelandzk",
       "--network","testnet","--send","yes","--","verify",
       "--alpha",a["alpha"],"--beta",a["beta"],"--gamma",a["gamma"],"--delta",a["delta"],
       "--ic",jarr(a["ic"]),"--a",a["a"],"--b",a["b"],"--c",a["c"],"--pubs",jarr(a["pubs"])]
subprocess.run(cmd, check=True)
PY

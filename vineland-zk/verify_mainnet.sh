#!/usr/bin/env bash
# Simulate the LIVE mainnet verifier against a generated proof. SIMULATION ONLY
# (--send no): no transaction, no XLM cost. Proves the live contract accepts the
# proof in build_real/ (or a dir passed as $1).
set -euo pipefail
cd "$(dirname "$0")"

DIR="${1:-build_real}"
MAINNET_ID="CBDS2YSLATINQVUDG5Y5HV4KQBEAVFDRPEINVEUTYSX3CZZQKBY5U3FE"
SOURCE="${SOURCE:-vineland-mainnet-deployer}"

python3 - "$MAINNET_ID" "$DIR/invoke_args.json" "$SOURCE" <<'PY'
import json, sys, subprocess
cid, argsf, src = sys.argv[1], sys.argv[2], sys.argv[3]
a = json.load(open(argsf))
jarr = lambda l: "[" + ",".join(f'"{x}"' for x in l) + "]"
cmd = ["stellar","contract","invoke","--id",cid,"--source",src,
       "--network","mainnet","--send","no","--","verify",
       "--alpha",a["alpha"],"--beta",a["beta"],"--gamma",a["gamma"],"--delta",a["delta"],
       "--ic",jarr(a["ic"]),"--a",a["a"],"--b",a["b"],"--c",a["c"],"--pubs",jarr(a["pubs"])]
r = subprocess.run(cmd, capture_output=True, text=True)
print("mainnet verify (simulation):", r.stdout.strip() or r.stderr.strip()[-400:])
sys.exit(r.returncode)
PY

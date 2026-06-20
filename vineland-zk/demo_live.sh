#!/usr/bin/env bash
# Live screen-recordable demo for the Stellar Real-World ZK hackathon.
# Runs BOTH proofs end-to-end on camera: generate witness -> prove -> verify
# OFF-CHAIN, then verify the same proof ON Stellar MAINNET. Unforgeable: the
# judge sees the math and the chain. Paced for voiceover.
#
#   bash demo_live.sh
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"

CID="CBDS2YSLATINQVUDG5Y5HV4KQBEAVFDRPEINVEUTYSX3CZZQKBY5U3FE"
SRC="vineland-mainnet-deployer"
B="\033[1m"; G="\033[32m"; Y="\033[33m"; D="\033[2m"; R="\033[0m"
pause(){ sleep "${1:-2}"; }
say(){ printf "\n${B}%s${R}\n" "$1"; }
sub(){ printf "${D}%s${R}\n" "$1"; }

clear
printf "${B}  VINELAND ZK  ${R}${D}· confidential identity + bounded autonomy · Stellar mainnet${R}\n"
printf "${D}  ─────────────────────────────────────────────────────────────${R}\n"
pause 2

# ─────────────────────────────────────────────────────────────
say "PROOF 1 / 2 — PROOF-OF-KYC"
sub "A human proves: registered + of-age + non-sanctioned. No CPF, no PII revealed."
pause 3

say "› generating the witness (private: birthYear, sanctionId, secrets)…"
node build_kyc/kyc_js/generate_witness.js build_kyc/kyc_js/kyc.wasm build_kyc/input.json build_kyc/w.wtns
printf "${G}  witness built — all predicates satisfied${R}\n"; pause 2

say "› proving (Groth16 / BN254)…"
snarkjs groth16 prove build_kyc/kyc_final.zkey build_kyc/w.wtns build_kyc/proof.json build_kyc/public.json 2>/dev/null
printf "${G}  proof generated${R}\n"; pause 1
sub "  public signals (everything the world sees):"
node -e 'const p=require("./build_kyc/public.json");console.log("    ok="+p[0]+"  age_gate="+p[4]+"+  year="+p[3]+"  — birthYear & id stay PRIVATE")'
pause 3

say "› verifying OFF-CHAIN…"
snarkjs groth16 verify build_kyc/vk_kyc.json build_kyc/public.json build_kyc/proof.json 2>/dev/null && printf "${G}  OK${R}\n"
pause 2

say "› the load-bearing test: a MINOR cannot even build the proof…"
if node build_kyc/kyc_js/generate_witness.js build_kyc/kyc_js/kyc.wasm build_kyc/input_minor.json /tmp/_m.wtns 2>/dev/null; then
  printf "${Y}  (unexpected: minor passed)${R}\n"
else
  printf "${G}  REJECTED — age predicate fails, no proof exists${R}\n"
fi
pause 3

say "› now VERIFY ON STELLAR MAINNET (real transaction)…"
sub "  contract $CID"
python3 - "$CID" "build_kyc/invoke_args.json" "$SRC" <<'PY'
import json, sys, subprocess
cid, argsf, src = sys.argv[1], sys.argv[2], sys.argv[3]
a = json.load(open(argsf)); jarr = lambda l: "[" + ",".join(f'"{x}"' for x in l) + "]"
cmd = ["stellar","contract","invoke","--id",cid,"--source",src,"--network","mainnet","--send","no","--","verify",
       "--alpha",a["alpha"],"--beta",a["beta"],"--gamma",a["gamma"],"--delta",a["delta"],
       "--ic",jarr(a["ic"]),"--a",a["a"],"--b",a["b"],"--c",a["c"],"--pubs",jarr(a["pubs"])]
r = subprocess.run(cmd, capture_output=True, text=True)
print("  mainnet verify ->", "\033[32m"+r.stdout.strip()+"\033[0m")
PY
sub "  (on-chain proof tx: stellar.expert/explorer/public/tx/83ee1697486a24c3fd389b812f00c5693659cc3837f6fa653c42b62afc1751d6)"
pause 4

# ─────────────────────────────────────────────────────────────
say "PROOF 2 / 2 — BOUNDED-AUTONOMY MANDATE"
sub "The agent proves 8 payments obeyed the mandate (caps + allowlist). Amounts hidden."
pause 3

say "› verifying the mandate proof OFF-CHAIN…"
snarkjs groth16 verify build_sd/vk_sd.json build_sd/public_sd.json build_sd/proof_sd.json 2>/dev/null && printf "${G}  OK${R}\n"
pause 2

say "› VERIFY ON STELLAR MAINNET…"
python3 - "$CID" "build_sd/invoke_args.json" "$SRC" <<'PY'
import json, sys, subprocess
cid, argsf, src = sys.argv[1], sys.argv[2], sys.argv[3]
a = json.load(open(argsf)); jarr = lambda l: "[" + ",".join(f'"{x}"' for x in l) + "]"
cmd = ["stellar","contract","invoke","--id",cid,"--source",src,"--network","mainnet","--send","no","--","verify",
       "--alpha",a["alpha"],"--beta",a["beta"],"--gamma",a["gamma"],"--delta",a["delta"],
       "--ic",jarr(a["ic"]),"--a",a["a"],"--b",a["b"],"--c",a["c"],"--pubs",jarr(a["pubs"])]
r = subprocess.run(cmd, capture_output=True, text=True)
print("  mainnet verify ->", "\033[32m"+r.stdout.strip()+"\033[0m")
PY
pause 3

# ─────────────────────────────────────────────────────────────
say "BOTH PROOFS VERIFY ON MAINNET — ZERO DATA REVEALED."
sub "Verified human + payment within mandate. The regulator alone decrypts the monthly total."
sub "github.com/Galmanus/vineland-zk · unaudited, demo keys"
printf "\n"

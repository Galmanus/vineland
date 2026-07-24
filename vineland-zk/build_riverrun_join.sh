#!/usr/bin/env bash
# riverrun KYC-gated join — compile, trusted setup, prove, verify.
# Proves a member is registered + of-age + non-sanctioned + bound to a pool
# (external nullifier), revealing no PII. Groth16/BN128 (compliance layer, not PQ).
set -euo pipefail
cd "$(dirname "$0")"
CIRCOM="${CIRCOM:-$HOME/.cargo/bin/circom}"   # circom 2 (Rust), not the JS circom 1
PTAU="${PTAU:-pot_bn.ptau}"                    # a BN128 powers-of-tau
B=build_riverrun_join
mkdir -p "$B"
"$CIRCOM" circuits/riverrun_join.circom --r1cs --wasm --sym -o "$B" -l node_modules
snarkjs groth16 setup "$B/riverrun_join.r1cs" "$PTAU" "$B/rj_0000.zkey"
snarkjs zkey contribute "$B/rj_0000.zkey" "$B/rj_final.zkey" --name=riverrun -e="$RANDOM$RANDOM"
snarkjs zkey export verificationkey "$B/rj_final.zkey" "$B/vk.json"
node "$B/riverrun_join_js/generate_witness.js" "$B/riverrun_join_js/riverrun_join.wasm" "$B/input.json" "$B/w.wtns"
snarkjs groth16 prove "$B/rj_final.zkey" "$B/w.wtns" "$B/proof.json" "$B/public.json"
snarkjs groth16 verify "$B/vk.json" "$B/public.json" "$B/proof.json"

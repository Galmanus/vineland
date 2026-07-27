#!/usr/bin/env bash
# The first real integration of riverrun-id-wasm and riverrun-nullifier-registry:
# a minimal anonymous vote, run against the live Stellar testnet contract, not a
# simulation.
#
# What this proves: three distinct riverrun ID holders each derive their own
# fit() for one vote round (angle) and cast exactly one vote each, on-chain,
# unlinkably (no wallet address ever appears in the registry's storage or
# events). A holder who tries to vote twice in the same round is rejected by
# the contract itself. The same holder CAN vote again in a different round
# (angle), with a fit indistinguishable from a stranger's, because rounds are
# domain-separated.
#
# What this does NOT prove (named honestly, matching riverrun-nullifier-
# registry's README): that the three holders were members of any registered
# "eligible voter" set. The registry checks uniqueness of (angle, fit), not
# validity, i.e. it stops double-voting but not sybils, until check_turn's
# proof backend gates submit_fit. This demo is the nullifier half of an
# anonymous vote, not the membership half.
#
# Prereqs: stellar-cli, a funded testnet identity (STELLAR_SOURCE, default
# riverrun-registry-deployer), and this repo's riverrun-id-wasm example built
# (cargo build --release --example fit, run automatically below if missing).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONTRACT_ID="${CONTRACT_ID:-CCHUXEFY3IUGYLFRCFYVAL3VLPJELUUHAYZO7ZCZFXL3A4VOKK6Z57ZO}"
NETWORK="${NETWORK:-testnet}"
SOURCE="${STELLAR_SOURCE:-riverrun-registry-deployer}"
VOTE_ROUND="${VOTE_ROUND:-9001}"
FIT_BIN="$ROOT/riverrun-id-wasm/target/release/examples/fit"

if [ ! -x "$FIT_BIN" ]; then
  echo "=== building riverrun-id-wasm's fit example ==="
  (cd "$ROOT/riverrun-id-wasm" && cargo build --release --example fit)
fi

rand_secret() { python3 -c "import secrets; print(secrets.token_hex(32))"; }
fit_of() { "$FIT_BIN" "$1" "$2"; }

invoke() {
  stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE" --network "$NETWORK" -- "$@"
}

echo "=== round (angle) = $VOTE_ROUND, contract = $CONTRACT_ID, network = $NETWORK ==="
echo

ALICE=$(rand_secret)
BOB=$(rand_secret)
CAROL=$(rand_secret)

FIT_ALICE=$(fit_of "$ALICE" "$VOTE_ROUND")
FIT_BOB=$(fit_of "$BOB" "$VOTE_ROUND")
FIT_CAROL=$(fit_of "$CAROL" "$VOTE_ROUND")

echo "alice's vote token (fit):  $FIT_ALICE"
echo "bob's vote token (fit):    $FIT_BOB"
echo "carol's vote token (fit):  $FIT_CAROL"
echo

echo "=== three holders cast one vote each, on-chain ==="
for name_fit in "alice:$FIT_ALICE" "bob:$FIT_BOB" "carol:$FIT_CAROL"; do
  name="${name_fit%%:*}"
  fit="${name_fit##*:}"
  echo "--- $name votes ---"
  invoke submit_fit --angle "$VOTE_ROUND" --fit "$fit" | tail -3
done
echo

echo "=== all three votes are now recorded ==="
for name_fit in "alice:$FIT_ALICE" "bob:$FIT_BOB" "carol:$FIT_CAROL"; do
  name="${name_fit%%:*}"
  fit="${name_fit##*:}"
  spent=$(invoke is_spent --angle "$VOTE_ROUND" --fit "$fit" | tail -1)
  echo "$name is_spent = $spent"
done
echo

echo "=== alice tries to vote twice in the same round: must fail ==="
# Capture output first; under pipefail, piping straight into grep would make
# the pipeline's exit status reflect invoke's failure even when grep matches,
# since pipefail reports the rightmost NON-ZERO exit among all stages, not
# grep's own. Capturing avoids that trap entirely.
DOUBLE_VOTE_OUTPUT="$(invoke submit_fit --angle "$VOTE_ROUND" --fit "$FIT_ALICE" 2>&1 || true)"
if echo "$DOUBLE_VOTE_OUTPUT" | grep -q "Error(Contract, #1)"; then
  echo "REJECTED as expected: Error(Contract, #1) = AlreadySpent"
else
  echo "UNEXPECTED: double vote was not rejected" >&2
  echo "$DOUBLE_VOTE_OUTPUT" >&2
  exit 1
fi
echo

NEXT_ROUND=$((VOTE_ROUND + 1))
echo "=== alice votes again in a NEW round ($NEXT_ROUND): allowed, and unlinkable ==="
FIT_ALICE_NEXT=$(fit_of "$ALICE" "$NEXT_ROUND")
echo "alice's vote token in round $NEXT_ROUND: $FIT_ALICE_NEXT"
if [ "$FIT_ALICE_NEXT" = "$FIT_ALICE" ]; then
  echo "UNEXPECTED: fit repeated across rounds, unlinkability broken" >&2
  exit 1
fi
echo "(differs from round $VOTE_ROUND's token, as riverrun ID's domain separation guarantees)"
invoke submit_fit --angle "$NEXT_ROUND" --fit "$FIT_ALICE_NEXT" | tail -3
echo
echo "=== demo complete: one nullifier per (holder, round), enforced on live testnet ==="

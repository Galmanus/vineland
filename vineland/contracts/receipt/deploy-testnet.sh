#!/usr/bin/env bash
# Deploy vineland-receipt contract to Stellar testnet.
# Mirror of contracts/smart-wallet/deploy-testnet.sh — same conventions so
# the listener/backend can locate the deployed wasm hash via .testnet-deploy.env.
#
# Prereq:
#   stellar-cli installed (cargo install --locked stellar-cli)
#   rustup target add wasm32v1-none
#   cd contracts/receipt/
#
# Output:
#   .testnet-deploy.env  (CONTRACT_ID + WASM_HASH for vineland backend integration)
#
# This is the receipt/attestation ledger: a single shared contract instance
# holds many mandates (keyed by mandate_id). Unlike smart-wallet, there is no
# per-user instance — one deployed instance serves all mandates.

set -euo pipefail

CONTRACT_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK="${NETWORK:-testnet}"
DEPLOYER_NAME="${DEPLOYER_NAME:-vineland-deployer}"

cd "$CONTRACT_DIR"

echo "=== build (wasm32v1-none, release) ==="
cargo build --target wasm32v1-none --release
WASM_PATH="$CONTRACT_DIR/target/wasm32v1-none/release/vineland_receipt.wasm"
ls -la "$WASM_PATH"

echo "=== ensure deployer keypair (testnet) ==="
if ! stellar keys ls 2>/dev/null | grep -q "^${DEPLOYER_NAME}$"; then
  stellar keys generate --global "$DEPLOYER_NAME" --network "$NETWORK" --fund
fi
DEPLOYER_PUB=$(stellar keys address "$DEPLOYER_NAME")
echo "deployer: $DEPLOYER_PUB"

echo "=== upload wasm ==="
WASM_HASH=$(stellar contract upload \
  --network "$NETWORK" \
  --source "$DEPLOYER_NAME" \
  --wasm "$WASM_PATH" 2>&1 | tail -1)
echo "WASM_HASH=$WASM_HASH"

echo "=== deploy instance ==="
CONTRACT_ID=$(stellar contract deploy \
  --network "$NETWORK" \
  --source "$DEPLOYER_NAME" \
  --wasm "$WASM_PATH" 2>&1 | tail -1)
echo "CONTRACT_ID=$CONTRACT_ID"

echo "=== persist for backend / frontend integration ==="
cat > "$CONTRACT_DIR/.testnet-deploy.env" <<EOF
VINELAND_RECEIPT_TESTNET=$CONTRACT_ID
VINELAND_RECEIPT_WASM_HASH_TESTNET=$WASM_HASH
VINELAND_RECEIPT_DEPLOYER_PUB=$DEPLOYER_PUB
VINELAND_RECEIPT_DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
VINELAND_RECEIPT_VERSION=v0.1
EOF
echo "wrote $CONTRACT_DIR/.testnet-deploy.env"

echo
echo "=== DONE ==="
echo "receipt contract: $CONTRACT_ID"
echo "wasm hash:        $WASM_HASH"
echo "stellar.expert:   https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID"

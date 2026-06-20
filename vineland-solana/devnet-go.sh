#!/usr/bin/env bash
# One-shot devnet bring-up for the Solana e2e. Needs a DEDICATED rpc (the public
# api.devnet.solana.com rate-limits a 226KB deploy to death). Pass it via RPC=.
#
#   RPC='https://devnet.helius-rpc.com/?api-key=XXXX' ./devnet-go.sh
#
# Does: deploy the program -> create a test USDC mint -> create platform +
# merchant USDC ATAs -> print the values to paste into apps/web/.env.devnet.
# The buyer (LazorKit smart wallet) is funded AFTER connecting in the browser
# (its address is only known then).
set -euo pipefail

RPC="${RPC:?set RPC=<dedicated devnet rpc url>}"
BIN="$HOME/.local/share/solana/install/active_release/bin/solana"     # 4.0.2
KEYGEN="$HOME/.local/share/solana/install/active_release/bin/solana-keygen"
PROGRAM_ID="VhvqPBz1qJ1sKEY5tAzsWcyNkFP5GLRjZa8j4eGA8n8"
PLATFORM="F9neSDGmb6tyPtuSFp4we2zvFA5WAaQYuFjBbagzmvTK"   # deployer = platform fee receiver
cd "$(dirname "$0")"

echo "CLI: $($BIN --version)"
echo "RPC: $RPC"
echo "balance: $($BIN balance --url "$RPC")"

echo "== deploy program =="
$BIN program deploy target/deploy/vineland_mandate.so \
  --program-id target/deploy/vineland_mandate-keypair.json \
  --url "$RPC" --with-compute-unit-price 50000 --max-sign-attempts 200 --use-rpc
$BIN program show "$PROGRAM_ID" --url "$RPC" | head -6

echo "== create test USDC mint =="
MINT=$(SOLANA_RPC="$RPC" node scripts/devnet-testmint.cjs create | grep -oE 'MINT=[A-Za-z0-9]+' | head -1 | cut -d= -f2)
[ -n "$MINT" ] || { echo "mint creation failed"; exit 1; }
echo "MINT=$MINT"

echo "== platform USDC ATA =="
MINT="$MINT" SOLANA_RPC="$RPC" node scripts/devnet-testmint.cjs ata "$PLATFORM"

echo "== merchant test wallet + USDC ATA =="
[ -f devnet-merchant.json ] || $KEYGEN new --no-bip39-passphrase -s -o devnet-merchant.json >/dev/null
MERCHANT=$($KEYGEN pubkey devnet-merchant.json)
MINT="$MINT" SOLANA_RPC="$RPC" node scripts/devnet-testmint.cjs ata "$MERCHANT"

echo ""
echo "=================================================================="
echo " paste into apps/web/.env.devnet:"
echo "   VITE_SOLANA_USDC_MINT=$MINT"
echo "   VITE_SOLANA_MERCHANT_ADDRESS=$MERCHANT"
echo " then: cd apps/web && pnpm dev --mode devnet  (connect Face ID)"
echo " after connect, fund the smart wallet:"
echo "   MINT=$MINT SOLANA_RPC='$RPC' node scripts/devnet-testmint.cjs fund <smartWalletAddr> 100"
echo "=================================================================="

#!/usr/bin/env bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd ~/projects/vineland-solana
pkill -f solana-test-validator 2>/dev/null; sleep 1
solana-test-validator -r --ledger /tmp/test-ledger >/tmp/validator.log 2>&1 &
VPID=$!
sleep 10
solana config set --url localhost >/dev/null 2>&1
solana airdrop 100 >/dev/null 2>&1
echo "saldo: $(solana balance)"
anchor build > /tmp/ab.log 2>&1; echo "build exit=$?"
anchor deploy --provider.cluster localnet > /tmp/ad.log 2>&1; echo "deploy exit=$?"; grep -iE "Program Id|Deploy success|Error" /tmp/ad.log | tail -3
echo "=== RUN check.cjs (node puro, sem mocha) ==="
ANCHOR_PROVIDER_URL=http://localhost:8899 ANCHOR_WALLET=$HOME/.config/solana/id.json node tests/check.cjs 2>&1 | tail -20
kill $VPID 2>/dev/null

#!/usr/bin/env bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd ~/projects/vineland-solana
solana-test-validator -r --ledger /tmp/test-ledger >/tmp/validator.log 2>&1 &
VPID=$!
sleep 10
solana config set --url localhost >/dev/null 2>&1
solana airdrop 100 >/dev/null 2>&1
echo "saldo local: $(solana balance 2>&1)"
anchor test --skip-local-validator 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -vE "Compiling|Finished|warning:|^\s*=|note:|-->|^\s*\||^[0-9]+ \|" | tail -45
echo "TEST_EXIT=${PIPESTATUS[0]}"
kill $VPID 2>/dev/null

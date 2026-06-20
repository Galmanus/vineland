#!/usr/bin/env bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd ~/projects/vineland-solana
for p in $(ps -eo pid,args | grep "solana-test-validator" | grep -v grep | awk '{print $1}'); do kill -9 "$p" 2>/dev/null; done
sleep 2; rm -rf /tmp/test-ledger
nohup solana-test-validator -r --ledger /tmp/test-ledger >/tmp/validator.log 2>&1 < /dev/null &
for i in $(seq 1 40); do solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1 && { echo "RPC ready ${i}"; break; }; sleep 2; done
solana config set --url http://127.0.0.1:8899 >/dev/null 2>&1
solana airdrop 100 >/dev/null 2>&1; echo "saldo: $(solana balance)"
anchor deploy --provider.cluster localnet 2>&1 | grep -iE "Program Id|success|Error" | tail -3
echo "=== check.cjs ==="
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=$HOME/.config/solana/id.json timeout 120 node tests/check.cjs 2>&1 | tail -20
for p in $(ps -eo pid,args | grep "solana-test-validator" | grep -v grep | awk '{print $1}'); do kill -9 "$p" 2>/dev/null; done

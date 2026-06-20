#!/usr/bin/env bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd ~/projects/vineland-solana
for i in $(seq 1 90); do command -v avm >/dev/null 2>&1 && break; sleep 20; done
avm install latest && avm use latest
echo "ANCHOR=$(anchor --version 2>&1)"
anchor keys sync 2>&1 | tail -3
echo "===BUILD==="; anchor build 2>&1 | tail -40; echo "BUILD_EXIT=${PIPESTATUS[0]}"
echo "===TEST==="; anchor test 2>&1 | tail -50; echo "TEST_EXIT=${PIPESTATUS[0]}"
echo "===DONE==="

#!/usr/bin/env bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd ~/projects/vineland-solana
avm use 0.31.1 2>&1 | tail -1
echo "ANCHOR=$(anchor --version 2>&1)"
anchor keys sync 2>&1 | tail -3
echo "===BUILD==="; anchor build 2>&1 | tail -45; echo "BUILD_EXIT=${PIPESTATUS[0]}"
echo "===TEST==="; anchor test --skip-deploy 2>&1 | tail -55; echo "TEST_EXIT=${PIPESTATUS[0]}"
echo "===DONE==="

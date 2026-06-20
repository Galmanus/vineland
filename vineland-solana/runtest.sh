#!/usr/bin/env bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd ~/projects/vineland-solana
anchor test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -60
echo "TEST_EXIT=${PIPESTATUS[0]}"

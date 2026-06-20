#!/usr/bin/env bash
# Canonical test entry for vineland-solana.
# - solana CLI 1.0 defaults to surfpool (not installed here) -> force legacy validator
# - Node 22 + ts-mocha breaks on rpc-websockets/uuid ESM interop -> runner is mocha + tsx/cjs
set -e
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")"
pkill -x solana-test-validator 2>/dev/null || true
sleep 1
anchor test --validator legacy "$@"

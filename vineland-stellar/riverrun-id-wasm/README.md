# riverrun-id-wasm

The riverrun ID rotatable-piece identity primitive, proved portable to
`wasm32-unknown-unknown`, the target Soroban (Stellar's smart-contract platform)
compiles contracts to.

## Where this comes from

This is a port of the identity-derivation core of [`riverrun-core`](https://github.com/solanabr/mirror-pool),
the post-quantum anonymity layer built for Solana (Superteam Brasil "Noise" bounty,
2026). The construction, one hash-based secret, a different unlinkable "shape" at
every context, a per-context "fit" nullifier, holder-only rotation, scoped
delegation, selective credentials, is BLAKE3 domain separation over raw bytes.
Nothing in it is Solana-specific. This crate is the first concrete proof of that.

## The claim, and exactly how much of it is proved here

**Claim:** riverrun ID's reasoning structure, the rotatable piece, one secret with
unlimited unlinkable per-context faces, is a chain-agnostic identity primitive.
Stellar's current privacy stack (Confidential Tokens: balance/amount encryption on
a fixed account; Stellar Private Payments: a UTXO-style shielded value pool) each
ship a privacy *application*. Neither ships a reusable, per-context identity
primitive underneath that other contracts could build on, an anonymous DAO vote, a
sybil-resistant airdrop, a KYC-gated pool's participant check without a fixed
account. riverrun ID's shape is exactly that missing primitive.

**Proved here:** the identity math (`commit`, `nullifier`, and the piece's five
direct derivations: `shape`, `fit`, `turn`, `grant`, `credential`) compiles cleanly,
`no_std`, to `wasm32-unknown-unknown`. That is a real, checkable fact:

```bash
cargo build --target wasm32-unknown-unknown --no-default-features --features no_std
# -> target/wasm32-unknown-unknown/debug/libriverrun_id_wasm.rlib
```

7 tests pass natively (determinism, unlinkability across angles, domain separation
between roles, that `turn` and `grant` bind both their arguments).

**Not proved, not claimed:** this is not a Soroban contract. It has no
`soroban-sdk` dependency, no contract entrypoint, no on-chain nullifier registry, no
integration with Confidential Tokens or Stellar Private Payments. It is the
portable math, with a real compile target as evidence, not a deployed anything.

## What ported cleanly, and what did not (and why that is correct, not a gap)

`riverrun-core::commitment::Secret::random()` (OS-CSPRNG secret generation) is
**not** in this crate. `getrandom` does not support `wasm32-unknown-unknown`
without a JS entropy source, and Soroban's contract sandbox has no entropy source
of its own, no contract, on any chain, should be minting its own secrets. Secret
generation is a client-side concern; this crate only ever receives a `Secret` the
caller already holds. That boundary is not a limitation the port introduced, it is
the same boundary `riverrun-core` already draws for Solana.

Not ported (a real next step, not a hidden gap): the `check_turn` / `check_link` /
`check_delegation` / `check_attribute` *relations*, the statements a zero-knowledge
proof of a rotation, a chosen link, or a credential would enforce. Those need a
Merkle-inclusion witness and a proof backend; this slice is the derivations alone.

## Honest next steps, in order

1. A minimal Soroban contract (with `soroban-sdk`) that stores a spent-nullifier
   set and checks a submitted `fit` against it, the on-chain half of "one action
   per context, no double-spend", proved on Stellar testnet.
2. Port the relation-checking functions once a proof backend for Soroban is chosen
   (this repo's `paper/riverrun.tex` and `crates/riverrun-stark`/`riverrun-m31` in
   the mirror-pool repo are the reference for what that backend needs to prove).
3. One real integration: an anonymous vote or a KYC-gated join using riverrun ID
   instead of a fixed account, the concrete demonstration that the primitive slots
   under an existing Stellar privacy application rather than only being argued for.

Falsifiable check: if step 3 does not produce a working demo within a stated
timeframe, the "chain-agnostic identity primitive" claim stays a design argument,
not a proven one, and should be represented as such everywhere it is repeated.

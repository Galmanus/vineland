# Soroban proof backend for riverrun ID's relation checkers

_2026-07-28. Scoping pass, grounded in a real compile spike, not speculation.
Decision material for the next real engineering push on `vineland-stellar`._

## The gap this closes

`riverrun-nullifier-registry` (deployed and live on Stellar testnet,
`CCHUXEFY3IUGYLFRCFYVAL3VLPJELUUHAYZO7ZCZFXL3A4VOKK6Z57ZO`) enforces uniqueness
of a submitted `(angle, fit)` pair. It does not check that `fit` came from a
genuine riverrun ID member: `submit_fit` accepts any 32 bytes for any angle
today. `riverrun-id-wasm::relation` (`check_turn`, `check_link`,
`check_delegation`, `check_attribute`) is the plaintext specification of what a
real membership check would enforce, but it is not a zero-knowledge proof; it
takes the secret as a plaintext argument. Closing the gap means: a Soroban
contract that can verify a real proof of one of those relations, without the
prover ever revealing the secret or which member they are.

This is also the SKU thesis's own named failure mode
(`vineland/SKU_ANONYMIZED_ACTION_METERING.md`, "On-chain gap"): until this
exists, any attestation is "committee-attested," not trustless.

## Backend decision: riverrun-stark (Winterfell), not riverrun-m31

Two STARK backends exist in the mirror-pool repo. Only one has a working
membership relation:

- **`riverrun-stark`** (Winterfell, Rescue-Prime over a 128-bit field): the
  `bound` prover/verifier proves the *whole* riverrun relation in one STARK
  (`{root, nullifier, round, action}` public, one secret private, bound to
  both a Merkle-membership check and the revealed nullifier). This already
  runs, verified, inside a different constrained VM: `programs/stark-verifier`
  runs the real Winterfell verifier inside Solana's SBF runtime via a custom
  bump allocator, and prices it (157,758 CU in a LiteSVM e2e test, ~11% of
  Solana's budget).
- **`riverrun-m31`** (Plonky3 Circle-STARK over Mersenne-31): only proves
  knowledge of a Poseidon2-M31 *preimage* so far. Its own module doc says
  plainly this is "deliberately not yet the full Merkle-membership relation."
  The task tracker in this session's environment lists "M31 in-circuit
  Poseidon2 Merkle membership AIR" as completed; the mirror-pool repo's actual
  state contradicts that (last relevant commit, `d2a065d`, is the preimage
  proof only). Whatever closed that ticket did not land here, or landed
  somewhere not found during this scoping pass. Treat the task tracker's
  "completed" status for that item as unverified until reconciled.

Building on `riverrun-m31` would mean building a real Merkle-membership AIR
from scratch (genuinely unstarted cryptographic engineering) and *then* porting
it. Building on `riverrun-stark` means porting a relation that already works.
This design picks `riverrun-stark`.

## The real compile spike (2026-07-28), and what it proved

Three builds were actually run, not reasoned about abstractly:

1. `cargo build --target wasm32-unknown-unknown` (no manifest changes) on
   `riverrun-stark`: **succeeds**, full Winterfell stack, real relation code.
   Informative but not directly useful, per (2).
2. Soroban's own toolchain: `soroban-sdk` 26's build script **hard-rejects**
   `wasm32-unknown-unknown` on modern Rust ("Rust compiler 1.82+ ... is
   unsupported by the Soroban Environment, use 'wasm32v1-none'"). Confirmed by
   attempting to rebuild this repo's own `contracts/receipt` (a working,
   deployed Soroban contract) against `wasm32-unknown-unknown` instead of its
   normal `wasm32v1-none` target: same panic, same message. Soroban only
   accepts `wasm32v1-none` (a no_std target). This is not a preference, it is
   enforced in the SDK's build script.
3. `cargo build --target wasm32v1-none --no-default-features` on
   `riverrun-stark` directly: **fails**, two levels down the dependency tree
   (`constant_time_eq` via `blake3`'s default features, `crypto-common` via
   `sha3`'s default features), both pulled in with `std` enabled.

Failure (3) looked at first like "Winterfell doesn't do no_std." Checking the
actual upstream manifest (`winter-crypto`'s `Cargo.toml`, pulled from the
local registry cache) shows the opposite: `categories = ["cryptography",
"no-std"]`, and every dependency (`blake3`, `sha3`, `winter-math`,
`winter-utils`) is already declared with `default-features = false`, with
`std` cleanly gated behind winter-crypto's own `std` feature (`default =
["std"]`). The leak is that `riverrun-stark`'s own `Cargo.toml` declares
`winterfell = "0.13"` with no `default-features = false`, so Cargo's feature
unification drags `std` in through the whole tree. **This is a manifest
configuration problem, not an architecture problem**, the same category of
fix that made `riverrun-id-wasm` portable (`blake3 = { default-features =
false }`), one level deeper in the dependency graph.

This was not independently re-verified for every crate in the tree
(`winter-utils`, `winter-math`, `winter-air`, `winter-prover`,
`winter-verifier`, `winter-fri` were not each individually checked for their
own no_std discipline); only `winter-crypto`'s manifest was read. Milestone 1
below is where that gets confirmed for real, not assumed.

## Milestones

### M1: a clean `wasm32v1-none` compile of the verifier path

Fix `riverrun-stark/Cargo.toml` (and any other manifest in the dependency
chain that needs it) to disable default features through the whole winterfell
tree, and add whatever `alloc`-equivalent feature each crate needs (Winterfell
is no_std, not allocation-free; FRI and Merkle verification are Vec-heavy).

**Success:** `cargo build --target wasm32v1-none --no-default-features
--features <whatever winterfell's no_std+alloc convention turns out to
require>` on `riverrun-stark` produces a real `.rlib`, and the crate's
existing native test suite (`tests/bound_nullifier.rs`, `tests/rotation.rs`,
etc.) still passes with `--no-default-features` off (i.e., the std path is not
broken by this change).

**Scope:** touches `mirror-pool` (the riverrun/tech repo), not `vineland`.
Consistent with this session's established practice of making real fixes in
mirror-pool directly (the effective-k ruler wiring, the M31 preimage proof
work). This is a portability fix to riverrun's own crate, not a vineland
business-logic change, and does not merge the two repos.

**Risk:** low-medium. Mechanical, but six or more crates each need checking
individually; any one of them declaring an un-gated `std` dependency
(unlikely, given the crates.io `no-std` category claim, but unverified) would
turn this from a manifest fix into a real patch-or-fork decision, which this
design does not pre-authorize (forking unowned upstream crates was explicitly
rejected earlier this session, for licensing/measure-don't-fake reasons, in
the M31 preimage work; the same standard applies here).

### M2: a minimal Soroban contract that verifies a real proof, priced on testnet

A `soroban-sdk` contract (new crate, `vineland-stellar/riverrun-stark-verifier`
or similar) with one entrypoint that calls `riverrun_stark::verify_bound` (or
the real function name, to be confirmed against `riverrun-stark/src/lib.rs`'s
actual public API) against real proof bytes generated off-chain by the
existing prover, deployed and invoked on Stellar testnet exactly like
`riverrun-nullifier-registry` was.

**This is the actual go/no-go gate**, not M1. Two risks live here, both
genuinely unmeasured, not merely unlikely:

- **Instruction budget.** Solana's 157,758 CU (of a ~1.4M CU transaction
  limit) does not transfer to Soroban's cost model (wasm interpretation vs.
  SBF's eBPF-derived execution have different per-operation costs). Soroban's
  resource budget is real and enforced; this needs its own measurement, from
  zero, the same way the Solana number was earned rather than assumed.
- **Wasm binary size.** Soroban enforces a contract size ceiling. Winterfell's
  verifier (FRI folds, Merkle openings, Fiat-Shamir, constraint evaluation) is
  not small; whether the compiled, optimized (`opt-level = "z"`, `lto = true`,
  matching this repo's existing contract profile) artifact fits is unverified.

**Success:** a real testnet transaction that calls the verifier entrypoint
with a genuine proof and returns `true`, with the actual instruction count and
wasm size recorded as real numbers, not estimates. A failure here (busts the
budget, or the module won't validate/deploy) is a legitimate, informative
outcome for this milestone, not a failure of the scoping pass; it would mean
recommending option (c) from the earlier discussion, the committee-attested
fallback already named honestly in the SKU doc, instead.

### M3 (stretch, not required for M1/M2 to count as delivered)

Gate `riverrun-nullifier-registry`'s `submit_fit` behind a call to the M2
verifier contract, turning "uniqueness-checked" into "trustless" for real.
Requires deciding the calling convention (cross-contract call vs. the caller
submitting a pre-verified receipt) and updating `demo_anonymous_vote.sh` to
exercise it. Out of scope for this design; sequenced after M1 and M2 land.

## Non-goals

- Porting the **prover**. Only the verifier needs to run on Soroban; proving
  stays off-chain (client-side), exactly matching riverrun's existing Solana
  architecture (the prover never ran on Solana either; only
  `programs/stark-verifier` does).
- Reconciling the task-tracker discrepancy about `riverrun-m31`'s membership
  AIR. Noted above as a fact this scoping pass surfaced; not this design's job
  to resolve.
- Any change to `riverrun-nullifier-registry`'s deployed contract. M1 and M2
  are additive; the existing registry is untouched until M3, which is explicitly
  out of scope here.

## Falsifiable check

If M2 does not produce a real, priced testnet transaction (either a working
one under budget, or a clear over-budget/over-size failure) within a stated
timeframe once M1 is done, this backend choice should be revisited rather than
left as an assumed-eventually-done thread, matching this repo's existing
falsifiable-gate discipline.

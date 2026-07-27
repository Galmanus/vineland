# riverrun-nullifier-registry

The on-chain half of riverrun ID's "one action per context" rule, deployed and
proved live on Stellar testnet.

## What this is

riverrun ID (`vineland-stellar/riverrun-id-wasm`) derives a per-context nullifier,
`fit(θ)`, deterministically from a holder's secret and a public angle `θ`. The
construction guarantees a holder can compute only one valid `fit` per angle; it
does not by itself stop that `fit` from being submitted twice. This contract is
the missing half: a registry that records a `(angle, fit)` pair the first time it
is submitted and rejects every repeat, on-chain, publicly checkable.

## What this is not

It does not verify that `fit` was derived correctly from a real secret, or that
the holder was ever a member of any anonymity set, or any riverrun relation at
all. `riverrun-id-wasm::relation` (in the sibling crate) is the plaintext
specification of those relations; the zero-knowledge proof of them, the thing
that would make a call to this registry trustless rather than merely
uniqueness-checked, is real, separate, unstarted work: a Soroban-compatible proof
backend for `riverrun-stark` / `riverrun-m31`.

Concretely: today, anyone can call `submit_fit` with any 32 bytes for any angle.
The contract enforces uniqueness, not validity. Gating `submit_fit` behind a proof
of the `check_turn` (or another) relation is the natural next step once that proof
backend exists; this registry's storage shape does not need to change for that,
only its call surface gains a proof argument in front of it.

## Why `submit_fit` requires no authorization

Requiring the submitter to authenticate as a fixed on-chain `Address` would attach
every anonymized action to a linkable transaction signer, defeating the exact
property riverrun exists to provide. The registry's only guard is uniqueness of
`(angle, fit)`.

## Proved live, testnet

Deployed contract: [`CCHUXEFY3IUGYLFRCFYVAL3VLPJELUUHAYZO7ZCZFXL3A4VOKK6Z57ZO`](https://stellar.expert/explorer/testnet/contract/CCHUXEFY3IUGYLFRCFYVAL3VLPJELUUHAYZO7ZCZFXL3A4VOKK6Z57ZO)
(Stellar testnet, "Test SDF Network ; September 2015").

Real invocations against the live contract, not a simulation claim:

- `submit_fit(angle=42, fit=<32 random bytes>)` → succeeds, emits `FitSpent`.
  [tx](https://stellar.expert/explorer/testnet/tx/f8cc3dc40cd9ac02b55f7a48c6b7dd5a951a23420c8f735c9effa015c1695399)
- `is_spent(angle=42, fit=<same>)` → `true`.
- `submit_fit(angle=42, fit=<same>)` again → fails with `Error(Contract, #1)`
  (`AlreadySpent`), confirmed via the VM trap in the simulation's diagnostic log.
- `is_spent(angle=43, fit=<same fit, different angle>)` → `false`: the guard is
  per-`(angle, fit)`, not per-`fit`, matching how riverrun ID actually derives
  `fit` (domain-separated by angle already, so this collision never happens in
  practice; the registry's independent per-angle guard is a second line of
  defense, not a load-bearing assumption about `fit`'s uniqueness).

6 unit tests (native, `soroban-sdk` testutils) cover the same four behaviors plus
the no-authorization property directly.

## Build and deploy it yourself

```bash
cargo test                                        # 6 tests, native
cargo build --target wasm32v1-none --release      # -> target/wasm32v1-none/release/riverrun_nullifier_registry.wasm
stellar contract deploy \
  --wasm target/wasm32v1-none/release/riverrun_nullifier_registry.wasm \
  --source <your funded testnet identity> \
  --network testnet
```

## Honest next steps

1. Gate `submit_fit` behind a real proof of one of the four `riverrun-id-wasm`
   relations, once a Soroban-compatible proof backend exists for them. This is
   the step that turns "uniqueness-checked" into "trustless."
2. **Done, partially:** [`../demo_anonymous_vote.sh`](../demo_anonymous_vote.sh)
   wires this registry to real riverrun ID holders (three independent secrets,
   each deriving and submitting their own `fit`), live on testnet, with a
   rejected repeat as evidence. What is still missing: the holders are not
   drawn from any registered eligible-voter set, because that check needs (1).
3. Mainnet deployment, after (1) and (2), and after the same audit bar the rest
   of this repo's contracts hold themselves to (`vineland-zk` is explicitly
   unaudited; this contract should be held to the same standard, not a lower one
   because it looks simpler).

# Demo: an anonymous vote, riverrun ID + the nullifier registry, live testnet

The first real integration of `riverrun-id-wasm` and `riverrun-nullifier-registry`:
run, not simulated, against Stellar testnet. Script:
[`demo_anonymous_vote.sh`](./demo_anonymous_vote.sh).

## What it does

Three independent riverrun ID holders (Alice, Bob, Carol, each a fresh random
32-byte secret, generated locally, never transmitted) each derive their own
`fit(vote_round)` via `riverrun-id-wasm` and submit it to the live
`riverrun-nullifier-registry` contract on Stellar testnet. Then:

- Alice tries to submit her same `fit` again in the same round: the contract
  rejects it, `Error(Contract, #1)` (`AlreadySpent`).
- Alice votes again in a **different** round: a new, unrelated-looking `fit`,
  accepted independently. Domain separation by angle, not a special case.

## Real evidence, one run, 2026-07-27

- Alice votes (round 424242): [`a18a92aff...`](https://stellar.expert/explorer/testnet/tx/a18a92aff7ffab29bc8dca97e3796c93becb8b2ee17dc0737135bb0e805ac017)
- Bob votes (round 424242): [`cb0c6a7a6...`](https://stellar.expert/explorer/testnet/tx/cb0c6a7a68c27b6f5712b94e8768d3fad8d832ed9930773dfe92ef9f52f1ea0f)
- Carol votes (round 424242): [`0c06ef6cf...`](https://stellar.expert/explorer/testnet/tx/0c06ef6cf8ab34746704b2d62ddeefa46e241b0debffd4e8f9bcafcabbea6c61)
- Alice's repeat in round 424242: rejected, no tx (simulation fails before
  submission, `Error(Contract, #1)`).
- Alice votes again, round 424243: [`a5d55577f...`](https://stellar.expert/explorer/testnet/tx/a5d55577f21dec99cd33d12db87b840091e1a698a34b47c2dd10cff52e9cc987)

Contract: [`CCHUXEFY3IUGYLFRCFYVAL3VLPJELUUHAYZO7ZCZFXL3A4VOKK6Z57ZO`](https://stellar.expert/explorer/testnet/contract/CCHUXEFY3IUGYLFRCFYVAL3VLPJELUUHAYZO7ZCZFXL3A4VOKK6Z57ZO).
Re-run it yourself: `./demo_anonymous_vote.sh` (needs `stellar-cli`, `python3`,
and a funded testnet identity; see the script header).

## What this proves, and what it does not

**Proves:** the nullifier half of an anonymous vote works end to end, live, on
a real Soroban contract: one vote per holder per round, unlinkable across
rounds, no wallet address anywhere in the registry's storage or events (the
transaction submitter, `riverrun-registry-deployer`, is the same relayer
account for all three votes on purpose, to show the contract itself never
distinguishes holders by signer).

**Does not prove:** that Alice, Bob, and Carol were members of any registered
"eligible voter" set. `submit_fit` accepts any 32 bytes for any angle today; it
enforces uniqueness, not validity. A real anonymous vote needs a membership
check too (riverrun ID's `check_turn` / `check_delegation` relations, ported
natively in `riverrun-id-wasm::relation`, gated behind a Soroban-compatible
proof backend that does not exist yet). This demo is honestly the piece that
is done: the double-spend guard. The membership piece is the named, unstarted
next step, not a rounding error.

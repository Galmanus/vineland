# Wiring the ZK proof to the real Vineland charge path (SHADOW)

Status: **shadow, proven on real data, off the production payment path.** Done
the night of 2026-06-14 while you slept. Nothing in the live payment service was
changed. The decision to make this *enforcing* (gate settlement on a fresh proof)
is yours — see "Becoming enforcing" and its failure modes below.

## What was proven (measured, not promised)

A real batch of **8 production `orders` rows** (pulled read-only from the prod DB)
was turned into a `mandate_sd` Groth16 proof and **verified by the live mainnet
contract `CBDS2YSL…U3FE` — returned `true`, via simulation (no tx, no cost).**

```
8 real orders → cents → circuit inputs → proof → mainnet verify(real) = true
total = $30.47 (ENCRYPTED to the regulator; amounts + recipients stay private)
per-payment cap $20.00 · monthly cap $40.00 · 2 distinct payout recipients
```

Reproduce:
```bash
export NODE_PATH=$(npm root -g)          # snarkjs is global
node prove_batch.js build_real_batch.json   # → build_real/{proof,public,invoke_args}.json, offchain_verify:true
./verify_mainnet.sh                          # → mainnet verify (simulation): true
```

## Data mapping (real `orders` → circuit)

`mandate_sd(N=8, M=4, 64-bit caps)` private inputs come from real charge rows:

| circuit input | source | mapping |
|---|---|---|
| `amounts[i]` | `orders.usdc_amount` | USD **cents** = round(usd × 100) |
| `recipients[i]` | `merchants.stellar_address` (via `orders.merchant_id`) | `sha256(identity) mod r` (BN254 scalar field) |
| `perPaymentCap` | mandate config | cents |
| `monthlyCap` | mandate config | cents |
| `allowed[0..3]` | merchant's consented payout address(es) | same `sha256 mod r`; padded by repeat |
| `regPubKey` | regulator's Baby Jubjub pubkey | fixed (demo priv `987654321`) |

Why **cents, not stroops**: the ElGamal total is encoded in 32 bits
(`Num2Bits(32)` in the circuit), so the monthly total must be `< 2^32` units.
Cents → ceiling ~$42.9M (fine). Stroops (7 decimals) overflow at ~$429.
Trade-off: sub-cent rounding on each amount. Acceptable for a *compliance*
attestation ("the batch obeyed the caps"); documented, not hidden.

Null payout address: 2 of the 8 real orders belong to a merchant with
`stellar_address = null`. They were mapped to the **merchant UUID** as the payout
identity (an honest "this went to merchant X"), and the UUID is in the allowlist.
In production every payable merchant has a pinned address (the charge path already
pins `merchant.stellar_address` at charge time — recipient-drift defense), so this
fallback disappears.

## Where it hooks in the backend

The prover is Node + snarkjs + the circom `.wasm`/`.zkey` artifacts. It **cannot**
run inside the Deno edge function. The natural home is the existing
`/opt/vineland-backend/attester` service, running as a **shadow job**:

1. For each merchant, pull the current period's `paid` orders (read-only).
2. Map → circuit inputs (the `prove_batch.js` logic, ported).
3. Generate the proof; simulate `verify` on the mainnet contract (`--send no`).
4. Persist an **attestation** row: `{merchant_id, period, total_ciphertext,
   public_signals, mainnet_sim_result, proof_hash, created_at}`.
5. Surface it (the `/verify` page / merchant dashboard / `app.vineland.cc/zk`).

This is observe-only: it never touches `subscriptions.ts` settlement. A reference
patch is intentionally NOT applied to the live service.

## Becoming enforcing (your call, your money)

To gate settlement on a fresh compliance proof, the hook would sit in
`subscriptions.ts :: POST /:id/onchain-charge` (or the listener that finalizes a
charge): refuse to build/submit the charge unless a current proof verifies.

Failure modes you are signing up for if you flip this on:
- **False block of live charges.** A prover bug, a stale `.zkey`, or a mis-mapped
  amount makes a *valid* batch fail the proof → the live recurring rail
  (`CBJMQ6ZY`, charges via `GCEYFLGN`) stops settling. This is the dangerous one.
- **Latency.** Proving adds seconds; settlement must not block on it
  synchronously. Enforcing belongs *before* a batch is authorized, not inline per
  tx.
- **Cap/period drift.** The mandate (caps, allowlist) must be the *consented*
  one, sourced from a tamper-evident merchant config — not re-derived from the
  same orders it's checking, or the proof is circular.
- **Trusted setup.** Still single-contributor (hackathon-grade). Production
  enforcement wants a real ceremony before it guards real funds.

Recommended path to enforcing: run the shadow attester for N weeks, confirm
`offchain_verify == mainnet_sim == true` on every real period with zero false
blocks, *then* gate — and gate at batch-authorization time, asynchronously, with
a manual-override break-glass.

## Shadow attester (built + run on real data — 2026-06-15)

`attest.js` is the periodic shadow job. It is **separate from** the existing
ed25519 integrity oracle (`attester/src/oracle.mjs` in the backend) — that one is
per-charge fail-closed surface detection; this one is a periodic
**privacy-preserving batch-compliance proof**.

Per merchant with a mandate it: pulls recent settled orders → proves the batch
obeyed the mandate → simulates the live mainnet verify (no tx) → appends a
privacy-preserving attestation. Run over the real production snapshot (5
merchants, 17 orders):

```
✓ 2b1b2bc2…  8 payments · offchain=true · mainnet(sim)=true · compliant=true
✓ 828dd793…  5 payments · offchain=true · mainnet(sim)=true · compliant=true
✗ e43a6ffd…  NOT attested — payment $1000 > perPaymentCap $50  (real violation, fail-closed)
✓ a0acee25…  1 payment  · compliant=true
✓ 1e6277bf…  1 payment  · compliant=true
→ 4/5 compliant
```

The `e43a6ffd` refusal matters: the attester caught a **real** over-cap charge
and refused to sign it. The proof is meaningful, not a rubber stamp.

Each attestation records only public, zero-knowledge data: the mandate caps, the
verify results, and the ElGamal `total_ciphertext` (the real total stays
encrypted to the regulator). Amounts and recipients are never written.

Two correctness items handled while building:
- **Fresh ElGamal nonce per attestation.** A fixed nonce makes equal totals
  produce identical ciphertexts and leaks total *differences*
  (`encTotal₁ − encTotal₂ = (total₁ − total₂)·G`). Now `crypto.randomBytes` per
  attestation; verified ephemeral keys are distinct.
- **No silent truncation.** A merchant with >8 orders is attested on the most
  recent 8 and the exclusion is logged, not hidden.

Still open (the honest gaps, unchanged): the mandate (`mandates.json`) is a
stand-in for a *consented* per-merchant config — production must source caps +
allowlist from a tamper-evident commitment, not a local file or the orders
themselves. Trusted setup still single-contributor.

### Enabling in prod (your call)

The job is Node + snarkjs + the circom artifacts. To run it as a real service:
copy this repo (or just `prove_batch.js`, `to_soroban.js`, `attest.js`,
`build_sd/`) to the box, replace the `/tmp/*.json` snapshots with a read-only
query of paid orders in the period, schedule it (cron / pm2), and persist
`attestations.jsonl` to a table + surface it on `app.vineland.cc/zk`. It writes
nothing to chain and never touches `subscriptions.ts`. One command, your go.

## Files

- `prove_batch.js` — real batch → proof + offchain verify + soroban args
- `to_soroban.js` — snarkjs JSON → Soroban byte hex (validated byte-exact vs the known-good testnet args)
- `verify_mainnet.sh` — simulate the live mainnet verify (no tx)
- `build_real_batch.json` — the 8-order real batch used above
- `build_real/` — generated proof/public/invoke_args (private witness gitignored)

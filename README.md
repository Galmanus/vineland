# Vineland

**Vineland is riverrun, productized.** [riverrun](https://github.com/solanabr/mirror-pool)
is the post-quantum anonymity layer (Superteam Brasil "Noise" bounty, 2026): one
hash-based secret, a different unlinkable face at every context, no elliptic curves,
no trusted setup, measured not claimed. riverrun stays the tech, open, MIT, research-
grade. Vineland is the business built on top of it: metering, attesting, and billing
for the anonymized action riverrun produces.

The name is from Thomas Pynchon's *Vineland*: a refuge that stays its own.

---

## The one line

**Charge the protocol a per-action fee to embed a riverrun anonymity attestation, not
the user a fee to anonymize money.** Same per-transaction billing shape a mixer uses;
a different object; the opposite legal exposure. Selling infrastructure (a signed
attestation, metered like an API call) is a SaaS/verifier sale. Taking a cut of value
moved is money transmission (Res BCB 561 in Brazil, and the reason Tornado Cash's
operators were prosecuted). Vineland sits on the clean side of that line on purpose.

Full spec: [`vineland/SKU_ANONYMIZED_ACTION_METERING.md`](./vineland/SKU_ANONYMIZED_ACTION_METERING.md).

## What is billed, and to whom

| | mixer take-rate (the trap) | anonymized-action attestation (this business) |
|---|---|---|
| billed event | user withdraws value | protocol facilitates an anonymized action |
| payer | the user mixing money | the dApp/protocol integrating riverrun ID |
| object | value transferred | a signed anonymity attestation (the AXL cert) |
| custody | yes | none |
| moat | being the pool | being the standard the cert is issued against |

The buyer is a protocol that needs a credible, neutral anonymity guarantee to show
its users or a regulator: privacy-pool successors, compliant-privacy apps, anonymous-
vote / airdrop / reputation dApps. They embed riverrun ID and pay per attested action
for a portable cert that proves the anonymity floor actually held, not just that
something was hashed.

The billable event is a counter that already exists: riverrun's on-chain nullifier
registry increments once per anonymized action. Metering is reading a counter.

## The number (honest, comped)

Meter at **$0.005 per attested anonymized action**. One integrating app at 100M
actions/month = **$500K/month**, marginal cost per attestation ≈ 0. This is a comp,
not a promise, worth exactly $0 until a real protocol integrates and has volume, same
as every projection below it.

**Falsifiable gate, 90 days from 2026-07-25:** ≥1 protocol integrates riverrun ID and
meters ≥1 real paid attested action through Vineland. Below that, this is a thesis,
not a business, and the honest fallback is the audit pilot (next section).

## The bridge, live today

The rail above needs an integrator; the audit does not.
[`vineland/OFFER_FLOW_PRIVACY_PILOT_5K.md`](./vineland/OFFER_FLOW_PRIVACY_PILOT_5K.md)
is a $4,997 fixed-price, 5-day deanonymization audit of a fund or whale's real on-chain
flow, run with the same tooling riverrun's `provenance-tracer` uses on mainnet, plus
the design for closing what it finds. This is service revenue, capped by attention,
and it pays for the wait while the meter above has zero integrators. It is the bridge,
not the destination:
[`vineland/POSITIONING_PLAN.md`](./vineland/POSITIONING_PLAN.md) names that split and
its own honest failure modes (bridge revenue is mandatory, not optional; a take-rate
on settled *volume*, its earlier, broader framing of "the rail," runs straight into
the money-transmission line this SKU exists to route around).

## What's live, not a pitch deck

### `vineland-zk`: confidential compliance, on Stellar mainnet

A Groth16 proof that a batch of payments stayed inside a mandate, cap, and allowlist,
with the total encrypted to a regulator's key. Real proof, verifying today.

- Mainnet verifier: [`CBDS2YSLATINQVUDG5Y5HV4KQBEAVFDRPEINVEUTYSX3CZZQKBY5U3FE`](https://stellar.expert/explorer/public/contract/CBDS2YSLATINQVUDG5Y5HV4KQBEAVFDRPEINVEUTYSX3CZZQKBY5U3FE),
  ~44.6M instructions, 11% of budget.
- A second circuit proves KYC (registered, of-age, non-sanctioned), zero PII, also
  live on mainnet.
- Selective disclosure is threshold-held: a 2-of-3 committee quorum recovers a
  disclosed value, no single party alone. Proven in `vineland-zk/threshold_disclosure.js`.
- Honest boundary: classical (Groth16/BN254, ElGamal over Baby Jubjub), quantum-
  breakable, needs a trusted setup. It hides *how much* and *to whom*, not *who acted*.
  This is the compliance half of an attestation, not the anonymity half.

### `vineland-stellar`: the identity primitive, proved portable

`riverrun-id-wasm` is the rotatable-piece identity primitive, the thing the SKU's
attestation is issued *about*, ported from riverrun-core and proved to compile
`no_std` to `wasm32-unknown-unknown`, the exact target Soroban runs on. That now
includes the Merkle anonymity-set tree and the four native relation checkers
(`check_turn`, `check_link`, `check_delegation`, `check_attribute`): the plaintext
specification of what a rotation, a chosen link, a delegation, and an attribute show
each have to enforce, not just the raw derivations. Real artifact:
`target/wasm32-unknown-unknown/debug/libriverrun_id_wasm.rlib`, 20 tests green.

`riverrun-nullifier-registry` is the on-chain half: a Soroban contract that
records a spent `(angle, fit)` pair once and rejects every repeat, one action per
context, no double-spend. Deployed and invoked live on Stellar testnet:
[`CCHUXEFY3IUGYLFRCFYVAL3VLPJELUUHAYZO7ZCZFXL3A4VOKK6Z57ZO`](https://stellar.expert/explorer/testnet/contract/CCHUXEFY3IUGYLFRCFYVAL3VLPJELUUHAYZO7ZCZFXL3A4VOKK6Z57ZO),
with a real `submit_fit` → `is_spent` → rejected-repeat sequence run against it,
not just deployed and left untouched. It checks uniqueness, not validity: it does
not verify a `fit` came from a genuine riverrun secret, that gate is the proof
backend named below.

See `vineland-stellar/riverrun-id-wasm/README.md` and
`vineland-stellar/riverrun-nullifier-registry/README.md` for exactly what is
proved versus what is not (no Soroban-compatible proof backend for the four
relations yet, so the registry cannot yet reject an invalid `fit`, only a
repeated one; no live integration): named precisely, not rounded up.

Neither of Stellar's own privacy tools, Confidential Tokens or Stellar Private
Payments, ships a reusable per-context identity primitive underneath. That gap is
exactly what riverrun ID fills, and exactly what an attestation would be issued
against on that chain.

## Architecture, and the hard boundary

```
vineland/                the business: SKU specs, positioning, the pilot offer
vineland-zk/              Circom/Groth16 circuits + Soroban verifier: live on mainnet
vineland-stellar/         riverrun-id-wasm (the identity primitive, proved portable)
                           + riverrun-nullifier-registry (Soroban contract, live testnet)
../mirror-pool             riverrun itself (Solana, MIT, the bounty submission): the tech
```

**riverrun and Vineland's codebases are never merged.** riverrun stays the anonymized
action and the cert; Vineland is the meter, the `/verify` toll-gate, and the billing
entity that charges the integrating protocol. They wire together at the cert boundary
only. Authorized cross-poll, 2026-07-25.

The Pix/dollar consumer app (`apps/web`, `supabase`, the Shopify/VTEX connectors, the
Soroban checkout contracts) that used to lead this README was infrastructure built for
a different, earlier product framing. It still exists in this monorepo and still
builds, but it is no longer Vineland's primary framing: the identity-attestation
business above is. `FUSION.md` and `INFRA.md` document that earlier thread and how to
run it, for history, not as the current pitch.

## Status

- `vineland-zk`: unaudited. Mandate and KYC proofs verify on mainnet; the trusted
  setup is single-contributor, demo-grade. Not for real funds until audited.
- `vineland-stellar`: identity math and its native relation checks proved portable
  (real wasm32 artifact, 20 tests). The nullifier registry is a real Soroban
  contract, live on testnet, invoked end to end (submit, query, rejected repeat).
  Unaudited, and it checks uniqueness only: no proof backend for the four
  relations yet, so it cannot reject an invalid `fit`, and no live integration
  with a real riverrun ID holder beyond this repo's own smoke-test invocations.
- The metering business: $0 revenue today. Zero integrating protocols. The gate above
  is the falsifiable check, not a claim of traction.

## License

Proprietary. Copyright Manuel Guilherme Almeida. All rights reserved.

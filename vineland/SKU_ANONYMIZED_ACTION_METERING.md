# Vineland — the rail, pinned: metered anonymized-action attestation

_2026-07-25. Decision material, not a fixed plan — gates are falsifiable on purpose.
Extends [POSITIONING_PLAN.md](./POSITIONING_PLAN.md) (bridge = sell the attestation,
rail = take-rate on volume) and [OFFER_FLOW_PRIVACY_PILOT_5K.md](./OFFER_FLOW_PRIVACY_PILOT_5K.md)
(riverrun tracer as the bridge service). This doc pins the **object** of the rail
take-rate — the piece both docs gesture at but never fix._

## The one line

**Charge the protocol a per-action fee to embed a riverrun anonymity attestation —
not the user a fee to anonymize money.** Same per-transaction billing the mixer model
uses; different object; opposite legal exposure. This is the SaaS/verifier side of the
money-transmission line the positioning plan already draws, and it is where the rail
revenue lives without an FX/money-transmitter license.

## Why this is the object the rail was missing

The positioning plan says "rail = take-rate in bps on settled volume." Its own failure
mode section then warns: **"taking bps on value-transfer is money transmission / câmbio
(Res BCB 561); selling the verifier / dev tool / SaaS sidesteps it."** Those two pull in
opposite directions. Metering the **anonymized action** (not the value moved) resolves
it:

- You do not custody funds, do not transmit value, do not touch the user's money.
- You sell **infrastructure**: a per-action attestation a dApp embeds, metered like an
  API call. This is the World ID / Auth0 / Stripe-metering shape, which is settled,
  clean SaaS — not money transmission.
- The billable event is a **counter that already exists**: riverrun's on-chain
  nullifier registry increments once per anonymized action (`fit(θ)` spent once per
  context). Metering is reading a counter, and the Solana program already carries
  `set_entry_fee`. The plumbing exists; the object is what's new.

## What is billed, and to whom

| | mixer take-rate (the trap) | **anonymized-action attestation (this SKU)** |
|---|---|---|
| billed event | user withdraws value | protocol facilitates an anonymized action |
| payer | the user mixing money | the **dApp/protocol** integrating riverrun ID / the cert |
| object | value transferred | a signed anonymity attestation (the AXL cert) |
| custody | yes | none |
| legal | Tornado / OFAC 2022, Pertsev convicted 2024, money-transmission | SaaS / verifier — infra sale, no FX license |
| moat | being the pool | being the **standard** the cert is issued against |

The buyer is a protocol that needs a **credible, neutral anonymity guarantee** to show
its users or a regulator: privacy-pool successors, compliant-privacy apps (the Vitalik
/ Soleimani "Privacy Pools" association-set wave), anonymous-vote / airdrop / reputation
dApps. They embed riverrun ID (one secret, unlinkable per-context, one-action-per-person)
and pay per attested action for the portable cert that proves the anonymity floor held.

## The number (honest, comped)

- Meter at **$0.005 / attested anonymized action**. A single integrating app at 100M
  actions/month = **$500K/month**. Marginal cost per attestation ≈ 0; revenue scales
  with adopted volume, not with Manuel's attention — the property the $4,997 pilots lack.
- Comp shape (not a promise): World ID meters verified-human actions; Auth0 meters MAUs
  (~$0.02–0.05 range); Stripe meters transactions. Per-action attestation metering is a
  proven SaaS motion. **Disanalogy:** all three had the integrating apps *first*;
  Vineland has zero integrating apps today. The $500K/month is worth exactly $0 until a
  protocol integrates and has volume. Same gate as the rail always had.

## How it fits the two-project split (authorized cross-poll)

- **riverrun (Solana, the tech / the bounty / the cypherpunk artifact):** produces the
  anonymized actions and the cert. Stays research-grade, open, MIT, honest. It is the
  *thing being attested*.
- **Vineland (the business / the rail):** the metering, the `/verify` toll-gate, the
  billing, the SaaS entity that charges the integrating protocol. It is the *toll on the
  wall the cert builds*.
- The codebases stay separate; the cross-poll (riverrun's cert → Vineland's meter) is
  authorized by Manuel, 2026-07-25. Do not merge the repos; wire them at the cert
  boundary only.

## Named failure modes

- **Diffuse buyer until integration.** Users don't pay; only an integrating protocol
  does. Until ≥1 protocol embeds and meters, this is $0. The $4,997 flow-privacy pilot
  remains the bridge that pays the café.
- **Standard risk.** World ID, Semaphore-based stacks, or a chain-native anonymity
  primitive could become the default the market attests against. The defensible sliver
  is **post-quantum + the ruler** (a cert that also reports the *real* effective-k, not
  just "anonymized"), which none of them ships. If that edge doesn't hold, the meter has
  nothing proprietary to bill against.
- **On-chain gap.** A fully trustless cert needs riverrun's in-circuit M31 membership
  verifier (proven in a local VM at 159,849 CU, not yet on mainnet). Until it ships, the
  attestation leans on the M-of-N committee — meterable, but not yet trustless. Bill it
  honestly as "committee-attested" until the verifier lands.

## Falsifiable gate

- **90 days:** ≥1 protocol integrates riverrun ID and meters ≥1 paid attested action
  through Vineland. Below that, the SKU is a thesis, not a business — keep selling the
  pilot.
- **The money test is orthogonal to the tech:** one protocol paying per attested action
  > 100 free audits. Adoption of the meter, not depth of the crypto, is the signal.

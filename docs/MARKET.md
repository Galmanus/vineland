# Vineland — market sizing (verified, conservative, diligence-ready)

*Confidential settlement on Solana. Every figure is sourced and dated; ranges, not
false point estimates; the cold-start risk is named, not hidden. Numbers are
2025–2026. Reliability: high = peer-reviewed / multiply-corroborated, medium =
single source citing an aggregator, low = blog claim.*

## Verified figures

| metric | value | date | source | reliability |
|---|---|---|---|---|
| Solana DEX volume, typical day | **~$1.1–2.5B/day** soft; ~$4–6B/day active | 2025–26 | ainvest / eco.com | medium |
| Solana DEX volume, peak (memecoin) | monthly ~$208–262B (Jan 2025) | Jan 2025 | cryptoslate | medium |
| Solana DeFi TVL | **~$5.5B** (off a >$11.5B Aug-2025 peak) | Apr–May 2026 | eco.com / bydfi | medium |
| MEV sandwich extraction | **$370–500M over ~16 months** | 2024–25 | cryptoninjas / 99bitcoins | medium |
| MEV victim losses (peer-reviewed) | **$7.7M over 4 months**, 500K+ sandwich instances | 2025 | ACM IMC 2025 | **high** |
| Stablecoin supply on Solana | **~$12–14B** (USDC ~$7–8B) | Jun 2026 | stablecoininsider | medium |
| Transfer vs speculation | stablecoin swaps **≈58% of DEX volume**; memecoin <30% | Sep 2025 | mitrade/yahoo | medium |
| B2B stablecoin payments (global) | **~$226B in 2025, +733% YoY**, ~60% of stablecoin payment volume | 2025 | McKinsey | medium |
| Institutional share of Solana | **no clean figure** — directional only | 2025–26 | yellow / coinmarketcap | low |
| Railgun (closest privacy comparable) | **$1.6B shielded/yr (~$4.4M/day)**, ~$4–5B cumulative, **TVL ~$83M** | 2025–26 | altrady | medium |
| Aztec / Zcash shielded | Aztec TVL ~$8.7M; Zcash shielded ~25% of supply | 2026 | theblock / flashift | low |
| Arcium (Solana confidential compute) | 3.5M+ tx since Feb-2026 alpha — *compute, not settlement value* | 2026 | Messari | medium |
| Relayer / privacy take-rate | **0.05–0.3%** (Tornado relayers 0.05–0.2%; later 0.3% gov fee) | hist.–2026 | tornado docs / coingecko | medium |

## TAM — the category ceiling

The value on Solana that a business would plausibly want settled **confidentially**.
Anchor to what is *measured*, not to the memecoin peak:

- **~$12–14B in stablecoins** live on Solana, and **~58% of DEX volume is already
  stablecoin settlement**, not memecoin speculation — i.e. the network is used for
  real value transfer, the substrate confidentiality applies to.
- Riding a macro wave: **~$226B in global B2B stablecoin payments in 2025, +733%
  YoY** (McKinsey). Solana is a leading stablecoin rail on fees/latency, so a growing
  share of that flow lands here.

**TAM statement (honest):** the confidentiality-relevant on-chain value on Solana is
on the order of **$12–14B in stablecoins today**, drawing from a **$226B/yr and
fast-growing** global B2B stablecoin flow. This is the ceiling of the *category*, not
of Vineland — quoted as a range, from measured supply, never from a peak-day print.

## SAM — the KYC-accepting pain segment

Not retail, not memecoin. The subset that **feels the pain AND accepts KYC**: funds
being front-run, and businesses paying on-chain who want commercial confidentiality.
Size it by the **pain budget**, because "institutional share of Solana" has **no
verified figure** (do not claim 30–40% — it sinks in diligence):

- **Trading side (front-run pain):** measured victim losses of **~$23M/yr**
  (ACM peer-reviewed, extrapolated from $7.7M/4mo) up to **~$280–375M/yr** in total
  sandwich extraction (medium). That harm *is* the willingness-to-pay ceiling for
  funds to hide order flow.
- **Payments side (confidentiality premium):** the slice of the **$226B/yr** global
  B2B stablecoin flow that is on Solana and wants privacy — early and unquantified,
  so treated as an option on the macro wave, not a booked number.

**SAM statement (honest):** bounded by the pain it removes — **$23M–375M/yr** of
quantified front-run harm on the trading side, plus an unquantified but fast-growing
share of on-chain B2B settlement. The wide band is deliberate: the low end is
peer-reviewed, the high end is aggregator-cited.

## SOM — 12–18 months, falsifiable, cold-start-honest

**Drop "0.2% of institutional daily volume."** Institutional daily volume has no
verified denominator, so a % of it is unfalsifiable — that alone loses a skeptical
room. Reframe to **measured, falsifiable targets**:

> **Month-18 targets:** an anonymity-set / TVL of **$X** and confidential settlement
> of **$Y/day**, where privacy value scales with the crowd, not with a % of a number
> we can't define.

The binding constraint is the **anonymity set**, and the comparable proves it:
**Railgun took years** to reach ~$1.6B shielded/yr (~$4.4M/day), and its **TVL
(~$83M) is the actual limiter** — privacy is worth what the crowd is worth, and a new
protocol starts with a crowd of ~zero. From a cold start, with the gating
dependencies (KYC partner, integrators, legal), the realistic 12–18-month outcome is
**single-digit-millions cumulative settlement**, not $2.5B/yr.

**Revenue, reconciled (this closes the 10× gap between our two analyses):**

- **Year-1 cash is the beachhead, not the pool.** Grants + the ruler-as-compliance
  API + paid attestations: **~$65–250K** (the sourced research figure). Pool fees are
  a rounding error until the crowd exists.
- **Pool fees ramp with the anonymity set.** At a **0.1% fee** (inside the 0.05–0.3%
  relayer benchmark), $100K/day of confidential settlement = **$100/day (~$36K/yr
  run-rate)**; $500K/day = **~$180K/yr**. Reaching Railgun's ~$4.4M/day (a multi-year
  effort there) would imply ~$1.6M/yr at 0.1% — that is the **year 2–3** prize, and
  only if the crowd scales, **not** a year-1 number.

**The earlier "$1.2M+ in year 1" assumed $2.5B/yr of pool volume from day one — i.e.
it assumed the cold-start away.** The honest year-1 is beachhead-driven low-hundreds-
of-K; the $1M+ is a year-2–3 outcome contingent on the anonymity set scaling.

## The one risk that governs all of it

**Cold-start.** Confidentiality needs a crowd; a solo operator cannot fake one (the
ruler would prove `effective-k ≈ 1`), and the anonymity set is the binding constraint
on both privacy and volume. **Named failure mode:** ship the tech, but with a thin
crowd it is too small to be private and too compliance-ambiguous for institutions —
capturing *neither* the retail-privacy crowd *nor* the institutional-settlement
crowd. **Mitigation:** the ICP is chosen to import a crowd on day one (an aggregator
with KYC'd business clients — see [ICP.md](ICP.md)); the beachhead (ruler API)
bills while the crowd forms; and the target is stated as a measurable anonymity-set /
$-per-day, so progress is falsifiable rather than hidden behind a denominator.

## What is deck-safe vs. what to cut

- **Use:** the ACM MEV number ($7.7M/4mo, peer-reviewed — the single strongest
  "problem exists" proof); DeFi TVL (~$5.5B, as a range); stablecoin supply
  ($12–14B); the McKinsey B2B $226B/+733%; Railgun as the honest comparable and the
  cold-start proof; the 0.05–0.3% fee benchmark.
- **Cut / never quote as "the market":** the $8–15B/day and $451B perp figures
  (peak-of-cycle, ~45% off-peak); "30–40% institutional" (no verified basis);
  Aztec/Zcash traction (low confidence); Arcium's tx count (compute activity, not
  dollar settlement demand). Quoting any of these is the fastest way to lose a
  sophisticated crypto investor.

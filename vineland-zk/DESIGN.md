# Vineland Confidential Compliance — design

**Hackathon:** Stellar Hacks: Real-World ZK (submissions 2026-06-15 → 2026-06-29 12:00 PST).
**One-liner:** a payer proves on-chain that a USDC payment satisfies a compliance rule *and* was authorized by a registered biometric credential, without revealing the amount, the identity, or which credential — while an authorized regulator (and only them) can later open the amount under legal compulsion. Verified in a Soroban contract.

## Target: top 1%, not just placing

The differentiator is **not** the selective-disclosure concept — that is an active research line (see Prior art). Claiming to have invented it is refutable on sight. The singular, winnable contribution is **deployment**: first to ship auditable confidential compliance on Stellar, verified on **mainnet** (BN254 host functions are live since Protocol 25, Feb 2026), inside a real payment product, grounded in a *named* regulatory rule (BCB Res 561), with an honest "unaudited, not for real funds" disclaimer. The papers are designs and prototypes; almost none are deployed, none on Stellar.

Discipline note: top 1% here is one singular thing nailed, not features stacked. The failure mode is scope creep producing a broken demo (= bottom 50%). Core conceptual bet: selective disclosure with a regulator key. Execution flex: mainnet verify. Everything else stays minimal.

## Why ZK is structural (not decorative)

The product is *prove-without-revealing*. Remove ZK and it is impossible, not merely less private:
a regulator wants assurance a payment is compliant; putting the amount and parties on a public
ledger to show it is a privacy and competitive disaster. ZK is the only thing that resolves the tension.
This is the property a ZK-hackathon judge looks for first.

## What the proof asserts

Private inputs: `nullifier`, `secret`, `amount`, `kyc_secret`, Merkle path (siblings + bits).
Public inputs: `root` (registered-credential set), `nullifier_hash`, `threshold`.

Statement:
- `leaf = H( H(nullifier, secret), kyc_commitment )` — binds biometric credential + KYC into one leaf
- `leaf ∈ Merkle(root)` — credential is registered (anonymous authentication)
- `nullifier_hash = H(nullifier, 0)` — anti-reuse
- `amount <= threshold` — compliance rule, amount never revealed

H = Poseidon2 (ZK-friendly, native on Stellar since Protocol 25 "X-Ray").

## Biometric protection (the added requirement)

WebAuthn/passkey biometrics never leave the device enclave; only a signature does. "Protecting it with ZK"
here means **anonymous credential authentication**: prove the paying credential is in the registered set
(Merkle membership) and emit a one-time nullifier, so no observer learns *which* user paid, and a proof
can't be replayed. The biometric credential is bound into the leaf at registration via a Poseidon commitment.

Chosen path **(b): commitment + nullifier**, not (a) in-circuit P-256 ECDSA verification.
Rationale: WebAuthn uses ECDSA over secp256r1 (P-256). Verifying a P-256 signature *inside* a Noir circuit
over BN254 is non-native field arithmetic, historically millions of constraints — the single biggest threat
to a 14-day timeline. (a) is a stretch goal for the day-28 buffer, not the main path.

## DIRECTION 2026-06-14: top-1% = "provable bounded autonomy" (measured on-chain)

The singular concept: one succinct ZK proof that a BATCH of the Vineland agent's payments
all obeyed its mandate (per-payment cap, recipient allowlist, monthly aggregate cap),
revealing none of the payments. The cryptographic answer to "can I trust an AI with my
company's money?" — and it builds on Vineland's existing "spend limit proven on-chain" copy.

Circuit `circuits/mandate.circom` (8 payments, allowlist 4, no Poseidon — keeps witness
generation curve-agnostic, sidestepping the BN254-vs-BLS12-381 Poseidon mismatch that blocked
the Merkle variant). Validated end-to-end 2026-06-14: circom 2.2.3 compile (670 constraints) →
snarkjs Groth16/BLS12-381 setup → prove → off-chain `OK!` → **verifies in the Soroban
groth16_verifier at 61,384,590 instructions** (15% of 400M; 61% of old 100M). 8 amounts +
recipients stayed private; public = [ok, perPaymentCap, monthlyCap, allowed×4].

**Key property: on-chain verify cost is ~constant in batch size.** Payments are PRIVATE inputs,
so they don't enter the verifier cost (which scales only with public-signal count). Proving 1000
payments verifies on-chain at the same ~61M as 8 — only off-chain proving time grows. Pitch:
"one proof, verified for ~cents on-chain, that the agent made N payments this month and not one
broke the rule." Measured, not promised.

## LIVE ON TESTNET (2026-06-14)

The selective-disclosure mandate proof (`mandate_sd`) verifies on the real Stellar **testnet**, returns `true`:
- Contract: `CD5TQEJMZ6N6U5XFF66POD5EOMRZGRMMP5CSKKLZEUQRNZ64TM4UHUOA`
- Verify tx: https://stellar.expert/explorer/testnet/tx/c7cfaa3c04013629e2c351547c1fd6a71b35f5ffda3f8e80b71b047624a3ee0b
- Contract source: `contract/src/lib.rs` (generic BN254 Groth16 verifier, all inputs as raw bytes). Deploy/invoke scripts: `contract/deploy_testnet.sh`, `contract/deploy_mainnet.sh` (mainnet NOT run — needs a funded mainnet key + operator consent).

## FULL TOP-1% CORE — measured on-chain (2026-06-14)

Three circuits, all verified on-chain with measured instruction counts:

| circuit | what it proves | on-chain verify | curve/verifier |
|---|---|---|---|
| `compliance.circom` | amount ≤ threshold, amount hidden | 44.4M | BLS12-381 (soroban-examples) |
| `mandate.circom` | batch of 8 payments obey mandate (cap+allowlist+monthly), payments hidden | 61.4M | BLS12-381 |
| `mandate_sd.circom` | mandate + monthly total encrypted under regulator's Baby Jubjub key (exponential ElGamal), proven in-circuit | **44.6M** | **BN254** (Nethermind verifier) |

`mandate_sd` is the submission core: bounded-autonomy + selective disclosure in ONE Groth16/BN254 proof, verified on-chain at 44.6M instructions (11% of the 400M budget; fits the old 100M). 8 amounts + 8 recipients + the real monthly total (1450) all private; public = [ok, ephemeralKey, encryptedTotal, perPaymentCap, monthlyCap, allowed×4, regPubKey]. Only the regulator (holding Baby Jubjub private key) recovers the total via `total·G = encryptedTotal − d·ephemeralKey`.

Curve decision: **BN254** (X-Ray native). BLS12-381 fought circomlib (BN254-native) on Poseidon and Jubjub twice; BN254 unlocked circomlib + circomlibjs + the ElGamal reference, and measured CHEAPER (base verify 35M vs BLS 41M). G2 byte gotcha for soroban `from_array`: `c1||c0` per Fq2 pair, big-endian (matches Nethermind `serialize_g2_point`).

## PIVOT 2026-06-14: UltraHonk/Noir → Groth16/Circom (measured, on-chain)

Foundation check on day 0 falsified the original plan. Measured on localnet:

| verifier | on-chain verify cost | % of 400M budget |
|---|---|---|
| UltraHonk/BN254 (`indextree/ultrahonk_soroban_contract`) | **396,014,477** instr (simulateTransaction) | 99% |
| Groth16/BLS12-381 (`stellar/soroban-examples/groth16_verifier`) | **40,973,832** instr (test budget) | 10% (fits even the old 100M budget) |

UltraHonk left ~1% headroom *for a trivial circuit* — selective-disclosure public inputs would push it over 400M and it would not verify. Groth16 is ~9.7x cheaper, fits the old 100M budget (so the build does not depend on SLP-0004 being voted in on mainnet), and leaves ~359M of headroom. Each extra public input ≈ +2.5M (one G1 mul), so dozens of public inputs fit. **Pivot committed.** Cost of pivot: Circom instead of Noir, trusted setup per circuit, circuit rewritten — hours, and circomlib (Poseidon/Merkle/comparators) + `Shigoto-dev19/ec-elgamal-circom` cover the pieces.

Honesty note: the two numbers came from different measurement paths (UltraHonk = on-chain simulateTransaction; Groth16 = unit-test budget). The 9.7x gap is robust to that difference. On-chain apples-to-apples confirm for Groth16 was offered and waived by operator; still worth doing before final submission.

## Architecture (post-pivot)

- **Circuit** (Circom 2.x, `-p bls12381`): `amount`, `kyc_secret`, `nullifier`, `secret`, Merkle path (private); `threshold`, `root`, `nullifier_hash`, regulator ciphertext (public). Constraints: `amount <= threshold` (circomlib comparators), `leaf ∈ Merkle(root)` (Poseidon), `nullifier_hash = Poseidon(nullifier,0)`, and exponential-ElGamal encryption of `amount` under the regulator key (selective disclosure).
- **Proving** (off-chain): snarkjs Groth16 over BLS12-381 (ptau bls12-381 → zkey → proof).
- **Verifier** (Soroban, Rust): fork `stellar/soroban-examples/groth16_verifier` (BLS12-381, ark-bls12-381). On success, stamps the linked Vineland charge as compliant.
- **Demo**: same payment shown twice — without ZK the ledger leaks amount+identity; with ZK the ledger shows
  only `✓ compliant` and a nullifier, yet the rule is still verifiable. The contrast *is* the demo.

## Verified facts (as of 2026-06-14, measured not promised)

- Toolchain on host: git ✓, cargo/rustc 1.95 ✓, stellar-cli 26.0.0 ✓, node v22 ✓, docker 28 ✓, snarkjs 0.7.6 ✓, circom 2.2.3 ✓ (at `~/.cargo/bin/circom`; legacy 0.5.46 shadows it on PATH — call by full path), circomlib ✓.
- Localnet (`stellar/quickstart:future`, 1.4GB) runs; **friendbot proxy on host:8000 returns 502 — fund via internal port 8002** (`docker exec stellar-local curl http://localhost:8002/?addr=<G...>`).
- UltraHonk path fully exercised end-to-end (proof gen in pinned container, deploy, verify) before being rejected on cost. Groth16 example builds + verifies (test green, 41M instr).
- **REAL compliance circuit validated end-to-end on the Groth16/Circom/BLS12-381 path (2026-06-14):** circom 2.2.3 compile → snarkjs Groth16 setup → prove → off-chain verify `OK!` → **verifies in the Soroban groth16_verifier contract at 44,375,625 instructions** (11% of 400M; 44% of the old 100M). `amount=100` stayed private, public inputs `[ok=1, threshold=1000]`. Prediction was ~43.4M; measured 44.4M (~2% error — the pivot reasoning held, unlike the UltraHonk estimate). Each extra public input ≈ +2.46M, so the full circuit (Merkle root + nullifier + threshold + ElGamal ciphertext, ~6-8 public inputs) projects to ~60-65M — comfortably under even the old 100M budget.
- Curve choice: **BLS12-381** (native since Protocol 22; matches the official example and the measured 41M number). Not BN254.

## Success metrics (two gates, both first-class)

1. **On-chain verify cost** < ~150M instructions (< 40% of the 400M SLP-0004 budget). Decides whether the verifier is viable at all.
2. **Client-side proving latency** < ~2-3s in-browser. The demo's emotional core is the validated "one finger, 10 seconds" USDC move (live reaction at Stellar 37 Graus). ZK proving must stay invisible inside that window. If browser proving (bb.js/wasm) blows past it, the magic dies and judges feel it. Named failure mode for this demo specifically. Mitigation: keep circuit small; measure early. Fallback prover service risks the non-custodial property — handle with care.

Positioning guardrail: do **not** claim "first biometric on Stellar" — passkey-kit (SDF / Protocol 21) is the primitive and the claim is refutable. The novelty is the ZK layer over the touch (anonymous auth + compliance proof), not the biometric itself.

## Build environment fixes (captured for the fork)

- Proving container needs `jq` (build_circuits.sh uses it; absence fails the prove step silently-ish).
- `stellar-cli 26` requires `overflow-checks = true` in `[profile.release]` or `contract build` refuses.

## Open / unverified (resolve during build)

- Full UltraHonk verify instruction count on testnet. Falsifiable check: < 150M instructions (< 40% of the
  400M SLP-0004 budget). If it exceeds, drop the Merkle/KYC layer to a simpler threshold-only statement.
- Whether the 400M instruction budget is voted in on the target network (testnet usually ahead).
- Exact resource fee in XLM/stroops — get from `simulateTransaction` on target network.
- Nothing ZK is audited on Stellar mainnet today. Scope submits as **"verifies on testnet, works"**, not mainnet-audited.

## Judge alignment (why this wins, not just places)

- **SDF's official privacy direction is our exact angle.** Stellar docs (developers.stellar.org/docs/build/apps/privacy) state SDF pursues "configurable, **compliance-ready** privacy" and "privacy that remains **auditable and compliant**." Protocol 25's framing: "on-chain privacy that balances compliance with data confidentiality." The judges (SDF + Ash Francis) have publicly named auditable-compliant privacy as the direction. We build precisely that. Existing Stellar projects do privacy pools (the opposite end).
- **Positioning vs ASP pools:** existing Stellar pools use Association Set Providers — *prove your funds aren't from a bad set* (exclusion proof). That gives the public an exclusion guarantee but gives the regulator **no recourse**. Selective disclosure gives privacy to the public **and** legal recourse to the regulator. We occupy the hole ASPs cannot fill — which is what "compliance-ready" actually requires.
- **Empirical winning pattern (DoraHacks ZK Gaming winners):** working end-to-end demo in the video (wallet → action → proof → **live on-chain verification**), ZK as a *core* mechanic (not mentioned/bolted on), real-world practicality, clear ecosystem fit. Our four locks map onto this exactly.

## Competitive position (landscape scan 2026-06-14)

- **The gap:** every ZK project on Stellar scanned is a privacy *pool* (hide everything) — PrivacyLayer (several un-deployed clones), NethermindEth/stellar-private-payments (WIP), ymcrcat/soroban-privacy-pools (Groth16/BLS12-381 prototype), xcapit/openzktool (deployed on **testnet**, most mature — the one to study). **None does auditable/selective-disclosure compliance.** Our position is unoccupied on Stellar.
- **Cross-chain validation:** auditable compliance with a regulator key is being built on Solana (zksettle), Ethereum (complyr/FHE, EIP-8287), HashKey (Nexash) — proven desirable, serious teams on it, **none on Stellar**. Thesis: auditable confidential payments are happening on every chain except the one that moves real-world money. Be first there.
- **Forkable de-risk:** exponential ElGamal in Noir already exists — `jat9292/noir-elgamal` (Baby Jubjub, subgroup checks, key derivation) and `ewynx/noir-elgamal` (BN254 field, homomorphic add). The riskiest top-1% piece has a reference implementation; fork, don't write from scratch.

## Prior art (grounds the design; we deploy, not invent)

- **Haults** (arXiv 2511.17842, Nov 2025) — closest template. Additive-homomorphic ElGamal over an elliptic curve; each transfer carries the amount encrypted under the auditor's public key `pk_D`, decryptable only by `sk_D`; ZK proofs enforce the ciphertext matches the amount used. This is selective disclosure with an auditor key, validated as a 2025 design.
- **SeDe** (arXiv 2311.08167) — Selective De-Anonymization. Double encryption `E_G(E_R(·))` + proof the encryption was done correctly; de-anonymization gated by a **quorum of guardians**, not a single god-key. Source of our threshold upgrade.
- **zkFi** (arXiv 2307.00521) — privacy-preserving + regulation-compliant transactions via ZK selective disclosure.
- **VPAS** (arXiv 2403.15208) — chose **exponential ElGamal** specifically to minimize in-circuit overhead vs Paillier. Evidence our amount-encryption path is cheap.
- **Plaintext-Scale Fair Data Exchange** (arXiv 2506.14944) — proving an ElGamal ciphertext encrypts the same value as a commitment is **O(λ)** circuit complexity.
- **zkTax** (arXiv 2311.13008), **Zef** (arXiv 2201.05671) — adjacent verifiable-disclosure / private-payment designs.

## Selective disclosure — chosen primitive

**Exponential ElGamal** over the proving curve: encrypt `amount` as a point derived from `g^amount` under the regulator key. In-circuit, prove the ciphertext encrypts the same `amount` used in the `amount <= threshold` check. Cost is O(bitlength of amount) constraints (thousands for a 32–64-bit amount), comfortably inside the 400M budget — not the millions of constraints that killed in-circuit P-256.

Failure mode (named): exponential ElGamal decryption is a discrete log, feasible only for a bounded plaintext range (baby-step/giant-step). So `amount` must be range-capped. This coincides with the compliance reality (reporting thresholds are bounded), so the crypto constraint and the product constraint are the same — no extra cost.

Shippable version: single auditor key. Stretch (day-28 buffer): N-of-M guardian quorum per SeDe, the abuse-resistant design.

## 14-day plan

| dates | deliverable | risk |
|---|---|---|
| 06-15→16 | foundation falsifiable check: example circuit prove + on-chain verify, measure instructions | front-loaded; gates everything |
| 06-17→19 | extend `tornado_classic` circuit (threshold + KYC binding), off-chain proving | VK/proof format |
| 06-20→22 | Soroban verifier verifying the extended circuit's proof on testnet | tooling is PoC — highest risk |
| 06-23→24 | wire to Vineland charge path (stamp charge compliant) | reuses existing rail, low |
| 06-25→26 | double-payment demo + ledger-contrast UI | — |
| 06-27 | record 2–3min video, README, public repo | — |
| 06-28 | buffer for what breaks; submit before 06-29 16:00 BRT | — |

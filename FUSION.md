# Vineland — confidential, compliant settlement on Solana

*The commercial fusion of two of the author's own stacks: **riverrun** (behavioral
privacy — hide **who** acted, post-quantum) and **slippay/vineland-zk**
(confidential compliance — hide **how much / to whom**, with KYC and
selective disclosure). One product, non-custodial, on Solana.*

---

## The market pain

A company or fund that transacts on-chain broadcasts its entire operation to
competitors and to chain-analysis: **who** it pays, **how much**, **to whom**, in
**what pattern**. On a public ledger that is a standing intelligence leak — payroll,
supplier terms, treasury moves, trading strategy, all readable forever. The existing
answer, a mixer, is illegal to operate for a fee and taints the funds. So businesses
are stuck between "transparent and exposed" and "private and radioactive."

Vineland is the third option: **on-chain confidentiality that is compliant by
construction** — hidden from the public, provably clean, and disclosable to a
regulator under lawful process. Efficiency without broadcasting the business.

## What it is, in one paragraph

Vineland is a **non-custodial** settlement layer that a business or protocol
integrates on Solana. Participants are **KYC'd once** by a licensed issuer (funds
and identity never touch Vineland). When they transact through the layer:

1. **who acted is hidden** from the public (riverrun's behavioral privacy: commit →
   relayer-executed, the actor's key is absent from the action);
2. **how much / to whom is hidden** from the public (confidential amounts and
   recipients, slippay-zk's mandate proofs);
3. **the transaction is provably compliant** — every participant proved, in
   zero-knowledge, that they are registered, of-age, and non-sanctioned
   (slippay-zk's KYC circuit), and the amount/total is **encrypted to the
   regulator's key** so only a lawful authority can decrypt it (selective
   disclosure).

The public sees that a compliant settlement happened, and nothing about who, how
much, or to whom. Vineland never holds the funds — so it is **infrastructure, not a
money transmitter**, and a usage fee on the software is legal, where a fee on
custodied anonymized funds is not.

## The four properties and which stack provides each

| property | hidden from | provided by | maturity |
|---|---|---|---|
| **who acted** | the public | riverrun behavioral cloak (commit/relayer-execute) | working (devnet), PQ |
| **how much / to whom** | the public | slippay-zk `mandate` / confidential amounts | mainnet-proven (Stellar), classical |
| **is a real human, clean** | nobody (proven, PII hidden) | slippay-zk `kyc` (+ riverrun `riverrun_join` pool-binding) | mainnet-proven (Stellar), classical |
| **disclosable to regulator** | the public, not the regulator | slippay-zk `mandate_sd` (ElGamal to reg key) | mainnet-proven (Stellar), classical |
| **the crowd is actually private** | — (measured, not claimed) | riverrun ruler (`audit`/`preflight`) | working, non-custodial |

The ruler is the trust layer: Vineland can **prove** its anonymity set is real, which
no mixer does — and that proof is the sales asset and the compliance evidence.

## The non-custodial model (why it stays legal and solo)

Vineland is deliberately **not a VASP for its own operation**: it never takes custody
of user funds, and identity/KYC is issued by a **licensed partner** (e.g. 4P /
Etherfuse), not by Vineland. Funds move between the participants' own wallets and a
shared, program-controlled settlement PDA only under the participants' own proofs;
Vineland provides the privacy + compliance *software* and charges for its use. This
is the same posture that kept Slippay non-VASP: obligations sit with the custodial /
KYC partner, not the software author. A licensed-mixer-with-fee is the prosecuted
model; non-custodial compliant infrastructure is not.

> **Legal is not settled by this doc.** The fee model, the non-custodial boundary,
> and the BCB/VASP posture need a lawyer's sign-off before any mainnet fee is taken.
> This is the design intent, not legal advice.

## The honest post-quantum boundary

riverrun's differentiator is that its **anonymity is post-quantum** (hash-based
STARK, no elliptic curves) — a permanent public ledger cannot be harvested now and
de-anonymized later. That property holds for the **who-acted** layer.

The **compliance layer is classical**: slippay-zk is Groth16 over BN254, and the
selective-disclosure ciphertext is ElGamal over Baby Jubjub — both quantum-breakable,
both needing a trusted setup. Precise claim: *the public-facing anonymity (who acted)
is post-quantum; the KYC and regulator-disclosure layer is classical, on the roadmap
to a post-quantum port.* The disclosure channel is meant to be decryptable by an
authority anyway, so its long-term secrecy matters least — but we never claim the
whole stack is PQ.

## Revenue

A **per-settlement fee** on volume routed through the layer, legal because the layer
is non-custodial infrastructure with KYC'd, compliant participants — not an
anonymizer holding funds. Secondary: **licensing** to protocols that embed it, and
the **ruler as a paid compliance API** (the beachhead that bills in weeks and reaches
the same buyers). Sole-owner, high-margin: it is software and protocol fees, not a
staffed financial institution.

## Module map (where the code lives)

```
vineland-solana/programs/         the Solana settlement program:
                                    - riverrun behavioral core (commit / relayer-execute / vault CPI)
                                    - KYC-gated join (verify riverrun_join proof at commit)
                                    - confidential-amount settlement (verify mandate proof at execute)
                                    - Groth16 verifier on Solana (alt_bn128), for the compliance proofs
vineland-zk/circuits/             the proofs:
                                    - riverrun_join.circom   (KYC-gate + pool external nullifier)  [NEW, from riverrun]
                                    - kyc.circom             (registered / of-age / non-sanctioned) [slippay]
                                    - mandate_sd.circom      (confidential total + regulator ElGamal) [slippay]
crates/riverrun-trace (import)    the ruler: audit / preflight / scan / watch — the trust + compliance API
vineland/apps, sdk                product surface: SDK for integrators, dashboard, KYC partner hooks
```

## Build order (phases)

- **Phase 0 — foundation (this doc).** The thesis, the non-custodial+compliance
  model, the honest PQ boundary, the module map.
- **Phase 1 — KYC-gated join.** `riverrun_join.circom` produces a real, verifying
  proof (registered + of-age + non-sanctioned + pool-bound); the Solana program
  verifies it at `commit` so only KYC'd credentials enter the crowd. *(circuit
  written; needs the Groth16-on-Solana verifier wired.)*
- **Phase 2 — confidential settlement.** Wire the behavioral cloak's `execute`
  (already moves value from the vault) to a confidential-amount proof, so amount and
  recipient are hidden while the payout stays unlinkable.
- **Phase 3 — selective disclosure.** *(built.)* The M-of-N committee holds the
  regulator-disclosure key by threshold (Shamir-shared ElGamal over Baby Jubjub):
  lawful disclosure requires a quorum, not a single key, so no single party — not
  even the operator — can de-anonymize. Proven in `vineland-zk/threshold_disclosure.js`:
  any 2-of-3 quorum recovers the disclosed value, a lone member cannot. Classical
  (Baby Jubjub), trusted-dealer sharing; full DKG + PQ port are roadmap.
- **Phase 4 — the ruler as the trust/compliance API + SDK for integrators.**

## Honest risks

1. **Bootstrap / crowd.** Confidentiality needs participants; a solo operator cannot
   fake a crowd (the ruler would prove it fake). This is a distribution problem, not a
   code one — the KYC partner and first integrator are the unlock.
2. **Legal boundary.** The non-custodial + fee posture must survive a lawyer's review
   and BCB/VASP scrutiny before any mainnet fee. Get sign-off first.
3. **Compliance layer is classical.** Groth16/ElGamal is not PQ; stated plainly above.
4. **Exchange acceptance.** Even KYC'd confidential-pool outputs may face
   chain-analysis friction; the ruler's clean-set proof is the mitigation, not a
   guarantee.
5. **Two-chain integration.** slippay-zk is Stellar-proven; the circuits are chain-agnostic
   (Circom/Groth16 runs on Solana via alt_bn128), but the verifier port is real work.

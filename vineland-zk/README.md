# Vineland ZK — Confidential Compliance for Agent Payments

**A payer proves on-chain that a batch of AI-agent payments obeyed its mandate — without revealing the amounts or recipients — while an authorized regulator, and only them, can later decrypt the monthly total.** Verified by a Groth16 verifier on Stellar.

Built for [Stellar Hacks: Real-World ZK](https://dorahacks.io/hackathon/stellar-hacks-zk/detail) (2026-06-15 → 06-29).

---

## Why ZK is structural here, not decorative

The product is *prove-without-revealing*. A regulator wants assurance an autonomous agent's payments are compliant. Putting the amounts and counterparties on a public ledger to show it is a privacy and competitive disaster. ZK is the only thing that resolves the tension — remove it and the property is impossible, not merely less private.

This is "can I trust an AI agent with my company's money?" answered cryptographically: the agent proves it stayed inside the owner's mandate, and the regulator gets selective disclosure — nothing more.

## What the proof asserts

One Groth16 proof over a batch of payments. The **rule is public**, the **payments are private**:

- each `amount ≤ perPaymentCap`
- `sum(amounts) ≤ monthlyCap`
- every recipient is in the allowlist
- the monthly total is ElGamal-encrypted under the **regulator's** public key — only the regulator's private key recovers it (selective disclosure)

Private inputs: the 8 amounts, the 8 recipients, the real total. Public: the mandate (caps/allowlist) + the ciphertext + `ok`. Hash = **Poseidon2** (native on Stellar since Protocol 25 "X-Ray").

## Working proof (measured, not promised)

| circuit | proves | on-chain verify | status |
|---|---|---|---|
| `circuits/compliance.circom` | `amount ≤ threshold`, hidden | 44.4M instr | local ✓ |
| `circuits/mandate.circom` | 8 payments obey mandate, hidden | 61.4M instr | local ✓ |
| `circuits/mandate_sd.circom` | mandate + total encrypted to regulator (ElGamal) | **44.6M instr (11% of budget)** | **live on Stellar MAINNET ✓** |

- **Mainnet verifier (live):** [`CBDS2YSLATINQVUDG5Y5HV4KQBEAVFDRPEINVEUTYSX3CZZQKBY5U3FE`](https://stellar.expert/explorer/public/contract/CBDS2YSLATINQVUDG5Y5HV4KQBEAVFDRPEINVEUTYSX3CZZQKBY5U3FE) — `verify(real proof) = true` (reproduce: `bash verify_mainnet.sh`).
- Earlier testnet verifier: `CD5TQEJMZ6N6U5XFF66POD5EOMRZGRMMP5CSKKLZEUQRNZ64TM4UHUOA` ([verify tx](https://stellar.expert/explorer/testnet/tx/c7cfaa3c04013629e2c351547c1fd6a71b35f5ffda3f8e80b71b047624a3ee0b)).
- BN254 host functions are native on mainnet since Protocol 25 (X-Ray), so this verify runs on-chain at the measured ~44.6M instructions.

## Proof-of-KYC (Vector 2) — also live on mainnet

A second circuit (`circuits/kyc.circom`) proves, with no PII revealed, that a user
is a **registered, of-age, non-sanctioned** human — composing with the mandate proof
into one selective-disclosure story (verified human + payment within mandate).

| check | proves | |
|---|---|---|
| Merkle membership | credential is in the issuer's registered set | anonymous |
| `currentYear − birthYear ≥ minAge` | of age | birthYear hidden |
| `sanctionId ∉ public sanctions set` | non-sanctioned | id hidden |
| `nullifierHash = Poseidon(nullifier)` | anti-reuse | |

Verified end-to-end **on Stellar mainnet** against the same generic verifier
([`CBDS2YSL…`](https://stellar.expert/explorer/public/contract/CBDS2YSLATINQVUDG5Y5HV4KQBEAVFDRPEINVEUTYSX3CZZQKBY5U3FE)),
[tx `83ee1697…`](https://stellar.expert/explorer/public/tx/83ee1697486a24c3fd389b812f00c5693659cc3837f6fa653c42b62afc1751d6) → `verify = true`.
Witness generation **rejects** a minor and a sanctioned id — the proof is load-bearing.
In production a licensed partner (4P / Etherfuse) issues the credential; Vineland
never stores the CPF, only the commitment. 6497 constraints, same BN254/Groth16/
Poseidon stack as the mandate proof.

## Engineering decisions (with evidence)

- **Groth16, not UltraHonk.** UltraHonk verify measured **396M instructions (99% of the budget)** — a dead end pre-Protocol-26. Groth16 lands at ~44M. The reason Protocol 26 shipped CAP-0080 (9 BN254 host functions) is precisely that UltraHonk was too expensive; this circuit reproduces that motivation independently and stays native via Circom today.
- **BN254, not BLS12-381.** Circomlib-native (Poseidon, Baby Jubjub) and measured cheaper (35M vs 41M base). X-Ray made BN254 native on mainnet.
- **ElGamal selective disclosure over Baby Jubjub** — encrypts the total under the regulator's pubkey; only their key recovers it via baby-step/giant-step.

## What this is, and isn't

This is **mandate compliance for agent payments** — not a shielded pool, not an age-gate. Selective disclosure with a regulator view key is known prior art (Zcash ZIP-310, Aztec). The contribution here is *instantiating* it — ElGamal-on-Baby-Jubjub bound to a Groth16 compliance proof — inside a real payment rail (Vineland, a non-custodial Pix↔USDC dollar account live on Stellar mainnet), grounded in a named rule (Brazil's BCB Resolution 561).

## Honest status

- Verifier verifies; **mandate enforcement in the live charge path is gated pending a security audit.**
- Trusted setup is single-contributor (fine for a hackathon with this disclaimer; production wants a ceremony).
- Not for real funds yet.

## Reproduce

```bash
# circuits -> proof (BN254)
~/.cargo/bin/circom circuits/mandate_sd.circom --r1cs --wasm --sym -o build_sd
cd build_sd && bash run.sh         # setup + prove + offchain verify
# on-chain instruction measurement
cd ref-bn254 && cargo test -p groth16-verifier vineland_sd_onchain -- --nocapture
# testnet deploy + live verify (free)
cd contract && ./deploy_testnet.sh
```

## Context

External validation that this problem is real and newly-named:
- "Zero-Knowledge Mandates" — *Computer Fraud & Security*, Jan 2026
- Amex, "Trust Without Disclosure"
- Google Agent Payments Protocol (AP2)

---

*Part of [Vineland](https://app.vineland.cc). Unaudited. Demo keys only.*

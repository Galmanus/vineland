# Vineland ZK — handoff (2026-06-14)

Built autonomously while you were away. Everything below is **measured, not promised.**

## TL;DR

A ZK adaptation of Vineland for the Stellar Hacks: Real-World ZK hackathon (opens 06-15, closes 06-29).
Core concept — **provable bounded autonomy + selective disclosure**: one Groth16 proof that the Vineland
agent's batch of payments all obeyed its mandate (per-payment cap, allowlist, monthly cap) AND that the
monthly total is encrypted under a regulator's key — revealing none of the payments. The cryptographic
answer to "can I trust an AI with my company's money?", which is your existing B2B copy ("spend limit
proven on-chain") turned into actual proof.

**It verifies on the real Stellar testnet, returns `true`, at ~44.6M instructions (11% of budget).**

## What's done (measured)

| circuit | proves | on-chain verify | status |
|---|---|---|---|
| `circuits/compliance.circom` | amount ≤ threshold, hidden | 44.4M | local test ✓ |
| `circuits/mandate.circom` | 8 payments obey mandate, hidden | 61.4M | local test ✓ |
| `circuits/mandate_sd.circom` | mandate + total encrypted to regulator (ElGamal) | **44.6M** | **LIVE on testnet ✓** |

- **Live testnet contract:** `CD5TQEJMZ6N6U5XFF66POD5EOMRZGRMMP5CSKKLZEUQRNZ64TM4UHUOA`
- **Live verify tx:** https://stellar.expert/explorer/testnet/tx/c7cfaa3c04013629e2c351547c1fd6a71b35f5ffda3f8e80b71b047624a3ee0b
- Privacy: 8 amounts + 8 recipients + the real total (1450) are all private. Public = mandate + ciphertext + ok.

## Key decisions (with evidence)

- **Groth16, not UltraHonk.** UltraHonk verify measured 396M instructions (99% of budget) — dead end. Groth16 ~44M. Measured both.
- **BN254, not BLS12-381.** BLS fought circomlib (BN254-native) on Poseidon and Jubjub twice. BN254 unlocked the whole toolchain AND measured cheaper (35M base vs 41M). X-Ray made BN254 native on mainnet.
- **ElGamal selective disclosure over Baby Jubjub** (from `Shigoto-dev19/ec-elgamal-circom` pattern). Encrypts the total under the regulator's pubkey; only the regulator's private key recovers it.
- Gotcha log (so you don't re-hit them): pin noir/bb if you ever revisit UltraHonk; `overflow-checks=true` for stellar-cli 26; G2 byte order for soroban `from_array` is `c1||c0` per Fq2 pair, big-endian.

## How to reproduce

```bash
# circuits -> proofs (BN254)
~/.cargo/bin/circom circuits/mandate_sd.circom --r1cs --wasm --sym -o build_sd   # default = bn128
cd build_sd && bash run.sh         # setup + prove + offchain verify (reuses ../build_bn/pot_final.ptau)
# on-chain (local instruction measurement)
cd ref-bn254 && cargo test -p groth16-verifier vineland_sd_onchain -- --nocapture
# testnet deploy + live verify (free)
cd contract && ./deploy_testnet.sh
```

## What's left (execution, not technical risk)

1. **Wire to the real Vineland charge path.** The agent's actual payments feed the circuit's private inputs. Currently demo values.
2. **Demo (2–3 min video, required).** Lead with the one-tap UX, then show the same batch twice: public ledger sees only "✓ compliant + ciphertext"; regulator decrypts the real total. The contrast is the demo.
3. **Public repo (required).** This dir is a local git repo but has **no remote** — create the GitHub repo and push for the submission.
4. **Mainnet (optional flex).** `contract/deploy_mainnet.sh` is ready but NOT run. It needs a funded mainnet key + `VINELAND_MAINNET_GO=1`. Real money, unaudited — your call, your keys.
5. **Decrypt demo helper.** A small script showing the regulator recovering 1450 from the ciphertext (`total·G = encryptedTotal − d·ephemeralKey`, then baby-step/giant-step) would make the selective-disclosure claim tangible in the video.

## Honest caveats

- Unaudited. Testnet only so far. Do not protect real funds.
- Allowlist is a small public set (4); production wants a Merkle root (needs the BLS/Poseidon-witness path sorted, or Poseidon over BN254 via circomlibjs — now unblocked).
- Trusted setup is single-contributor (fine for a hackathon with an honest disclaimer; production wants a ceremony).
- The reference repos under `ref-*` had their `test.rs` overwritten for measurement; originals are at `test.rs.orig`.

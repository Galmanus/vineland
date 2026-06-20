# Vineland

**A non-custodial dollar layer for Brazil.** Receive, hold, and grow dollars (USDC)
straight from Pix — without a bank in the middle. The money lives in your own
wallet, moved only by your biometrics. Nobody can freeze it, because nobody
custodies it.

Built on Stellar, with zero-knowledge proofs for confidential compliance.

---

## Why

Brazilians want dollars (protection from a currency that erodes) but the path
today costs ~5% (IOF + hidden FX spread), takes days, and runs through custodial
accounts that can freeze or close. Vineland makes the dollar arrive in minutes,
at a transparent fee, in a wallet only you control.

The name is from Thomas Pynchon's *Vineland* — a refuge that stays its own.

---

## What it does

- **Receive in dollars** — point your Pix key once; every incoming Pix becomes USDC in your wallet.
- **Hold & grow** — keep dollars inside Pix; idle balance can earn (yield), framed against a savings account that shrinks.
- **Pay & B2B payout** — send/receive abroad, settle in minutes at a transparent fee, via API for marketplaces and companies.
- **Biometric, no seed phrase** — a passkey wallet; your face/fingerprint signs, nothing to memorize or lose.
- **Provable bounded autonomy** — an AI agent can pay your bills only inside the rules you set, and *prove* on-chain it obeyed, without revealing amounts or recipients.

---

## Architecture

```
apps/web            React/Vite — landing, funnel, app (cofrinho, receber, empresas)
supabase/functions  Deno (Hono) API — orders, x402, ramp, billing, merchant auth
supabase            Postgres + auth + 14 migrations + RLS
apps/listener       chain watcher — settles orders, writes receipts
apps/*-connector    Shopify / VTEX store connectors
contracts/          Soroban (Stellar): checkout, smart-wallet, receipt, subscription
../vineland-solana  Anchor program: vineland_mandate (bounded-autonomy moat)
../vineland-zk      Circom/Groth16 circuits + Soroban verifier
```

Stack: pnpm workspace · Node 22 · Deno · Rust/Soroban · Anchor · Circom + snarkjs.

---

## The ZK layer (`vineland-zk`)

Confidential compliance for agent payments — the differentiated piece:

- **mandate** — one proof that a batch of agent payments all stayed within caps + allowlist, amounts and recipients hidden, monthly total ElGamal-encrypted to a regulator key (selective disclosure).
- **kyc** — proves a user is registered + of-age + non-sanctioned, with no PII revealed.

Both verify on a generic Groth16/BN254 verifier on **Stellar mainnet**. Poseidon2,
Protocol 26. See `vineland-zk/README.md` for circuits, the verifier, and reproduce steps.

---

## Quick start

```bash
pnpm install
pnpm -r build

# local DB
pnpm supabase:start

# env (fill with your own values — see INFRA.md)
cp vineland/.env.example vineland/.env.local
cp vineland/apps/web/.env.example vineland/apps/web/.env.local

# web
cd vineland/apps/web && pnpm dev
```

Full provisioning (your own accounts, contracts, domain, go-live order):
**[INFRA.md](./INFRA.md)**.

---

## Status

Working code; provision your own infra to run it (see INFRA.md). The licensed
Pix on/off-ramp is a commercial agreement, not code — it's the one piece that
closes the Pix↔USDC loop end-to-end.

ZK: unaudited, demo keys, single-contributor trusted setup. Not for real funds
until audited.

---

## License

Proprietary — © Manuel Guilherme Almeida. All rights reserved.

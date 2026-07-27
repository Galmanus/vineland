# Vineland

**A non-custodial dollar layer for Brazil, built on a privacy stack strong enough
to license.** Receive, hold, and grow dollars (USDC) straight from Pix, no bank in
the middle, and prove every payment is compliant without broadcasting it to the
world. The money lives in your own wallet, moved only by your biometrics. Nobody
can freeze it, because nobody custodies it.

Built on Stellar. Live on mainnet, not a pitch deck: a Groth16 verifier confirming
real compliance proofs today, and a post-quantum identity primitive proved portable
to the same chain this week.

The name is from Thomas Pynchon's *Vineland*: a refuge that stays its own.

---

## Why

Brazilians want dollars, protection from a currency that erodes, but the path
today costs ~5% (IOF plus hidden FX spread), takes days, and runs through
custodial accounts that can freeze or close. Vineland makes the dollar arrive in
minutes, at a transparent fee, in a wallet only you control.

## What it does

- **Receive in dollars.** Point your Pix key once; every incoming Pix becomes USDC
  in your wallet.
- **Hold and grow.** Keep dollars inside Pix; idle balance can earn, framed against
  a savings account that shrinks instead.
- **Pay and B2B payout.** Send and receive abroad, settle in minutes at a
  transparent fee, via API for marketplaces and companies.
- **Biometric, no seed phrase.** A passkey wallet: your face or fingerprint signs,
  nothing to memorize, nothing to lose.
- **Provable bounded autonomy.** An AI agent can pay your bills only inside the
  rules you set, and prove on-chain it obeyed, without revealing amounts or
  recipients.

## What makes it hard to copy: the privacy stack underneath

A payment rail is easy to clone. What is not easy to clone is proving, on a
permanent public ledger, that a payment obeyed the rules without ever putting the
amount, the counterparty, or the actor's identity on that ledger, and doing it in a
way that survives both a regulator's audit and a quantum computer. Vineland's
privacy layer is two pieces, at two different levels of maturity, honestly labeled.

### Live today: confidential compliance (`vineland-zk`)

A Groth16 proof that a batch of payments stayed inside a mandate, per-payment cap,
monthly cap, allowlist, with the monthly total encrypted to a regulator's key so
only lawful authority can ever decrypt it. Not a demo number: a real proof
verifying on **Stellar mainnet** today.

- **Mainnet verifier, live:** [`CBDS2YSLATINQVUDG5Y5HV4KQBEAVFDRPEINVEUTYSX3CZZQKBY5U3FE`](https://stellar.expert/explorer/public/contract/CBDS2YSLATINQVUDG5Y5HV4KQBEAVFDRPEINVEUTYSX3CZZQKBY5U3FE),
  `verify(real proof) = true`, ~44.6M instructions, 11% of budget.
- A second circuit proves KYC (registered, of-age, non-sanctioned) with zero PII
  revealed, also live on mainnet.
- Selective disclosure is threshold-held: a 2-of-3 quorum of committee keys
  recovers a disclosed value, no single party, not even the operator, can
  de-anonymize alone. Proven in `vineland-zk/threshold_disclosure.js`.
- Honest boundary: this layer is classical (Groth16/BN254, ElGamal over Baby
  Jubjub), quantum-breakable, and needs a trusted setup. It hides *how much* and
  *to whom*. It does not hide *who acted*, and it is not post-quantum. Both
  statements are load-bearing, not hedges.

### Proved portable this week: the identity layer (`vineland-stellar`)

The confidential layer above hides amounts and counterparties, but the actor
signing the transaction is still one fixed, linkable account. `riverrun-id-wasm`
is the other half: the rotatable-piece identity primitive from
[riverrun](https://github.com/solanabr/mirror-pool), Vineland's author's
post-quantum anonymity layer built for Solana, one hash-based secret that
presents a different, unlinkable face at every context, with holder-only
rotation, scoped delegation, and selective credentials, all built from BLAKE3
domain separation, no elliptic curves, no trusted setup.

This week it was proved chain-agnostic, not just argued to be: it compiles
`no_std` to `wasm32-unknown-unknown`, the exact target Soroban contracts run on.
Real artifact, not a claim: `target/wasm32-unknown-unknown/debug/libriverrun_id_wasm.rlib`,
7 tests green. See `vineland-stellar/riverrun-id-wasm/README.md` for exactly what
is proved and what is still ahead (a real Soroban contract, an on-chain nullifier
registry, one live integration): named precisely, nothing rounded up.

### The two together, and why neither Stellar privacy tool ships this today

Stellar's own privacy stack, Confidential Tokens (OpenZeppelin/Nethermind, June
2026) and Stellar Private Payments (Nethermind), each hide *how much*. Neither
ships a reusable per-context identity primitive other contracts could build an
anonymous vote, a sybil-resistant airdrop, or a KYC-gated join on top of, and
both are curve-based with a trusted-setup dependency, not post-quantum. Vineland
is positioned to be the party that ships both halves, hide how much (live,
classical, mainnet-proven) and hide who (proved portable, post-quantum,
integration ahead), on the chain that currently has neither combined.

## Architecture

```
apps/web             React/Vite: landing, funnel, app (cofrinho, receber, empresas)
supabase/functions    Deno (Hono) API: orders, x402, ramp, billing, merchant auth
supabase               Postgres + auth + 14 migrations + RLS
apps/listener          chain watcher: settles orders, writes receipts
apps/*-connector       Shopify / VTEX store connectors
contracts/              Soroban (Stellar): checkout, smart-wallet, receipt, subscription
../vineland-solana     Anchor program: vineland_mandate (a separate, more exploratory
                         fusion thread, riverrun + confidential settlement on Solana;
                         see FUSION.md, roadmap, not the shipped product)
../vineland-zk          Circom/Groth16 circuits + Soroban verifier: live on mainnet
../vineland-stellar     riverrun ID ported wasm32-ready: the identity primitive layer
```

Stack: pnpm workspace, Node 22, Deno, Rust/Soroban, Anchor, Circom + snarkjs.

## Quick start

```bash
pnpm install
pnpm -r build

# local DB
pnpm supabase:start

# env (fill with your own values, see INFRA.md)
cp vineland/.env.example vineland/.env.local
cp vineland/apps/web/.env.example vineland/apps/web/.env.local

# web
cd vineland/apps/web && pnpm dev
```

Full provisioning (your own accounts, contracts, domain, go-live order):
**[INFRA.md](./INFRA.md)**. The commercial-fusion thesis (why riverrun's
behavioral privacy and this confidential-compliance layer combine into one
product, and the honest post-quantum boundary between them): **[FUSION.md](./FUSION.md)**.

## Status

Working code; provision your own infra to run it (see INFRA.md). The licensed
Pix on/off-ramp is a commercial agreement, not code: the one piece that closes
the Pix-to-USDC loop end to end.

`vineland-zk`: unaudited. The mandate and KYC proofs verify on mainnet; the
trusted setup is single-contributor and demo-grade. Not for real funds until
audited.

`vineland-stellar`: the identity math is proved portable (real wasm32 artifact,
7 tests). No Soroban contract, no on-chain integration yet, named as such in its
own README rather than rounded up.

`vineland-solana` (the FUSION.md thread): design and a Solana settlement-program
module map, a separate, earlier-stage exploration of the same thesis on a
different chain. Not the primary product.

## License

Proprietary. Copyright Manuel Guilherme Almeida. All rights reserved.

# Vineland — Infra from Zero

How to stand up Vineland on **your own** accounts, from nothing. This repo carries
the code only: no secrets, no running infra. Everything below is what you provision
once to own the full stack independently.

> Original context: this is a clean fork of a prior codebase. Re-deploy every
> contract with **your own keys** and point every service at **your own accounts**.
> Nothing here reuses the previous project's infra.

---

## 0. What Vineland is made of

| Piece | Path | Runtime | Hosts on |
|---|---|---|---|
| Web app + landing | `vineland/apps/web` | Vite/React static | any static host / your VPS + nginx |
| API | `vineland/supabase/functions/api` | Deno (Hono) | Supabase Edge Functions or a VPS |
| Database + auth | `vineland/supabase` | Postgres (Supabase) | your Supabase project |
| Chain listener | `vineland/apps/listener` | Node | your VPS (systemd/pm2) |
| Store connectors | `vineland/apps/{shopify,vtex}-connector` | Node | optional |
| Soroban contracts | `vineland/contracts/{checkout,smart-wallet,receipt,subscription}` | Rust/Soroban | Stellar |
| Solana program | `vineland-solana/programs/vineland_mandate` | Rust/Anchor | Solana |
| ZK verifier + circuits | `vineland-zk` | Circom/Groth16 + Soroban | Stellar |

Package manager: **pnpm** (workspace). Node 22, Deno, Rust + `stellar` CLI, `circom` + `snarkjs`, Anchor (for Solana).

---

## 1. Accounts to create (the things that were NOT copied)

1. **Supabase project** — database, auth, edge functions. → get `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. **A server (VPS)** — for the listener, optionally the API + web. Any Ubuntu box.
3. **A domain** — the code references `vineland.cc`; register it (or your choice) and update references.
4. **Stellar keypairs** — one funded deployer (mainnet needs ~30 XLM), one platform/fee account with a USDC trustline.
5. **Solana keypair** — funded deployer (devnet airdrop is free).
6. **A licensed Pix on/off-ramp partner** — this is a commercial agreement, NOT code. Without it, Pix↔USDC does not close. (Stand up the rest on testnet meanwhile.)
7. *(optional)* Transak / store API keys if you use those flows.

---

## 2. Database (Supabase)

```bash
# install the supabase CLI, then:
cd vineland
supabase init                 # if not linked yet
supabase link --project-ref YOUR_PROJECT_REF
supabase db push              # applies the 14 migrations in supabase/migrations/
```

The migrations create: merchants, orders, subscriptions, x402_resources,
webhook_deliveries, listener_leases, RLS policies, pg_cron expiry, the 0.98%
platform fee. Review `supabase/migrations/` before pushing.

Local dev DB instead: `pnpm supabase:start` (spins a local stack), `pnpm supabase:reset`.

---

## 3. Environment

Copy every example and fill with **your** values:

```bash
cp vineland/.env.example vineland/.env.local
cp vineland/apps/web/.env.example vineland/apps/web/.env.local
# repeat for apps/listener, agents/pulse, etc.
```

Key variables (root `.env`):

| var | what | where to get |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | your Supabase project | Supabase dashboard → API |
| `STELLAR_NETWORK` | `testnet` or `mainnet` | your choice |
| `CHECKOUT_TOKEN_SECRET` | signs checkout tokens | generate: `openssl rand -hex 32` |
| `API_KEY_PEPPER` | hashes merchant API keys (≥32 chars) | generate: `openssl rand -hex 32` |
| `RATE_BRL_USDC` | BRL→USDC rate source | your rate feed |
| `STELLAR_USDC_ISSUER_OVERRIDE` | USDC issuer | Circle's mainnet issuer, or testnet |

Web (`apps/web/.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_API_BASE`, `VITE_STELLAR_NETWORK`, `VITE_PLATFORM_ADDRESS` (your fee account).

**Never commit `.env*` with values** — the `.gitignore` already blocks them.

---

## 4. Deploy the contracts (with YOUR keys)

Each script wants a funded `stellar` CLI identity. Create one:
`stellar keys generate vineland-deployer && stellar keys fund vineland-deployer --network testnet`.

```bash
# Soroban (Stellar) — testnet first
cd vineland/contracts/checkout      && ./deploy-testnet.sh
cd ../smart-wallet                  && ./deploy-testnet.sh
cd ../receipt                       && ./deploy-testnet.sh
cd ../subscription                  && ./deploy-testnet.sh
# mainnet variants exist where provided (subscription/deploy-mainnet.sh) — real XLM.

# ZK verifier (Stellar) — generic Groth16/BN254 verifier
cd vineland-zk/contract && MAINNET_IDENT=vineland-deployer ./deploy_testnet.sh
# circuits: see vineland-zk/README.md (circom -> snarkjs setup -> prove -> verify)

# Solana program
cd vineland-solana && anchor build && anchor deploy --provider.cluster devnet
```

**After each deploy: copy the printed contract ID into the matching env var**
(`VITE_SUB_CONTRACT`, the listener's contract config, etc.). The deployed IDs in
the old code are NOT yours — replace them.

---

## 5. Build & run

```bash
pnpm install            # workspace install
pnpm -r build           # build all packages

# web (static) -> deploy dist/ to your host
cd vineland/apps/web && pnpm build   # outputs dist/

# API (Deno) — locally
deno run --allow-all vineland/supabase/functions/api/index.ts
# or deploy as a Supabase Edge Function

# listener (watches chain, settles orders) — on the VPS
cd vineland/apps/listener && pnpm build && node dist/index.js   # run under systemd/pm2
```

### Web deploy (VPS + nginx, the simple path)
```bash
cd vineland/apps/web && pnpm build
rsync -az dist/ user@YOUR_SERVER:/var/www/vineland/dist/
# nginx: root /var/www/vineland/dist; try_files $uri /index.html;  (SPA fallback)
```

---

## 6. Go-live order

1. Supabase project + `db push` ✔
2. Contracts deployed on **testnet**, IDs in env ✔
3. Web + API + listener running against testnet ✔
4. End-to-end test: create order → pay on testnet → listener settles → receipt ✔
5. Swap to **mainnet**: re-deploy contracts mainnet, fund the deployer/fee accounts, flip `STELLAR_NETWORK=mainnet` + the mainnet contract IDs
6. Wire the **licensed Pix ramp** (the commercial piece) — until then, on/off-ramp is the one gap code can't fill

---

## 7. What is NOT in this repo (by design)

- Any secret / API key / `.env` value (purged)
- A running database, server, or domain (you provision)
- Deployed contract instances tied to your keys (you deploy)
- The licensed Pix ramp agreement (commercial, not code)

---

## 8. Legal note

This is a clean-room fork of code you authored. Before operating commercially,
confirm with counsel that the IP is yours to use, given the terms of the prior
arrangement. Having the code is not the same as having the right to ship it.

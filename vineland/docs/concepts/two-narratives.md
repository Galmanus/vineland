# Two narratives

Vineland exposes one rail through two surfaces. They share the same non-custodial
settlement, the same contracts, and the same listener, but they are aimed at two
different users and present different routes and components. This page is the map
of which surface owns what, so the codebase does not get read as one
undifferentiated audience.

## 1. The human "dollar account" surface

For a person who wants to receive and pay USDC without running infrastructure.
The mental model is a dollar account: receive money, pay money, get a receipt.
No keys to manage by hand, no contract addresses to copy.

What it is for:

- receive USDC against a generated request (a QR or a checkout link)
- pay USDC with a biometric (passkey) instead of a seed phrase
- get a verifiable receipt for a payment that anyone can check

Routes and components (in `apps/web`):

- `/` (AgentHome) and `/human` (older Home) — the human landing.
- `/pay` — biometric pay. Real path: passkey secp256r1 -> smart-wallet ->
  relayer sponsors gas only. Mainnet path is real money. (smart-wallet itself is
  testnet only today; see the seam below.)
- `/cobrar` — merchant QR generator (produces a `vineland:pay` QR). Demo
  recipient today.
- `/checkout/:order_id` — one-time order pay.
- `/sub/:id` — on-chain recurring charge surface.
- `/comprovante/:txhash` — public payment verifier. Reads Horizon effects and
  the on-chain subscription state and judges payment against obligation.
- merchant-side app under `/dashboard*`.

On the off-chain plane this surface leans on the API's `/v1/orders`,
`/v1/subscriptions`, `/v1/merchants`, and `/v1/relayer`, and on the listener for
settlement confirmation and webhooks.

## 2. The agent / builder surface

For a developer or an autonomous agent that needs to make payments under an
explicit, machine-checkable spending policy. The mental model is a bounded
spender: the agent can pay, but only inside ceilings that hold on-chain and that
can be re-verified offline.

What it is for:

- let an agent make autonomous USDC payments without holding a backend in the
  path
- bound those payments by an on-chain allowance and contract policy
- gate settlement on a fail-closed integrity attestation (testnet today)
- carry an offline-checkable proof of the spending bound

Routes, packages, and components:

- `/agents` — the builder narrative in the web app.
- `/verify` — re-verify an AXL certificate client-side (re-hash the spec, regen
  the SMT-LIB obligations; no solver runs in-browser yet).
- `@vineland/mcp` — the rail as agent verbs behind a role membrane. Agents get
  `vineland_verify`, `vineland_whoami`, `vineland_charge_attested`,
  `vineland_status`. Principal-only setup verbs (`vineland_subscribe`,
  `vineland_approve`, `vineland_autocharge`, `vineland_arm_gate`, `vineland_pay`)
  are hidden from agents.
- `@vineland/attester` — the integrity oracle that signs an ed25519 verdict only
  when the agent's action stays inside its committed surface.
- on-chain: the subscription contract's v0.2 autocharge (mainnet) and v0.3
  attested gate (testnet), and the smart-wallet's agent session-key model
  (testnet).
- `axl-compiler` — the proof-carrying certificate of the spending bound
  (build-only).

On the off-chain plane the agent path mostly bypasses the API: `@vineland/mcp` is
backend-free and talks to an RPC directly. The autocharge scheduler
(`scripts/autocharge-scheduler.mjs`) and the relayer are the off-chain pieces
that keep recurring debits moving without giving anyone custody.

## What is shared

- non-custodial settlement: in both narratives the buyer's or agent's wallet
  signs funds directly to the merchant; Vineland never holds or signs for funds.
- the contract suite and the SEP-41 USDC token.
- the listener and `/comprovante` receipt verification.
- the relayer as a fee-payer (gas sponsor) that cannot move user funds.

## The testnet/mainnet seam, by narrative

Both narratives cross the same seam, and the docs should not paper over it:

- Human surface: `/comprovante` verification is real on mainnet. Biometric pay
  depends on the smart-wallet, which is testnet only. `/cobrar` uses a demo
  recipient. `/preview` is a pure mock.
- Agent surface: v0.2 autocharge (allowance-bounded) is live on mainnet. The
  v0.3 attestation gate is testnet only. The smart-wallet agent session model is
  testnet only. AXL is build-only with no on-chain artifact.

When a layer graduates from testnet to mainnet, update both this page and
[architecture](architecture.md).

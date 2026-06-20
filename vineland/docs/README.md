# Vineland Documentation

Non-custodial USDC payments and agent-payment integrity on Stellar. Two surfaces
over one settlement core: a human "dollar account" (receive, verify, pay with a
passkey) and an agent/builder surface (autonomous payments bounded by on-chain
policy, a fail-closed integrity attestation, and an offline-checkable proof).

> **Status (verified on chain, 2026-06-05).** Mainnet (`PUBLIC`):
> subscription v0.1 `CBJMQ6ZYQJ2OMM46FGXPEIKKZDRHHERBXUVE54ZN64FDPKN5DJKSEVQN`
> and v0.2 autocharge `CAQZECYTKQGUJETQRRBONGQA2DJBNQVYCSKBYCKXOVQOEEOMHKBTJZEP`.
> The v0.3 attestation gate, the smart wallet, and the checkout contract are
> **testnet only**. AXL is build/test only (no on-chain artifact). No traction or
> GMV claims; the deployed contracts have no third-party audit.

## Start here

| | |
|---|---|
| [**Quickstart — human**](./quickstart-human.md) | Receive USDC by QR, verify a payment, pay with a passkey. |
| [**Quickstart — agent**](./quickstart-agent.md) | Install `@vineland/mcp`, verify a cert offline, settle. |
| [**Architecture**](./concepts/architecture.md) | The full system: API, listener, contracts, packages, web. |

## Concepts

| | |
|---|---|
| [Two narratives](./concepts/two-narratives.md) | The human surface vs the agent/builder surface. |
| [Proof-bounded settlement](./concepts/proof-bounded-settlement.md) | Allowance ceiling + integrity attestation + offline proof. |
| [Agent-integrity attestation](./concepts/agent-integrity-attestation.md) | "Is the payment authorized?" vs "is the agent compromised?". |
| [Non-custodial settlement](./concepts/non-custodial-settlement.md) | What non-custodial means here, precisely. |
| [Regulatory framing](./concepts/regulatory.md) | BCB Res 519/520/521 and 561, and the response. |

## Contracts

| | |
|---|---|
| [Overview](./contracts/README.md) | The contract suite and a deployed-address table. |
| [Subscription](./contracts/subscription.md) | v0.1 (per-period signature), v0.2 autocharge, v0.3 gate. |
| [Smart wallet](./contracts/smart-wallet.md) | WebAuthn/passkey custom account + agent session keys. |
| [Checkout](./contracts/checkout.md) | Atomic fee-split payment. |

## AXL (proof-carrying certificates)

| | |
|---|---|
| [Language](./axl/README.md) | The agent-block DSL: bind / constrain / prove / invariant. |
| [Compiler](./axl/compiler.md) | The `axlc` CLI, the z3 discharge, the certificate. |
| [Proofs and limits](./axl/proofs-and-limits.md) | What is proved, and the honest gaps. |

## Packages

| | |
|---|---|
| [`@vineland/mcp`](./packages/vineland-mcp.md) | MCP server: agent verbs behind a role membrane. |
| [`@vineland/attester`](./packages/vineland-attester.md) | The agent-integrity attestation oracle (AIA). |

## API reference

| resource | description |
|---|---|
| [Authentication](./api-reference/authentication.md) | API keys, JWT sessions, webhook HMAC. |
| [Merchants](./api-reference/merchants.md) | Sign up, manage settings, rotate API key. |
| [Orders](./api-reference/orders.md) | One-shot payments. |
| [Subscriptions](./api-reference/subscriptions.md) | Recurring billing (v0.2 autocharge is live on mainnet). |
| [Webhooks](./api-reference/webhooks.md) | Event types, retries, HMAC verification. |
| [Errors](./api-reference/errors.md) | Status codes and error shapes. |

## Guides

| | |
|---|---|
| [Biometric pay](./guides/biometric-pay.md) | The `/pay` passkey flow end to end. |
| [Receive USDC by QR](./guides/receive-usdc-qr.md) | `/cobrar` and `/comprovante`. |
| [Verify a cert](./guides/verify-a-cert.md) | `/verify` and the offline `vineland_verify` path. |
| [Agent surface](./product/agent-surface.md) | The membrane, `/sub`, and MCP integration. |
| [Recurring billing](./guides/recurring-billing.md) | Subscriptions, off-chain and on-chain. |
| [Drop-in SDK](./guides/drop-in-sdk.md) | Two lines of JavaScript. |
| [WooCommerce plugin](./guides/woocommerce.md) | Install and configure. |
| [Handle webhooks](./guides/webhooks-handler.md) | Verify HMAC, idempotency, retries. |

## Integrations

| | |
|---|---|
| [x402 protocol](./integrations/x402.md) | Pay-per-call resources gated by Stellar USDC. |
| [MoneyGram](./integrations/moneygram.md) | Cash-out plan (not shipped). |

## Operations & security

| | |
|---|---|
| [Deploy](./ops/deploy.md) | The real deploy mechanism (VPS + PM2 + nginx + rsync). |
| [Key custody](./security/key-custody.md) | Deployer and platform-fee key custody. |
| [Audits 001–006](./security/audit-001.md) | WooCommerce plugin security audits (historical). |

## Stay close to the runtime

Every claim in this documentation should be verifiable against the code. If a doc
says something the code does not do, that is a bug worth an issue, not an
aspiration.

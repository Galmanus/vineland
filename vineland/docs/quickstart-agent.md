# Quickstart — the agent path

This is the path for an autonomous agent (or the builder wiring one up) to settle
USDC payments on Stellar with a verifiable spend policy. It uses the
`@vineland/mcp` server.

`@vineland/mcp` is non-custodial and backend-free: the agent holds its own key,
builds and signs Soroban/Stellar transactions itself, and submits them straight
to an RPC. There is no Vineland backend in the payment path.

## 1. Install

```sh
npx -y @vineland/mcp
```

This starts the MCP server. Register it with your agent runtime the way you
register any other MCP server.

## 2. Configure

Set these environment variables:

| Variable | Purpose |
|---|---|
| `VINELAND_SIGNER_SECRET` | The agent's own signing key. The agent custodies this; nobody else sees it. |
| `VINELAND_CONTRACT` | The subscription contract address the agent settles against. |
| `VINELAND_NETWORK` | `testnet` or `public` (mainnet). |

Optional overrides: the RPC endpoint and the USDC issuer can be set explicitly if
you are not using the defaults for the chosen network.

Role membrane: `VINELAND_ROLE` defaults to `agent`. In the `agent` role the server
exposes only the settlement and read verbs (`vineland_verify`, `vineland_whoami`,
`vineland_charge_attested`, `vineland_status`). The trust-setup verbs (`vineland_pay`,
`vineland_subscribe`, `vineland_approve`, `vineland_autocharge`, `vineland_arm_gate`)
are principal-only and hidden from the agent. The point: a compromised agent
cannot grant itself an allowance, cannot do a raw transfer, and cannot mint a
fresh attestation.

## 3. Verify a counterparty certificate offline (`vineland_verify`)

Before settling, re-verify the counterparty's integrity certificate locally with
`vineland_verify`. This is the differentiated step: verification runs offline
against the certificate's own bytes, without trusting a remote service to vouch
for it. Re-verify before you move money.

## 4. Settle (`vineland_charge_attested`)

`vineland_charge_attested` performs an autonomous charge that settles only when a
fresh, single-use ed25519 attestation accompanies it. The attestation binds the
subscription id, the count of charges already done (so each attestation is
single-use), and a freshness deadline. If the attestation is missing, stale, or
reused, the charge does not settle.

Read settlement state afterward with `vineland_status` (a Horizon read).

## Status seam — read this before going to mainnet

The on-chain attestation gate (the contract entrypoint that verifies the
attestation with `ed25519_verify` and fails closed) is proven on **testnet only**.
It is not deployed on mainnet.

On **mainnet (`public`) the contract runs the allowance path**: the buyer grants a
standing SEP-41 allowance once, off-band, and the autonomous charge pulls against
that allowance each period via `transfer_from`. The allowance has two hard
ceilings — the contract-side limits (status, period, max periods, expiry) and the
SAC-side limits (the allowance cap and its expiry ledger). When either is
exhausted or expired, the pull fails and the buyer must re-approve. This is the
production spend policy today; the attestation gate is the testnet roadmap on top
of it.

So: on testnet you can exercise `vineland_charge_attested` end to end through the
gate. On mainnet, settlement is allowance-gated and `vineland_charge_attested`'s
attestation is not yet enforced on chain. State this honestly to anyone relying on
the gate.

## Related

- Agent governance and x402: [`docs/agent-governance-x402.md`](./agent-governance-x402.md)
- Verified spending policy: [`docs/verified-spending-policy-x402.md`](./verified-spending-policy-x402.md)
- AXL (offline-checkable spend bound): [`docs/axl.md`](./axl.md)

# @vineland/mcp

A Model Context Protocol server that gives an AI agent the Vineland payment rail as
tools: pay, set up a recurring subscription, arm and use the integrity gate, and
re-verify a spending-bound certificate offline.

Non-custodial and backend-free. The agent holds its own wallet secret
(`VINELAND_SIGNER_SECRET`), which never leaves the process. Each spending tool builds,
signs, and submits a Soroban/Stellar transaction directly to an RPC. No Vineland
backend is in the path. Vineland never holds funds and never has signing authority.

## Install

The server runs over stdio. Configure it in any MCP client under `mcpServers`:

```jsonc
{
  "mcpServers": {
    "vineland": {
      "command": "npx",
      "args": ["-y", "@vineland/mcp"],
      "env": {
        "VINELAND_SIGNER_SECRET": "S...",   // agent wallet secret (required to sign)
        "VINELAND_CONTRACT": "C...",        // subscription contract id
        "VINELAND_NETWORK": "testnet"       // testnet | public
      }
    }
  }
}
```

`vineland_verify` needs no key and no network. It works the moment the server loads.

## Environment variables

| var | default | used by |
|---|---|---|
| `VINELAND_SIGNER_SECRET` | — | every tool that signs a tx |
| `VINELAND_CONTRACT` | — | subscribe / approve / autocharge / charge_attested / arm_gate |
| `VINELAND_NETWORK` | `testnet` | all chain ops (`testnet` or `public`) |
| `VINELAND_ROLE` | `agent` | tool surface (`agent` or `principal`) |
| `VINELAND_RPC_URL` | network default | Soroban RPC override |
| `VINELAND_HORIZON_URL` | network default | Horizon override |
| `VINELAND_USDC_ISSUER` | network default | USDC issuer override |

## Tools (role membrane)

The tool surface depends on `VINELAND_ROLE` (default `agent`). The agent role is
deliberately minimal; `principal` adds the trust-establishing verbs. More tools mean
more injection paths, so an agent gets only what it needs to operate inside an
already-established trust relationship. A compromised agent cannot obtain a fresh
integrity attestation, so it cannot settle a charge, and it has no raw-pay escape
hatch and no setup verbs.

| tool | agent | principal | what it does |
|---|---|---|---|
| `vineland_verify` | yes | yes | Re-verify a proof-carrying spending-bound certificate offline. No key, no network. |
| `vineland_whoami` | yes | yes | Return the wallet address, network, and configured contract. No transaction. |
| `vineland_charge_attested` | yes | yes | Autonomous charge that settles only with a fresh, single-use ed25519 integrity attestation, verified on-chain. |
| `vineland_status` | yes | yes | Look up a tx hash on Horizon; return settlement status and explorer link. |
| `vineland_pay` | no | yes | Raw SEP-41/SAC transfer (default USDC) to a recipient. Ungated. |
| `vineland_subscribe` | no | yes | Create an on-chain recurring subscription. Returns the 32-byte hex subscription id. |
| `vineland_approve` | no | yes | Approve the contract as a SEP-41 spender up to a capped, expiring allowance. Arms autonomous debit. |
| `vineland_autocharge` | no | yes | Trigger an autonomous charge via the standing allowance, no attestation. Submittable by any relayer. |
| `vineland_arm_gate` | no | yes | Bind an ed25519 attester public key to a subscription (`set_attester`). |

The membrane is a surface restriction enforced by this server process, not a
chain-level guarantee. The hard guarantee for attested charges is the contract's
on-chain `ed25519_verify` check.

## Status

The on-chain integrity gate (`autocharge_attested` / `ed25519_verify`) is proven on
**testnet only**. Stellar mainnet currently runs the subscription contract version
without the gate (allowance-only `autocharge`). The new contracts have no third-party
audit.

## Docs

- `docs/packages/vineland-mcp.md` — full reference.
- `docs/packages/vineland-attester.md` — the integrity attester.
- `docs/concepts/agent-integrity-attestation.md` — the two questions and how they are
  enforced.

---

Built on [Stellar](https://stellar.org). Part of [Vineland](https://vineland.cc). MIT.

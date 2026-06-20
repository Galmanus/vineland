# Non-custodial settlement

"Non-custodial" is a precise term, not a marketing word. This page is what
Vineland actually means by it.

## The claim

At no point does Vineland hold the merchant's funds. Settlement is
**direct, atomic, on-chain**: buyer's wallet signs a transaction that
moves USDC (or PYUSD) from buyer address to merchant address. Vineland
observes the transaction, matches it to an order, and notifies the
merchant. Vineland never has signing authority over the merchant's address.

## Where the funds go

```
            buyer wallet (private key with buyer)
                       |
                       | Stellar payment operation, signed by buyer
                       v
            merchant address (private key with merchant)
                       |
                       | (no further movement initiated by Vineland)
                       v
                merchant decides: hold, swap, off-ramp via MoneyGram, etc.
```

The merchant address is whatever the merchant entered in
`/v1/merchants/me` (`stellar_address`). Vineland validates it's a
56-character Stellar pubkey but does not touch the corresponding secret
key — which never exists in any Vineland system.

## What Vineland observes (read-only)

Vineland's listener subscribes to Horizon's `/payments` stream filtered to
the merchant's address. This is a **read-only** subscription. The listener
sees payments land but cannot modify the merchant's account in any way.

```
                  Horizon SSE
                      |
                      v
          listener (apps/listener/src/horizon.ts)
                      |
                      v
              read-only event:
              { from, to, amount, asset, memo, hash }
                      |
                      v
              match to order via memo + amount + issuer
                      |
                      v
              update orders.status = paid (postgres)
                      |
                      v
              fire webhook to merchant
```

No write happens to Stellar from the listener. The DB write is internal
Vineland state, not on-chain state.

## What Vineland never does

These are excluded by design:

1. **Hold buyer fiat**. Vineland does not accept BRL or any fiat directly
   in v0.1. (When the BR anchor partnership lands, the anchor — not
   Vineland — holds the fiat for the millisecond it takes to mint USDC.)
2. **Hold merchant USDC**. Merchant address is the merchant's, period.
3. **Sign for the merchant**. Pause/resume on a Soroban subscription
   requires the merchant's signature; Vineland backend cannot impersonate.
4. **Move funds without merchant authorization**. A pre-authorized
   subscription contract (v0.2) lets the buyer sign once for many future
   debits, but only the *buyer*'s authorization is delegated. Merchant
   authority is never delegated to Vineland.

## What Vineland does have

| asset | who controls it |
|---|---|
| Postgres database (merchants, orders, subs) | Vineland |
| Stellar testnet platform keypair | Vineland (used only for testing) |
| API keys (hash) | Vineland (per-merchant) |
| Webhook secrets (hash) | Vineland (per-merchant) |
| Buyer's USDC | buyer (via wallet) |
| Merchant's USDC | merchant (via Stellar address) |
| Merchant's secret key | merchant (offline / wallet) |

Vineland controls the **routing infrastructure**. Vineland does not control
**the funds**.

## Edge cases

### What if Vineland disappears tomorrow

The merchant's address still exists on Stellar. Existing USDC balance is
unaffected. Future payments would have to be matched manually (the buyer
would need to know the memo to send), but the funds themselves are
unrelated to Vineland's existence.

### What if Vineland gets hacked

The attacker gets:

- Postgres data (orders, subscriptions, webhook URLs, hashed API keys).
- Hashed webhook secrets.
- The platform Stellar **testnet** keypair (mainnet platform keypair, when
  generated, is on a separate offline machine).

The attacker does **not** get:

- Merchant Stellar secret keys (never stored).
- Buyer Stellar secret keys (never stored).
- Plaintext API keys (only SHA-256 hashes are kept).

A hack is bad — orders could be tampered with, fake webhooks could be
sent to attacker-controlled URLs — but **funds are not directly
exfiltrable**. The attacker would need the merchant's wallet, which they
don't have.

### What if the merchant loses their secret key

The merchant loses access to the funds at that address. Vineland cannot
recover them. This is the same property as any other non-custodial wallet:
**not your keys, not your coins**, applied to merchants.

To mitigate, merchants should use multi-sig (Stellar supports native
multi-sig at the account level) or a custodial wallet provider for the
receive address. Both are compatible with Vineland; Vineland only cares that
incoming payments to the address can be matched to orders.

## The "non-custodial where it matters" caveat

The platform fee leg (2.97% by default) is currently received at the same
address as the merchant payment, then off-cycle the platform sweeps its
share. In v0.2 this becomes a single atomic transaction with two
operations (merchant share + platform share), so the platform never
holds the merchant's portion at any instant. This is the "atomic
settlement" property that makes "non-custodial" a precise claim.

In v0.1, the platform briefly co-mingles its share with the merchant's
inbound flow. Merchants on a 100% non-custodial setup should configure
`platform_fee_bp` to 0 and accept Vineland charges per-transaction via a
separate billing relationship.

## Comparison

| layer | Vineland | Coinbase Commerce | BitPay |
|---|---|---|---|
| Buyer sends | direct to merchant addr (Stellar) | to Coinbase-controlled addr, swept later | to BitPay-controlled addr |
| Merchant settlement | on-chain, atomic | held by Coinbase, settled later | T+1 fiat or stablecoin |
| Custody during settlement | none (atomic) | Coinbase | BitPay |
| What happens if PSP dies | merchant address still has funds | merchant must reconcile with Coinbase | merchant must reconcile with BitPay |

Coinbase Commerce's self-managed mode is closest to Vineland (also
non-custodial), but they're sunsetting that for international merchants
in 2025 in favor of custodial Coinbase Business. Vineland's bet is that the
non-custodial property remains valuable for a tier of merchants who would
rather hold their own keys than route through a PSP.

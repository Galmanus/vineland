# Vineland × VTEX connector

VTEX [Payment Provider Protocol](https://developers.vtex.com/docs/guides/payments-integration-payment-provider-protocol)
connector that maps VTEX's payment flow onto Vineland's API — **same motor as the
WooCommerce plugin, different platform.** Adding a platform = an adapter, not a rebuild.

## What it does
- `GET /manifest` — declares the **Vineland** payment method to VTEX.
- `POST /payments` — VTEX createPayment → Vineland `POST /api/v1/orders` → returns
  `paymentUrl` (= Vineland `checkout_url`), status `undefined` (async/redirect). Idempotent by `paymentId`.
- `POST /vineland-webhook` — Vineland confirms order paid → connector calls VTEX `callbackUrl`
  with `status: approved`. Closes the loop.
- `cancellations` / `settlements` / `refunds` — protocol-valid scaffold responses
  (non-custodial: funds settle to the merchant wallet on-chain at payment time).

## Run (zero deps, node 18+)
```
VINELAND_API_KEY=sk_live_... node src/index.mjs
# connector on :4000 → https://api.vineland.cc
```
- Credential: per-merchant Vineland API key. In VTEX it comes from `merchantSettings.api_key`;
  for local testing use the `VINELAND_API_KEY` env. **Read the key from the merchant's Vineland
  dashboard → Settings.**

## First test
```
curl localhost:4000/manifest
curl -XPOST localhost:4000/payments -H 'content-type: application/json' \
  -d '{"paymentId":"test-1","value":49.90,"callbackUrl":"https://example/cb"}'
# → status "undefined" + paymentUrl = Vineland checkout_url
```

## Scope
Working connector proving the VTEX↔Vineland mapping end-to-end against the live backend.
**NOT yet VTEX-homologated** — the mandatory test suite (Authorize/Denied/Cancel/Async) +
homologation is post-Rio. Reference: [vtex-apps/payment-provider-example](https://github.com/vtex-apps/payment-provider-example).

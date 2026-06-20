# Vineland × Shopify connector

Shopify [Payments Apps](https://shopify.dev/docs/apps/build/payments) connector that
maps Shopify's payment-session flow onto Vineland's API — **third platform adapter**
(after WooCommerce + VTEX), same motor (`POST /api/v1/orders` → `checkout_url`).

## Flow
1. Buyer picks **Vineland** at Shopify checkout → Shopify POSTs a payment session to `/payment_sessions`.
2. Connector creates a Vineland order → responds `{ redirect_url: <checkout_url> }`. Shopify sends the buyer there.
3. Buyer pays → Vineland webhook hits `/vineland-webhook` → connector calls Shopify `paymentSessionResolve` to finalize.
4. `refund_sessions` / `capture_sessions` / `void_sessions` — protocol-valid scaffold (non-custodial: settles on-chain at payment time).

## Run (zero deps, node 18+)
```
VINELAND_API_KEY=sk_live_... node src/index.mjs           # connector on :4001
# for the resolve call (finalize), also set:
# SHOPIFY_SHOP=my-store.myshopify.com SHOPIFY_ACCESS_TOKEN=<payments-app-token>
```
- Credential: per-shop Vineland API key (from the merchant's Vineland dashboard → Settings).
  In Shopify it arrives in `merchant_settings.api_key`; env `VINELAND_API_KEY` is the test fallback.

## First test
```
curl -XPOST localhost:4001/payment_sessions -H 'content-type: application/json' \
  -d '{"id":"shopify-sess-1","amount":"49.90","currency":"BRL","kind":"sale","test":true}'
# → { redirect_url: <Vineland checkout_url>, vineland_order: ... }
```

## Scope
Working connector proving the Shopify↔Vineland mapping (session→order→checkout_url) live.
The `paymentSessionResolve` GraphQL call needs a real Shopify Partner app + shop access token
(post-Rio). **NOT a listed/approved Shopify Payments App yet** — Partner review + homologation
is post-Rio. The session→checkout mapping is the proof that the adapter pattern holds.

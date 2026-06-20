# Vineland for WooCommerce

Accept USDC and PYUSD payments on Stellar from any WooCommerce store. Buyers
pay in BRL via Pix or directly in stablecoin from a Stellar wallet; the
merchant receives USDC or PYUSD on a Stellar address they control. Six-second
finality, no chargebacks, non-custodial.

**Status**: v0.1.0 · works against `https://api.vineland.cc` (testnet by default)

---

## Install

### Via the WordPress admin

1. Download or clone this folder as `woocommerce-vineland/`.
2. Zip it (`zip -r woocommerce-vineland.zip woocommerce-vineland/`).
3. WordPress admin → Plugins → Add New → Upload Plugin → choose the zip → Install → Activate.

### Via SSH on the server

```sh
cd wp-content/plugins
git clone --depth 1 https://github.com/Galmanus/vineland.git vineland-tmp
mv vineland-tmp/plugins/woocommerce-vineland ./
rm -rf vineland-tmp
```

Then activate from WordPress admin.

---

## Configure

1. **Create a Vineland merchant**
   Sign up at https://api.vineland.cc/signup. Drop your Stellar receive address
   in Settings. Copy the `sk_live_…` API key (shown once at creation; rotate
   from Settings if you lose it).

2. **WooCommerce → Settings → Payments → Vineland**

   | field            | value                                                 |
   |------------------|-------------------------------------------------------|
   | Enable           | check                                                 |
   | Environment      | `testnet` for test runs; switch to `mainnet` when live |
   | API base URL     | `https://api.vineland.cc` (don't change unless self-host) |
   | API key          | `sk_live_…` from your dashboard                       |
   | Default asset    | USDC or PYUSD                                          |
   | Webhook secret   | match what you configured on the Vineland merchant side |

3. **Configure the webhook URL on Vineland**
   In your Vineland merchant dashboard, set webhook URL to:
   ```
   https://your-store.com/wc-api/wc_vineland
   ```
   Plugin verifies HMAC-SHA256 of the request body against your shared secret.

---

## What happens at checkout

1. Buyer picks Vineland at checkout and clicks **Place Order**.
2. Plugin calls `POST /api/v1/orders` on Vineland backend with the WC order
   total, generates a Vineland order id, and stores it as order meta
   (`_vineland_order_id`).
3. WC redirects buyer to the Vineland-hosted checkout
   (`/checkout/<order_id>`).
4. Buyer signs the payment in their Stellar wallet (Freighter, Lobstr, xBull,
   Albedo, Hana). Settlement is instant (~6 seconds).
5. Vineland listener confirms the on-chain payment, fires
   `order.paid` webhook to `/wc-api/wc_vineland`.
6. Plugin verifies HMAC, calls `WC_Order::payment_complete( $tx_hash )`.
7. Order shows up as Completed in WC admin with the Stellar tx hash in the
   notes.

---

## Webhook events handled

| event                  | what the plugin does                                    |
|------------------------|---------------------------------------------------------|
| `order.paid`           | `payment_complete()`, store tx_hash on order meta       |
| `subscription.charged` | same as `order.paid` (recurring billing)                |
| `order.underpaid`      | `update_status('on-hold')` with expected/received note  |
| `order.expired`        | `update_status('cancelled')` with reason                |
| `order.cancelled`      | `update_status('cancelled')`                            |

---

## Supported and tested

- WordPress 6.0+
- WooCommerce 7.0+ through 9.x
- PHP 7.4+
- HPOS (High-Performance Order Storage) compatible: declared via
  `FeaturesUtil::declare_compatibility('custom_order_tables')`

---

## Security

- Plugin never sees buyer's private key. Wallet flow happens on the Vineland
  hosted checkout, not on your store.
- API key is stored encrypted at rest by WordPress (in `wp_options` per WC
  convention). For extra safety, rotate the key from your Vineland dashboard
  if you suspect compromise; old key invalidates immediately.
- Webhook handler rejects requests with missing or mismatched HMAC when a
  secret is configured. Use this in production.
- `wc_get_orders` lookup by `_vineland_order_id` is exact-match; no fuzzy
  resolution that could let a malicious payload mark the wrong order paid.

---

## Roadmap

- v0.2: optional buyer-side Pix-in flow (when Vineland anchor partnership lands)
- v0.3: subscription products (link a WC Subscription to a Vineland subscription)
- v0.4: refund support (manual merchant-initiated USDC return)
- v1.0: WooCommerce.com / WordPress.org plugin directory submission

---

## Support

- Vineland backend: https://api.vineland.cc/api/health
- Vineland docs: https://api.vineland.cc/ (landing) / https://api.vineland.cc/demo (SDK demo)
- Repo issues: https://github.com/Galmanus/vineland/issues

License: Apache-2.0.

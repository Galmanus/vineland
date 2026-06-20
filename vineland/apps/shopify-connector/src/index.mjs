// Vineland × Shopify — Payments App connector.
//
// Maps Shopify's Payments Apps payment-session flow onto Vineland's API.
// Third platform adapter (after WooCommerce + VTEX): same motor
// (POST /api/v1/orders → checkout_url), different platform contract.
//
// Shopify flow: buyer picks "Vineland" at checkout → Shopify POSTs a payment
// session to this app → we create a Vineland order and return { redirect_url =
// checkout_url } → buyer pays → Vineland webhook → we call Shopify
// paymentSessionResolve to finalize.
//
// Scope: WORKING connector proving the mapping against the live Vineland
// backend. The session→order→checkout_url path is real and testable now; the
// paymentSessionResolve GraphQL call needs a real Shopify Partner app + shop
// access token (post-Rio). NOT a listed/approved Shopify Payments App yet.
//
// Run: VINELAND_API_KEY=sk_live_... node src/index.mjs   (node 18+, zero deps)

import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 4001);
const VINELAND_API_BASE = process.env.VINELAND_API_BASE ?? "https://api.vineland.cc";
const FALLBACK_KEY = process.env.VINELAND_API_KEY ?? "";
// For paymentSessionResolve: the shop + payments-app access token (from OAuth).
// Env fallback for standalone testing; in production these are per-shop.
const SHOP = process.env.SHOPIFY_SHOP ?? "";            // e.g. my-store.myshopify.com
const SHOP_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN ?? "";

const sessions = new Map(); // shopifySessionId → { vinelandOrderId, status }

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

async function createVinelandOrder({ apiKey, amount, reference }) {
  const r = await fetch(`${VINELAND_API_BASE}/api/v1/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ brl_amount: Number(amount).toFixed(2), reference }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status !== 201) throw new Error(`vineland ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

// Finalize the Shopify payment session once Vineland confirms payment.
async function resolveShopifySession(sessionId) {
  if (!SHOP || !SHOP_TOKEN) return { skipped: "no SHOPIFY_SHOP/ACCESS_TOKEN (test mode)" };
  const q = `mutation { paymentSessionResolve(id: "${sessionId}") { paymentSession { id status { code } } userErrors { field message } } }`;
  const r = await fetch(`https://${SHOP}/payments_apps/api/2024-10/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Shopify-Access-Token": SHOP_TOKEN },
    body: JSON.stringify({ query: q }),
  });
  return r.json().catch(() => ({}));
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, `http://localhost:${PORT}`).pathname;

  // Payment session: buyer chose Vineland → create order, redirect to checkout.
  if (req.method === "POST" && path === "/payment_sessions") {
    const b = await readBody(req);
    const sessionId = b.id ?? b.gid ?? randomUUID();
    if (sessions.has(sessionId)) {
      const s = sessions.get(sessionId);
      return json(res, 201, { redirect_url: s.checkoutUrl });
    }
    // Shopify sends amount as a string (major units) + currency.
    const amount = b.amount ?? b.payment?.amount;
    const apiKey = b.merchant_settings?.api_key || FALLBACK_KEY;
    if (!apiKey) return json(res, 400, { error: "missing Vineland api_key" });
    try {
      const { order, checkout_url } = await createVinelandOrder({ apiKey, amount, reference: String(sessionId) });
      sessions.set(sessionId, { vinelandOrderId: order.id, status: "pending", checkoutUrl: checkout_url });
      // Offsite redirect: Shopify sends the buyer to redirect_url.
      return json(res, 201, {
        redirect_url: checkout_url,
        vineland_order: order.id,
        message: `Vineland order ${order.id} (${order.brl_amount} BRL → ${order.usdc_amount} USDC)`,
      });
    } catch (e) {
      return json(res, 422, { error: String(e.message ?? e) });
    }
  }

  // Vineland webhook → resolve the Shopify session (finalize as paid).
  if (req.method === "POST" && path === "/vineland-webhook") {
    const b = await readBody(req);
    const orderId = b.order?.id ?? b.order_id ?? b.id;
    const paid = (b.event ?? b.order?.status) === "order.paid" || b.order?.status === "paid";
    const entry = [...sessions.entries()].find(([, s]) => s.vinelandOrderId === orderId);
    if (entry && paid) {
      const [sessionId, s] = entry;
      s.status = "resolved";
      const out = await resolveShopifySession(sessionId);
      return json(res, 200, { received: true, resolved: sessionId, shopify: out });
    }
    return json(res, 200, { received: true });
  }

  // Refund / capture / void sessions — protocol-valid scaffold.
  if (req.method === "POST" && path === "/refund_sessions") {
    const b = await readBody(req);
    return json(res, 201, { id: b.id, code: "refund-manually", message: "non-custodial; refund handled off-protocol" });
  }
  if (req.method === "POST" && path === "/capture_sessions") {
    const b = await readBody(req);
    return json(res, 201, { id: b.id, code: "captured-on-chain", message: "settles to merchant wallet at payment time" });
  }
  if (req.method === "POST" && path === "/void_sessions") {
    const b = await readBody(req);
    return json(res, 201, { id: b.id, code: "voided", message: "session voided" });
  }

  if (req.method === "GET" && path === "/health") return json(res, 200, { ok: true, vineland: VINELAND_API_BASE, shopResolve: Boolean(SHOP && SHOP_TOKEN) });
  json(res, 404, { error: "not_found", path });
});

server.listen(PORT, () => console.log(`Vineland×Shopify connector on :${PORT} → ${VINELAND_API_BASE}`));

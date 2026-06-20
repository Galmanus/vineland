// Audit-004 · C6 — token-bucket rate limiter applied to every API route.
//
// Keyed by client identity: for authenticated routes, by `merchant.id`; for
// unauthenticated routes, by `x-forwarded-for` first hop (or socket IP).
// In-memory implementation is fine for a single-container deployment; for
// multi-pod, swap to Redis or a Supabase pg-cron-cleaned table.
//
// Defaults:
//  - 60 requests/min per key for general API routes (orders, subscriptions,
//    merchants)
//  - 5 requests/min and 100 requests/day per IP for /v1/ask (audit-004 C7).
//    Enforced via a stricter limiter applied locally in the ask route.
//
// Window: a classic token-bucket of `capacity` tokens that refill at
// `refillPerSec` tokens/second. Exhausted callers get 429 with a
// `retry-after` header.

import type { Context, Next } from "hono";
import { clientIp, type ConnInfo } from "../lib/client_ip.ts";

interface Bucket {
  tokens: number;
  lastRefill: number; // ms epoch
}

export interface LimiterConfig {
  capacity: number;
  refillPerSec: number;
  /** How to derive the key. Default: x-forwarded-for first hop || "anon". */
  key?: (c: Context) => string;
  /** Identifier for diagnostic 429 body. */
  scope?: string;
}

const buckets: Map<string, Bucket> = new Map();
// Periodic cleanup so we don't leak buckets for unique IPs that never return.
let lastSweep = Date.now();

function sweepIfDue() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now - b.lastRefill > 5 * 60_000) buckets.delete(k);
  }
}

// Audit-005 · H1 — derive the bucket key from the trusted connection IP, NOT
// the client-forgeable left-most X-Forwarded-For hop. See lib/client_ip.ts.
// On Deno, Hono exposes the connection info (with remoteAddr) as `c.env`.
function defaultKey(c: Context): string {
  return clientIp(c.req, c.env as ConnInfo | undefined);
}

export function rateLimit(cfg: LimiterConfig) {
  const { capacity, refillPerSec } = cfg;
  const keyFn = cfg.key ?? defaultKey;
  const scope = cfg.scope ?? "default";

  return async (c: Context, next: Next) => {
    sweepIfDue();
    const id = `${scope}:${keyFn(c)}`;
    const now = Date.now();
    const bucket = buckets.get(id) ?? { tokens: capacity, lastRefill: now };
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const retrySec = Math.ceil((1 - bucket.tokens) / refillPerSec);
      buckets.set(id, bucket);
      return c.json(
        { error: "rate_limited", scope, retry_after_sec: retrySec },
        429,
        { "retry-after": String(retrySec) },
      );
    }
    bucket.tokens -= 1;
    buckets.set(id, bucket);
    await next();
  };
}

/** Derive a key bound to the authenticated merchant.id; falls back to IP. */
export function merchantKey(c: Context): string {
  const m = c.get("merchant") as { id?: string } | undefined;
  return m?.id ?? defaultKey(c);
}

/** Visible for tests. */
export function __resetBuckets() {
  buckets.clear();
  lastSweep = Date.now();
}

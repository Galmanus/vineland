#!/usr/bin/env node
// attest.js — SHADOW ZK compliance attester.
//
// For each merchant with a mandate, take their recent settled charges, prove
// (mandate_sd) that the batch obeyed the mandate, simulate the LIVE mainnet
// verifier, and append a privacy-preserving attestation record. Observe-only:
// it never blocks settlement and never writes to chain (verify is simulated).
//
// This is SEPARATE from the existing ed25519 integrity oracle (src/oracle.mjs in
// the backend `attester` service) — that one is per-charge fail-closed surface
// detection; this one is a periodic privacy-preserving batch-compliance proof.
//
// Usage:
//   node attest.js                 # uses /tmp/all_orders.json + /tmp/all_merchants.json + mandates.json
//   node attest.js <orders.json> <merchants.json> <mandates.json>
//
// In prod the snapshot files are replaced by a read-only query of paid orders in
// the current period; everything else is identical.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { proveBatch } = require("./prove_batch.js");

// Fresh ElGamal nonce per attestation. CRITICAL: a fixed nonce makes equal
// totals produce identical ciphertexts and leaks total differences
// (encTotal1 - encTotal2 = (total1-total2).G). Must be random, < 2^253 (circuit
// uses Num2Bits(253) on the nonce).
const freshNonce = () => (BigInt("0x" + crypto.randomBytes(32).toString("hex")) % (1n << 252n)).toString();

const ROOT = __dirname;
const N = 8;
const MAINNET_ID = "CBDS2YSLATINQVUDG5Y5HV4KQBEAVFDRPEINVEUTYSX3CZZQKBY5U3FE";
const SOURCE = process.env.SOURCE || "vineland-mainnet-deployer";

// simulate the live mainnet verify (no tx, no cost) from an invoke_args.json
function simulateMainnet(argsPath) {
  const a = JSON.parse(fs.readFileSync(argsPath, "utf8"));
  const jarr = (l) => "[" + l.map((x) => `"${x}"`).join(",") + "]";
  const out = execFileSync("stellar", [
    "contract", "invoke", "--id", MAINNET_ID, "--source", SOURCE,
    "--network", "mainnet", "--send", "no", "--", "verify",
    "--alpha", a.alpha, "--beta", a.beta, "--gamma", a.gamma, "--delta", a.delta,
    "--ic", jarr(a.ic), "--a", a.a, "--b", a.b, "--c", a.c, "--pubs", jarr(a.pubs),
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return out.trim() === "true";
}

async function main() {
  const [ordersP, merchantsP, mandatesP] = process.argv.slice(2);
  const orders = JSON.parse(fs.readFileSync(ordersP || "/tmp/all_orders.json", "utf8"));
  const merchants = JSON.parse(fs.readFileSync(merchantsP || "/tmp/all_merchants.json", "utf8"));
  const mandates = JSON.parse(fs.readFileSync(mandatesP || path.join(ROOT, "mandates.json"), "utf8"));
  const addrOf = Object.fromEntries(merchants.map((m) => [m.id, m.stellar_address || m.id]));

  const byMerchant = {};
  for (const o of orders) (byMerchant[o.merchant_id] ||= []).push(o);

  const outRoot = path.join(ROOT, "build_attest");
  fs.mkdirSync(outRoot, { recursive: true });
  const ledgerPath = path.join(outRoot, "attestations.jsonl");
  const records = [];

  for (const [mid, mandate] of Object.entries(mandates)) {
    let rows = (byMerchant[mid] || []).slice();
    if (rows.length === 0) { console.log(`skip ${mid}: no orders`); continue; }
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); // most recent first
    const truncated = rows.length > N;
    if (truncated) console.log(`note ${mid}: ${rows.length} orders, attesting most recent ${N} (rest excluded — not silent)`);
    const used = rows.slice(0, N);

    const batch = {
      payments: used.map((o) => ({ amount_usd: String(o.usdc_amount), recipient: addrOf[mid] })),
      perPaymentCapUsd: mandate.perPaymentCapUsd,
      monthlyCapUsd: mandate.monthlyCapUsd,
      allowedRecipients: [mandate.payoutIdentity],
      nonceKey: freshNonce(),
    };

    const outDir = path.join(outRoot, mid);
    let rec;
    try {
      const s = await proveBatch(batch, outDir);
      const mainnet = simulateMainnet(path.join(outDir, "invoke_args.json"));
      rec = {
        merchant_id: mid,
        period: { from: used[used.length - 1].created_at, to: used[0].created_at },
        n_payments: used.length, n_orders_total: rows.length, truncated,
        mandate: { perPaymentCapUsd: mandate.perPaymentCapUsd, monthlyCapUsd: mandate.monthlyCapUsd },
        offchain_verify: s.offchain_verify,
        mainnet_verify_simulated: mainnet,
        // public + privacy-preserving: ciphertext hides the total, amounts/recipients never recorded
        total_ciphertext: s.total_ciphertext,
        compliant: s.offchain_verify && mainnet,
        attested_at: new Date().toISOString(),
        proof_dir: path.relative(ROOT, outDir),
      };
      console.log(`✓ ${mid}: ${used.length} payments · offchain=${s.offchain_verify} · mainnet(sim)=${mainnet} · compliant=${rec.compliant}`);
    } catch (e) {
      rec = { merchant_id: mid, compliant: false, error: e.message, attested_at: new Date().toISOString() };
      console.log(`✗ ${mid}: NOT attested — ${e.message}`);
    }
    records.push(rec);
  }

  fs.writeFileSync(ledgerPath, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const okN = records.filter((r) => r.compliant).length;
  console.log(`\nattestations: ${okN}/${records.length} compliant → ${path.relative(ROOT, ledgerPath)}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERROR:", e.message); process.exit(1); });

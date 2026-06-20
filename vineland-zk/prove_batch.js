#!/usr/bin/env node
// prove_batch.js — turn a REAL Vineland charge batch into a mandate_sd proof.
//
// Maps real `orders` rows (usdc_amount + recipient) into the circuit's private
// inputs, generates the Groth16 proof, verifies it off-chain, and emits the
// Soroban invoke args for the live mainnet verifier (CBDS2YSL…). SHADOW only:
// it proves a batch obeyed the mandate; it does NOT gate settlement.
//
// Mandate semantics (mandate_sd, N=8 payments, M=4 allowlist, 64-bit caps):
//   - each payment   <= perPaymentCap
//   - each recipient in the allowlist
//   - sum(payments)  <= monthlyCap, and that sum is ElGamal-encrypted to the regulator
//
// Unit: amounts are USD cents (×100). The ElGamal total is encoded in 32 bits
// (Num2Bits(32)), so the monthly total must be < 2^32 cents (~$42.9M). Cents
// keeps real charges well inside that; stroops (7 decimals) would overflow.
//
// Usage: node prove_batch.js <batch.json> [out_dir=build_real]
//   batch.json = {
//     payments: [{ amount_usd: "9.94", recipient: "G... | <merchant-id>" }, ...],  // up to 8
//     perPaymentCapUsd: "20.00",
//     monthlyCapUsd: "40.00",
//     allowedRecipients: ["G...", "<merchant-id>", ...],   // <= 4 distinct payout identities
//     regulatorPrivKey: "987654321"                        // demo; in prod the regulator holds it
//   }

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { buildBabyjub } = require("circomlibjs");
const snarkjs = require("snarkjs");
const { build: toSoroban } = require("./to_soroban.js");

const ROOT = __dirname;
const WASM = path.join(ROOT, "build_sd/mandate_sd_js/mandate_sd.wasm");
const ZKEY = path.join(ROOT, "build_sd/sd_final.zkey");
const VK = path.join(ROOT, "build_sd/vk_sd.json");

// BN254 scalar field
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const N = 8, M = 4;

const toCents = (usd) => {
  // round to nearest cent; reject sub-cent precision loss silently-large
  const n = Math.round(parseFloat(usd) * 100);
  if (!Number.isFinite(n) || n < 0) throw new Error("bad amount: " + usd);
  return BigInt(n);
};

// Map any payout identity (Stellar G-address or merchant uuid) to a field element.
// Deterministic + collision-resistant; SAME mapping for payments and allowlist
// so the circuit's exact-equality allowlist check holds.
const idToField = (s) => (BigInt("0x" + crypto.createHash("sha256").update(String(s)).digest("hex")) % R);

// Core: real batch -> proof + offchain verify + soroban args. Returns a summary.
async function proveBatch(batch, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  if (!Array.isArray(batch.payments) || batch.payments.length === 0) throw new Error("batch.payments empty");
  if (batch.payments.length > N) throw new Error(`batch has ${batch.payments.length} payments; circuit caps at ${N}`);
  if (!batch.allowedRecipients?.length || batch.allowedRecipients.length > M)
    throw new Error(`allowedRecipients must be 1..${M}`);

  const perCap = toCents(batch.perPaymentCapUsd);
  const monCap = toCents(batch.monthlyCapUsd);

  // allowlist -> field, padded to M by repeating the first (padding is a no-op:
  // the membership product is zero if recipient matches ANY entry).
  const allowedF = batch.allowedRecipients.map(idToField);
  while (allowedF.length < M) allowedF.push(allowedF[0]);
  const allowedSet = new Set(batch.allowedRecipients.map((x) => idToField(x).toString()));

  // payments -> (amount cents, recipient field); pad to N with a zero payment to allowed[0].
  const amounts = [], recipients = [];
  let total = 0n;
  for (const p of batch.payments) {
    const a = toCents(p.amount_usd);
    const rcpt = idToField(p.recipient);
    if (a > perCap) throw new Error(`payment ${p.amount_usd} > perPaymentCap ${batch.perPaymentCapUsd} — would not satisfy circuit`);
    if (!allowedSet.has(rcpt.toString())) throw new Error(`recipient ${p.recipient} not in allowlist — would not satisfy circuit`);
    amounts.push(a.toString()); recipients.push(rcpt.toString()); total += a;
  }
  if (total > monCap) throw new Error(`batch total ${total} cents > monthlyCap ${monCap} cents — would not satisfy circuit`);
  if (total >= (1n << 32n)) throw new Error("total exceeds 2^32 cents — ElGamal encoding overflow");
  while (amounts.length < N) { amounts.push("0"); recipients.push(allowedF[0].toString()); }

  // regulator Baby Jubjub public key from the (demo) private key
  const bj = await buildBabyjub();
  const F = bj.F;
  const d = BigInt(batch.regulatorPrivKey ?? "987654321");
  const nonce = BigInt(batch.nonceKey ?? "555555");
  const pk = bj.mulPointEscalar(bj.Base8, d);

  const input = {
    amounts, recipients, nonceKey: nonce.toString(),
    perPaymentCap: perCap.toString(), monthlyCap: monCap.toString(),
    allowed: allowedF.map((x) => x.toString()),
    regPubKey: [F.toObject(pk[0]).toString(), F.toObject(pk[1]).toString()],
  };
  fs.writeFileSync(path.join(outDir, "input.json"), JSON.stringify(input, null, 2));

  // prove + off-chain verify
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  fs.writeFileSync(path.join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
  fs.writeFileSync(path.join(outDir, "public.json"), JSON.stringify(publicSignals, null, 2));
  const vk = JSON.parse(fs.readFileSync(VK, "utf8"));
  const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);

  // soroban invoke args for the live mainnet verifier
  const args = toSoroban(VK, path.join(outDir, "proof.json"), path.join(outDir, "public.json"));
  fs.writeFileSync(path.join(outDir, "invoke_args.json"), JSON.stringify(args, null, 2));

  const totalUsd = (Number(total) / 100).toFixed(2);
  // public signals layout (snarkjs): [ok, eph.x, eph.y, encTotal.x, encTotal.y, ...mandate]
  return {
    payments_real: batch.payments.length, padded_to: N,
    total_cents: total.toString(), total_usd: totalUsd,
    perPaymentCap_usd: batch.perPaymentCapUsd, monthlyCap_usd: batch.monthlyCapUsd,
    distinct_recipients: batch.allowedRecipients.length,
    offchain_verify: ok, out_dir: outDir,
    total_ciphertext: { ephemeralKey: publicSignals.slice(1, 3), encryptedTotal: publicSignals.slice(3, 5) },
    public_signals: publicSignals,
  };
}

async function main() {
  const [batchPath, outDirArg] = process.argv.slice(2);
  if (!batchPath) { console.error("usage: node prove_batch.js <batch.json> [out_dir]"); process.exit(1); }
  const outDir = path.resolve(outDirArg || path.join(ROOT, "build_real"));
  const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
  const summary = await proveBatch(batch, outDir);
  console.log(JSON.stringify({
    ...summary,
    note: "total is ENCRYPTED in the public signals (ElGamal to regulator); amounts+recipients are private",
  }, null, 2));
  if (!summary.offchain_verify) process.exit(2);
}

module.exports = { proveBatch, idToField, toCents };

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
}

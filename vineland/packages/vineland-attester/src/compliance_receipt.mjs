// Vineland compliance receipt — item 2 of the $100M thesis.
//
// Binds a batch of agent payments to a re-verifiable, on-chain-anchored receipt:
//   batch -> mandate_sd proof (caps+allowlist OK, amounts hidden, monthly total
//            ElGamal-sealed to the regulator key)
//         -> /attest-proof (verified on the live mainnet verifier, signed)
//         -> commitment = SHA-256(attestation) anchored via Receipt.record() on
//            the Soroban `receipt` contract (a monotonic per-mandate hash chain).
//
// The artifact the licensed partner points a regulator at: each monthly batch
// leaves a tamper-evident receipt whose proof verified on mainnet, while the
// individual amounts/recipients stay private and only the regulator (with the
// ElGamal key) can open the total. Offline re-verifiable; on-chain anchored.

import { spawn } from "node:child_process";
import { sha256 } from "@noble/hashes/sha256";
import { attestProof } from "./zkattest.mjs";

const STELLAR_BIN = process.env.STELLAR_BIN || "stellar";
const RECEIPT_CONTRACT = process.env.VINELAND_RECEIPT_CONTRACT || null;
const SOURCE = process.env.VINELAND_STELLAR_SOURCE || "vineland-mainnet-deployer";
const NETWORK = process.env.VINELAND_STELLAR_NETWORK || "mainnet";

const toHex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
const enc = (s) => new TextEncoder().encode(s);

/** SHA-256 of the signed attestation = the 32-byte commitment anchored on-chain. */
export function commitmentOf(attestation, signature) {
  return toHex(sha256(enc(JSON.stringify({ attestation, signature }))));
}

/** Invoke Receipt.record(mandate_id, period_index, commitment). Real tx (--send yes). */
function anchorOnChain({ mandateId, periodIndex, commitment, send }) {
  return new Promise((resolve) => {
    if (!RECEIPT_CONTRACT) return resolve({ anchored: false, reason: "VINELAND_RECEIPT_CONTRACT unset" });
    const args = [
      "contract", "invoke", "--id", RECEIPT_CONTRACT, "--source", SOURCE,
      "--network", NETWORK, "--send", send ? "yes" : "no", "--", "record",
      "--mandate_id", mandateId, "--period_index", String(periodIndex), "--commitment", commitment,
    ];
    const p = spawn(STELLAR_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve(code === 0
      ? { anchored: true, new_head: out.trim().replace(/"/g, "") }
      : { anchored: false, reason: (err || out).trim().slice(-200) }));
    p.on("error", (e) => resolve({ anchored: false, reason: String(e?.message ?? e) }));
  });
}

/**
 * Build a compliance receipt for one batch/period.
 *
 * input: {
 *   mandate_id,            // 32-byte hex id of the mandate (matches the on-chain receipt chain)
 *   period_index,          // monotonic period counter (== current on-chain count)
 *   invoke_args,           // mandate_sd proof args (from prove_batch.js -> to_soroban.js)
 *   public_signals?,       // the circuit public signals (caps, allowlist, regPubKey, encryptedTotal)
 *   anchor?: boolean       // if true and the contract is configured, write it on-chain
 * }
 * out: { ok, receipt:{...}, commitment, anchor }  |  { ok:false, reason }
 */
export async function buildComplianceReceipt(input, attesterPrivKey, opts = {}) {
  if (!input?.mandate_id) return { ok: false, reason: "missing mandate_id" };
  if (input?.period_index == null) return { ok: false, reason: "missing period_index" };

  // 1. attest the mandate proof (verifies on the live mainnet verifier, fail-closed)
  const att = await attestProof({ kind: "mandate", invoke_args: input.invoke_args, public_signals: input.public_signals, subject_ref: input.mandate_id }, attesterPrivKey, opts);
  if (!att.ok) return { ok: false, reason: att.reason ?? "mandate proof did not attest", chain: att.chain };

  // 2. commitment = SHA-256(attestation+signature)
  const commitment = commitmentOf(att.attestation, att.signature);

  // 3. optionally anchor it on-chain (Receipt.record)
  const anchor = input.anchor
    ? await anchorOnChain({ mandateId: input.mandate_id, periodIndex: input.period_index, commitment, send: opts.send !== false })
    : { anchored: false, reason: "anchor not requested" };

  return {
    ok: true,
    receipt: {
      v: 1,
      mandate_id: input.mandate_id,
      period_index: input.period_index,
      commitment,                          // SHA-256 anchored on-chain
      attestation: att.attestation,        // the signed, mainnet-verified verdict
      signature: att.signature,
      statement: att.attestation.statement,
      verified_on_mainnet: att.attestation.verified_on_mainnet,
    },
    commitment,
    anchor,                                // { anchored, new_head } | { anchored:false, reason }
  };
}

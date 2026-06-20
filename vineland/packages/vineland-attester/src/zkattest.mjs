// Vineland ZK attestation — the sellable product.
//
// Turns a raw ZK proof into a signed, re-verifiable "compliance attestation":
//   1. confirm the Groth16/BN254 proof on the LIVE Stellar mainnet verifier
//      (CBDS2YSL, the generic verifier) — not "trust me", the chain says true.
//   2. bind the verdict to the proof's public inputs + a kind (kyc | mandate) +
//      a SHA-256 digest of the public signals (the spec<->cert binding).
//   3. sign it with the attester ed25519 key and stamp "verified-on-mainnet".
//
// The licensed partner / issuer (Etherfuse, BlindPay, Trace) calls this before
// onboarding or settling: they get a portable artifact they can point a regulator
// at, proving compliance WITHOUT the underlying PII/amounts. That artifact is the
// product the $100M thesis sells (confidential-compliance-as-attestation).

import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256 } from "@noble/hashes/sha256";
import { ed } from "./oracle.mjs";

const MAINNET_VERIFIER = process.env.VINELAND_ZK_VERIFIER
  || "CBDS2YSLATINQVUDG5Y5HV4KQBEAVFDRPEINVEUTYSX3CZZQKBY5U3FE";
const STELLAR_BIN = process.env.STELLAR_BIN || "stellar";
const SOURCE = process.env.VINELAND_STELLAR_SOURCE || "vineland-mainnet-deployer";
const NETWORK = process.env.VINELAND_STELLAR_NETWORK || "mainnet";

const toHex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
const enc = (s) => new TextEncoder().encode(s);

/** invoke_args.json shape produced by to_soroban.js: {alpha,beta,gamma,delta,ic,a,b,c,pubs} */
function buildInvokeArgs(args) {
  const jarr = (l) => "[" + l.map((x) => `"${x}"`).join(",") + "]";
  return [
    "contract", "invoke", "--id", MAINNET_VERIFIER, "--source", SOURCE,
    "--network", NETWORK, "--send", "no", "--", "verify",
    "--alpha", args.alpha, "--beta", args.beta, "--gamma", args.gamma, "--delta", args.delta,
    "--ic", jarr(args.ic), "--a", args.a, "--b", args.b, "--c", args.c, "--pubs", jarr(args.pubs),
  ];
}

/** Run the on-chain verify (simulation, zero XLM) and return true/false. */
export function verifyOnChain(invokeArgs) {
  return new Promise((resolve) => {
    const p = spawn(STELLAR_BIN, buildInvokeArgs(invokeArgs), { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", () => resolve({ ok: out.trim() === "true", raw: (out || err).trim().slice(-200) }));
    p.on("error", (e) => resolve({ ok: false, raw: String(e?.message ?? e) }));
  });
}

/**
 * The product. Verify a ZK proof on mainnet and, if it holds, return a signed
 * attestation. Fail-closed: no signature unless the chain returns true.
 *
 * input: { kind: "kyc"|"mandate", invoke_args, public_signals, subject_ref? }
 * out:   { ok, kind, verifier, public_digest, not_after, attestation, signature }
 *      | { ok:false, reason }
 */
export async function attestProof(input, attesterPrivKey, opts = {}) {
  const kind = input?.kind;
  if (kind !== "kyc" && kind !== "mandate") return { ok: false, reason: "kind must be 'kyc' or 'mandate'" };
  if (!input?.invoke_args?.pubs) return { ok: false, reason: "missing invoke_args (run to_soroban.js)" };

  const chain = await verifyOnChain(input.invoke_args);
  if (!chain.ok) return { ok: false, reason: "proof did not verify on mainnet", chain: chain.raw };

  const ttlSecs = Number(opts.ttlSecs ?? process.env.VINELAND_ATTEST_TTL ?? 30 * 24 * 3600);
  const not_after = Number(opts.now ?? Math.floor(Date.now() / 1000)) + ttlSecs;
  const publicSignals = input.public_signals ?? input.invoke_args.pubs;
  const public_digest = toHex(sha256(enc(JSON.stringify(publicSignals))));

  // The exact message signed (and re-verifiable offline by anyone with the pubkey).
  const attestation = {
    v: 1,
    kind,                                   // kyc | mandate
    verifier: MAINNET_VERIFIER,             // the live mainnet contract that returned true
    network: NETWORK,
    public_digest,                          // SHA-256 of the public signals (spec<->cert binding)
    subject_ref: input.subject_ref ?? null, // opaque ref (merchant/order/agent), never PII
    statement: kind === "kyc"
      ? "registered + of-age + non-sanctioned, no PII revealed"
      : "agent batch within mandate (caps+allowlist), amounts hidden, total ElGamal-sealed to regulator key",
    verified_on_mainnet: true,
    not_after,
  };
  const msg = enc(JSON.stringify(attestation));
  const signature = toHex(await ed.signAsync(msg, attesterPrivKey));
  // `attestation` is the exact signed doc; pass {attestation, signature, pubkey}
  // back to verifyAttestationDoc() (or POST /verify-attestation) to re-check offline.
  return { ok: true, attestation, signature };
}

/** Re-verify an attestation offline (no chain call): checks the ed25519 signature. */
export async function verifyAttestationDoc({ attestation, signature, pubkey, now }) {
  try {
    if (!attestation || !signature || !pubkey) return { valid: false, reason: "missing fields" };
    const t = Number(now ?? Math.floor(Date.now() / 1000));
    if (attestation.not_after && t > attestation.not_after) return { valid: false, reason: "expired" };
    const msg = enc(JSON.stringify(attestation));
    const valid = await ed.verifyAsync(
      Uint8Array.from(signature.match(/.{2}/g).map((h) => parseInt(h, 16))),
      msg,
      Uint8Array.from(pubkey.match(/.{2}/g).map((h) => parseInt(h, 16))),
    );
    return { valid };
  } catch (e) { return { valid: false, reason: String(e?.message ?? e) }; }
}

#!/usr/bin/env node
// Vineland integrity oracle — HTTP service (zero web deps, Node http).
// The chain-agnostic endpoint any rail calls before settling:
//   GET  /pubkey                     → the attester ed25519 key (register it via
//                                       the Soroban set_attester, or verify anywhere)
//   POST /register {agent_id, allowed_recipients, allowed_tools?, max_amount}
//                                     → commits the agent's surface, returns commitment
//   POST /attest   {agent_id, subscription_id, charges_done, recipient, amount, tools_used?}
//                                     → { ok, not_after, signature } | { ok:false, reason }
//   POST /verify   {subscription_id, charges_done, not_after, signature, pubkey}
//                                     → { valid }
//
// Key: VINELAND_ATTESTER_SECRET (64-hex / 32 bytes). If unset, a demo key is
// derived from a fixed seed (DEV ONLY — set a real secret in prod).
import { createServer } from "node:http";
import { sha256 } from "@noble/hashes/sha256";
import { commitSurface, attest, verifyAttestation, publicKeyHex, hexToBytes } from "./oracle.mjs";
import { attestProof, verifyAttestationDoc } from "./zkattest.mjs";
import { buildComplianceReceipt } from "./compliance_receipt.mjs";

const PORT = Number(process.env.PORT || 8790);
const priv = process.env.VINELAND_ATTESTER_SECRET
  ? hexToBytes(process.env.VINELAND_ATTESTER_SECRET)
  : sha256(new TextEncoder().encode("vineland-attester-dev-seed")); // DEV ONLY

const body = (req) => new Promise((res) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { res(d ? JSON.parse(d) : {}); } catch { res({}); } }); });
const json = (r, code, obj) => { r.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); r.end(JSON.stringify(obj)); };

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/pubkey") return json(res, 200, { pubkey: await publicKeyHex(priv) });
    if (req.method === "POST" && req.url === "/register") return json(res, 200, { commitment: commitSurface(await body(req)) });
    if (req.method === "POST" && req.url === "/attest") {
      const v = await attest(await body(req), priv);
      return json(res, v.ok ? 200 : 403, v); // 403 when the agent is refused — fail-closed
    }
    if (req.method === "POST" && req.url === "/verify") return json(res, 200, await verifyAttestation(await body(req)));
    // ── ZK compliance attestation (the product) ──
    // POST /attest-proof {kind:"kyc"|"mandate", invoke_args, public_signals?, subject_ref?}
    //   → verifies the proof on the LIVE mainnet verifier, returns a signed attestation.
    if (req.method === "POST" && req.url === "/attest-proof") {
      const v = await attestProof(await body(req), priv);
      return json(res, v.ok ? 200 : 422, v); // 422 when the proof does not verify on-chain — fail-closed
    }
    // POST /verify-attestation {attestation, signature, pubkey} → { valid } (offline, no chain call)
    if (req.method === "POST" && req.url === "/verify-attestation") return json(res, 200, await verifyAttestationDoc(await body(req)));
    // POST /compliance-receipt {mandate_id, period_index, invoke_args, public_signals?, anchor?}
    //   → attests the mandate proof on mainnet, builds a receipt, optionally anchors on-chain.
    if (req.method === "POST" && req.url === "/compliance-receipt") {
      const v = await buildComplianceReceipt(await body(req), priv);
      return json(res, v.ok ? 200 : 422, v);
    }
    json(res, 404, { error: "not found" });
  } catch (e) { json(res, 400, { error: String(e?.message ?? e) }); }
});

server.listen(PORT, async () => {
  process.stderr.write(`vineland-attester on :${PORT} · attester ${await publicKeyHex(priv)} · key=${process.env.VINELAND_ATTESTER_SECRET ? "env" : "DEV-seed"}\n`);
});

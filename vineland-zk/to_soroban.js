#!/usr/bin/env node
// Convert snarkjs Groth16 artifacts (vk + proof + public) into the byte hex
// the Soroban verifier expects. Formats (big-endian, from contract/src/lib.rs):
//   Fr  = 32 bytes
//   G1  = x(32) || y(32)
//   G2  = x.c1(32) || x.c0(32) || y.c1(32) || y.c0(32)   (snarkjs stores Fq2 as [c0,c1])
// The contract negates A internally, so pi_a is passed raw.
//
// Usage: node to_soroban.js <vk.json> <proof.json> <public.json> [out.json]
const fs = require("fs");

const fr32 = (dec) => {
  const h = BigInt(dec).toString(16);
  if (h.length > 64) throw new Error("field element exceeds 32 bytes: " + dec);
  return h.padStart(64, "0");
};
const g1 = (p) => fr32(p[0]) + fr32(p[1]);
// snarkjs Fq2 = [c0, c1]; soroban wants c1 || c0
const g2 = (p) => fr32(p[0][1]) + fr32(p[0][0]) + fr32(p[1][1]) + fr32(p[1][0]);

function build(vkPath, proofPath, pubPath) {
  const vk = JSON.parse(fs.readFileSync(vkPath, "utf8"));
  const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  const pub = JSON.parse(fs.readFileSync(pubPath, "utf8"));
  return {
    alpha: g1(vk.vk_alpha_1),
    beta: g2(vk.vk_beta_2),
    gamma: g2(vk.vk_gamma_2),
    delta: g2(vk.vk_delta_2),
    ic: vk.IC.map(g1),
    a: g1(proof.pi_a),
    b: g2(proof.pi_b),
    c: g1(proof.pi_c),
    pubs: pub.map(fr32),
  };
}

if (require.main === module) {
  const [vk, proof, pub, out] = process.argv.slice(2);
  if (!vk || !proof || !pub) {
    console.error("usage: node to_soroban.js <vk.json> <proof.json> <public.json> [out.json]");
    process.exit(1);
  }
  const args = build(vk, proof, pub);
  const json = JSON.stringify(args, null, 2);
  if (out) { fs.writeFileSync(out, json); console.error("wrote " + out); }
  else console.log(json);
}

module.exports = { build, fr32, g1, g2 };

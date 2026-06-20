// Standalone moat test (plain CJS, no mocha/ts-node) — escapes the node22 ESM
// loader issue. Run against a local validator with the program already deployed.
// Env: ANCHOR_PROVIDER_URL=http://localhost:8899  ANCHOR_WALLET=~/.config/solana/id.json
const anchor = require("@coral-xyz/anchor");
const { createMint, getOrCreateAssociatedTokenAccount, mintTo, approve, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const DEC = 6;
const usdc = (n) => new anchor.BN(Math.round(n * 10 ** DEC));
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✓", m); };
const bad = (m) => { fail++; console.log("  ✗", m); };

async function expectRevert(promise, re, label) {
  try { await promise; bad(label + " (did NOT revert)"); }
  catch (e) { String(e).match(re) ? ok(label) : bad(label + " (wrong error: " + String(e).slice(0, 120) + ")"); }
}

(async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const conn = provider.connection;
  const owner = provider.wallet.payer;
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/vineland_mandate.json"), "utf8"));
  const program = new anchor.Program(idl, provider);

  const agent = Keypair.generate(), vendor = Keypair.generate(), stranger = Keypair.generate();
  const mint = await createMint(conn, owner, owner.publicKey, null, DEC);
  const ownerAta = await getOrCreateAssociatedTokenAccount(conn, owner, mint, owner.publicKey);
  const vendorAta = await getOrCreateAssociatedTokenAccount(conn, owner, mint, vendor.publicKey);
  const strangerAta = await getOrCreateAssociatedTokenAccount(conn, owner, mint, stranger.publicKey);
  await mintTo(conn, owner, mint, ownerAta.address, owner, BigInt(usdc(1000).toString()));

  const [mandate] = PublicKey.findProgramAddressSync(
    [Buffer.from("mandate"), owner.publicKey.toBuffer(), mint.toBuffer()], program.programId);

  await program.methods.initMandate(agent.publicKey, usdc(20), usdc(40), new anchor.BN(2592000), [vendor.publicKey])
    .accounts({ owner: owner.publicKey, mint, mandate, systemProgram: SystemProgram.programId }).rpc();
  await approve(conn, owner, ownerAta.address, mandate, owner, BigInt(usdc(40).toString()));

  const charge = (amt, ata) => program.methods.charge(amt)
    .accounts({ agent: agent.publicKey, mandate, mint, ownerToken: ownerAta.address, recipientToken: ata, tokenProgram: TOKEN_PROGRAM_ID })
    .signers([agent]).rpc();

  // 1) within cap + allowlisted -> succeeds
  await charge(usdc(15), vendorAta.address);
  const bal = (await conn.getTokenAccountBalance(vendorAta.address)).value.amount;
  bal === usdc(15).toString() ? ok("pays within cap to allowlisted vendor (15 USDC)") : bad("vendor balance " + bal);

  // 2) over per-payment cap -> revert
  await expectRevert(charge(usdc(25), vendorAta.address), /OverPerPaymentCap|per-payment/i, "blocks over per-payment cap");
  // 3) non-allowlisted recipient -> revert
  await expectRevert(charge(usdc(5), strangerAta.address), /RecipientNotAllowed|allowlist/i, "blocks non-allowlisted recipient");
  // 4) over monthly cap -> revert (15 + 20 = 35 ok; +20 = 55 > 40)
  await charge(usdc(20), vendorAta.address); ok("second charge within monthly cap (total 35)");
  await expectRevert(charge(usdc(20), vendorAta.address), /OverMonthlyCap|monthly/i, "blocks over monthly cap");
  // 5) paused -> revert
  await program.methods.setPaused(true).accounts({ owner: owner.publicKey, mandate }).rpc();
  await expectRevert(charge(usdc(1), vendorAta.address), /Paused|paused/i, "blocks when paused");

  console.log(`\nRESULT: ${pass} passing, ${fail} failing`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });

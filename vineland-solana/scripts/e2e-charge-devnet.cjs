#!/usr/bin/env node
// Headless devnet e2e for the bounded-autonomy moat (charge): the agent pays
// ONLY within the owner's rules — per-payment cap, monthly cap, allowlist, pause.
// Mirrors tests/vineland_mandate.ts but runs against the deployed devnet program.
//
//   node scripts/e2e-charge-devnet.cjs

const fs = require("fs");
const os = require("os");
const anchor = require("@coral-xyz/anchor");
const {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  getOrCreateAssociatedTokenAccount, mintTo, approve, TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { BN } = anchor;

const RPC = process.env.SOLANA_RPC || "https://devnet.helius-rpc.com/?api-key=1fb6ceb1-8839-4296-bca6-ee1f7cf9e5e7";
const IDL = require("/home/galmanus/projects/vineland/apps/web/src/lib/chain/solana/idl/vineland_mandate.json");
const MINT = new PublicKey("8Mi4RKM23awnckq6wbrLaco4dZWYkejbFJqSMPGXjLsC");
const SEED = Buffer.from("mandate");
const usdc = (n) => new BN(n * 1_000_000);

function loadKey() {
  const path = process.env.KEYPAIR || `${os.homedir()}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8"))));
}
const tokBal = async (conn, ata) => (await conn.getTokenAccountBalance(ata)).value.amount;

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log("  PASS ✓", m); };
const bad = (m) => { fail++; console.log("  FAIL ✗", m); };

(async () => {
  const conn = new Connection(RPC, "confirmed");
  const feePayer = loadKey();           // tx fee payer + mint authority
  const owner   = Keypair.generate();
  const agent   = Keypair.generate();
  const vendor  = Keypair.generate();   // allowlisted
  const stranger= Keypair.generate();   // NOT allowlisted

  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(feePayer), { commitment: "confirmed" });
  const program = new anchor.Program(IDL, provider);
  const [mandate] = PublicKey.findProgramAddressSync(
    [SEED, owner.publicKey.toBuffer(), MINT.toBuffer()], program.programId);

  console.log("program :", IDL.address);
  console.log("owner   :", owner.publicKey.toBase58(), "(fresh)");
  console.log("agent   :", agent.publicKey.toBase58());
  console.log("mandate :", mandate.toBase58());

  // owner needs lamports to pay the mandate-account rent (it is the init payer).
  const fund = new Transaction().add(SystemProgram.transfer({
    fromPubkey: feePayer.publicKey, toPubkey: owner.publicKey, lamports: 0.02 * LAMPORTS_PER_SOL }));
  await sendAndConfirmTransaction(conn, fund, [feePayer]);

  // ATAs (feePayer pays rent) + fund owner with 1000 test-USDC.
  const ownerAta = (await getOrCreateAssociatedTokenAccount(conn, feePayer, MINT, owner.publicKey)).address;
  const vendorAta = (await getOrCreateAssociatedTokenAccount(conn, feePayer, MINT, vendor.publicKey)).address;
  const strangerAta = (await getOrCreateAssociatedTokenAccount(conn, feePayer, MINT, stranger.publicKey)).address;
  await mintTo(conn, feePayer, MINT, ownerAta, feePayer, BigInt(usdc(1000).toString()));

  // owner creates the mandate: agent may spend <=20/payment, <=40/period(30d), to vendor only.
  await program.methods
    .initMandate(agent.publicKey, usdc(20), usdc(40), new BN(2592000), [vendor.publicKey])
    .accounts({ owner: owner.publicKey, mint: MINT, mandate, systemProgram: SystemProgram.programId })
    .signers([owner]).rpc();
  // owner delegates bounded spend to the mandate PDA (non-custodial).
  await approve(conn, feePayer, ownerAta, mandate, owner, BigInt(usdc(40).toString()));
  console.log("\nrules: perPayment<=20  monthly<=40  allow=[vendor]\n");

  const charge = (amount, recipientAta) =>
    program.methods.charge(amount)
      .accounts({ agent: agent.publicKey, mandate, mint: MINT,
        ownerToken: ownerAta, recipientToken: recipientAta, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([agent]).rpc();
  const expectRevert = async (label, rx, fn) => {
    try { await fn(); bad(`${label} — should have reverted, did not`); }
    catch (e) { rx.test(String(e)) ? ok(`${label} — reverted (${String(e).match(rx)[0]})`)
                                   : bad(`${label} — reverted but wrong error: ${String(e).slice(0,120)}`); }
  };

  // 1 · within cap, allowlisted vendor
  await charge(usdc(15), vendorAta);
  (await tokBal(conn, vendorAta)) === usdc(15).toString()
    ? ok("pays 15 to allowlisted vendor (vendor balance = 15)")
    : bad("vendor balance != 15 after charge");

  // 2 · over per-payment cap
  await expectRevert("charge 25 (>20 cap)", /OverPerPaymentCap|per-payment/i, () => charge(usdc(25), vendorAta));
  // 3 · recipient not on allowlist
  await expectRevert("charge 5 to stranger", /RecipientNotAllowed|allowlist/i, () => charge(usdc(5), strangerAta));
  // 4 · monthly cap: 15 + 20 = 35 ok, next 20 -> 55 > 40 blocked
  await charge(usdc(20), vendorAta);
  await expectRevert("charge 20 (would be 55>40)", /OverMonthlyCap|monthly/i, () => charge(usdc(20), vendorAta));
  // 5 · paused
  await program.methods.setPaused(true).accounts({ owner: owner.publicKey, mandate }).signers([owner]).rpc();
  await expectRevert("charge 1 while paused", /Paused|paused/i, () => charge(usdc(1), vendorAta));

  console.log(`\nvendor received total: ${Number(await tokBal(conn, vendorAta)) / 1e6} USDC (expect 35)`);
  console.log(`\nresult: ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message || e); process.exit(1); });

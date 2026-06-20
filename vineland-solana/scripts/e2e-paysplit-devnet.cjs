#!/usr/bin/env node
// Headless devnet e2e for pay_split (one-time checkout split), no browser/wallet.
// Proves the on-chain charge leg the frontend's adapter.payOneTime drives:
//   buyer pays `amount` USDC -> fee_bp to platform, rest to merchant, ONE ix.
//
// Buyer = a fresh Keypair (stands in for the LazorKit smart wallet, which is a
// normal signer to pay_split). Fee payer / mint authority = the solana CLI key.
//
//   node scripts/e2e-paysplit-devnet.cjs

const fs = require("fs");
const os = require("os");
const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const {
  getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { BN } = anchor;

const RPC = process.env.SOLANA_RPC || "https://devnet.helius-rpc.com/?api-key=1fb6ceb1-8839-4296-bca6-ee1f7cf9e5e7";
const IDL = require("/home/galmanus/projects/vineland/apps/web/src/lib/chain/solana/idl/vineland_mandate.json");
const MINT = new PublicKey("8Mi4RKM23awnckq6wbrLaco4dZWYkejbFJqSMPGXjLsC");
const MERCHANT = new PublicKey("7JaMKoxbihY5fiEezzNnCRQrx96czooPuxu5ZfZCWkAY");
const PLATFORM = new PublicKey("F9neSDGmb6tyPtuSFp4we2zvFA5WAaQYuFjBbagzmvTK");

const AMOUNT = 500_000n; // 0.5 USDC (6 decimals)
const FEE_BP = 98;       // 0.98%
const expectFee = (AMOUNT * BigInt(FEE_BP)) / 10_000n; // floor -> platform
const expectNet = AMOUNT - expectFee;                  // -> merchant

function loadKey() {
  const path = process.env.KEYPAIR || `${os.homedir()}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8"))));
}
const bal = async (conn, ata) => {
  try { return BigInt((await conn.getTokenAccountBalance(ata)).value.amount); }
  catch { return 0n; }
};

(async () => {
  const conn = new Connection(RPC, "confirmed");
  const feePayer = loadKey();        // pays SOL fees + is the mint authority
  const buyer = Keypair.generate();  // stand-in for the LazorKit smart wallet

  console.log("program :", IDL.address);
  console.log("rpc     :", RPC.replace(/api-key=[^&]+/, "api-key=***"));
  console.log("buyer   :", buyer.publicKey.toBase58(), "(fresh)");
  console.log("merchant:", MERCHANT.toBase58());
  console.log("platform:", PLATFORM.toBase58());

  // ATAs (idempotent — merchant/platform already created earlier).
  const buyerAta = (await getOrCreateAssociatedTokenAccount(conn, feePayer, MINT, buyer.publicKey, true)).address;
  const merchAta = (await getOrCreateAssociatedTokenAccount(conn, feePayer, MINT, MERCHANT, true)).address;
  const platAta  = (await getOrCreateAssociatedTokenAccount(conn, feePayer, MINT, PLATFORM, true)).address;

  // Fund the buyer with 1 USDC of test-mint so it can pay 0.5.
  await mintTo(conn, feePayer, MINT, buyerAta, feePayer, 1_000_000n);

  const pre = { buyer: await bal(conn, buyerAta), merch: await bal(conn, merchAta), plat: await bal(conn, platAta) };
  console.log("\npre  balances (base units):", pre);

  // Build pay_split via Anchor. Provider wallet = feePayer (tx fee payer);
  // buyer is the `payer` account and an extra signer.
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(feePayer), { commitment: "confirmed" });
  const program = new anchor.Program(IDL, provider);
  const orderId = Array.from(Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff));

  const ix = await program.methods
    .paySplit(new BN(AMOUNT.toString()), FEE_BP, orderId)
    .accounts({
      payer: buyer.publicKey, mint: MINT,
      payerToken: buyerAta, merchantToken: merchAta, platformToken: platAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = feePayer.publicKey;
  const sig = await sendAndConfirmTransaction(conn, tx, [feePayer, buyer], { commitment: "confirmed" });

  const post = { buyer: await bal(conn, buyerAta), merch: await bal(conn, merchAta), plat: await bal(conn, platAta) };
  console.log("post balances (base units):", post);

  const dMerch = post.merch - pre.merch, dPlat = post.plat - pre.plat, dBuyer = pre.buyer - post.buyer;
  console.log("\ndeltas:", { buyerOut: dBuyer.toString(), merchant: dMerch.toString(), platform: dPlat.toString() });
  console.log("expect:", { buyerOut: AMOUNT.toString(), merchant: expectNet.toString(), platform: expectFee.toString() });

  const ok = dBuyer === AMOUNT && dMerch === expectNet && dPlat === expectFee;
  console.log(`\ntx: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  console.log(ok ? "\nPASS ✓ pay_split split correct on devnet" : "\nFAIL ✗ split mismatch");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message || e); process.exit(1); });

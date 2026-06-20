// Proves the bounded-autonomy moat: the agent pays ONLY within the owner's rules.
// CJS (require) to avoid ESM/ts-node friction.
const anchor = require("@coral-xyz/anchor");
const {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, approve, TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
const { assert } = require("chai");

const USDC_DECIMALS = 6;
const usdc = (n: number) => new anchor.BN(n * 10 ** USDC_DECIMALS);

describe("vineland_mandate — bounded autonomy", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.VinelandMandate;
  const conn = provider.connection;
  const owner = provider.wallet.payer;

  const agent = Keypair.generate();
  const vendor = Keypair.generate();    // allowlisted
  const stranger = Keypair.generate();  // NOT allowlisted

  let mint: any, mandate: any, ownerAta: any, vendorAta: any, strangerAta: any;

  before(async () => {
    mint = await createMint(conn, owner, owner.publicKey, null, USDC_DECIMALS);
    ownerAta = await getOrCreateAssociatedTokenAccount(conn, owner, mint, owner.publicKey);
    vendorAta = await getOrCreateAssociatedTokenAccount(conn, owner, mint, vendor.publicKey);
    strangerAta = await getOrCreateAssociatedTokenAccount(conn, owner, mint, stranger.publicKey);
    await mintTo(conn, owner, mint, ownerAta.address, owner, BigInt(usdc(1000).toString()));

    [mandate] = PublicKey.findProgramAddressSync(
      [Buffer.from("mandate"), owner.publicKey.toBuffer(), mint.toBuffer()],
      program.programId,
    );

    await program.methods
      .initMandate(agent.publicKey, usdc(20), usdc(40), new anchor.BN(2592000), [vendor.publicKey])
      .accounts({ owner: owner.publicKey, mint, mandate, systemProgram: SystemProgram.programId })
      .rpc();

    // owner delegates bounded spend to the mandate PDA (non-custodial)
    await approve(conn, owner, ownerAta.address, mandate, owner, BigInt(usdc(40).toString()));
  });

  const charge = (amount: any, recipientAta: any) =>
    program.methods.charge(amount)
      .accounts({
        agent: agent.publicKey, mandate, mint,
        ownerToken: ownerAta.address, recipientToken: recipientAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([agent]).rpc();

  it("pays within the cap to an allowlisted vendor", async () => {
    await charge(usdc(15), vendorAta.address);
    const bal = await conn.getTokenAccountBalance(vendorAta.address);
    assert.equal(bal.value.amount, usdc(15).toString());
  });

  it("blocks a payment over the per-payment cap", async () => {
    try { await charge(usdc(25), vendorAta.address); assert.fail("should revert"); }
    catch (e: any) { assert.match(e.toString(), /OverPerPaymentCap|per-payment/i); }
  });

  it("blocks a recipient not on the allowlist", async () => {
    try { await charge(usdc(5), strangerAta.address); assert.fail("should revert"); }
    catch (e: any) { assert.match(e.toString(), /RecipientNotAllowed|allowlist/i); }
  });

  it("blocks once the monthly cap would be exceeded", async () => {
    await charge(usdc(20), vendorAta.address); // 15+20=35 ok
    try { await charge(usdc(20), vendorAta.address); assert.fail("should revert"); } // 55>40
    catch (e: any) { assert.match(e.toString(), /OverMonthlyCap|monthly/i); }
  });

  it("blocks when paused", async () => {
    await program.methods.setPaused(true).accounts({ owner: owner.publicKey, mandate }).rpc();
    try { await charge(usdc(1), vendorAta.address); assert.fail("should revert"); }
    catch (e: any) { assert.match(e.toString(), /Paused|paused/i); }
  });
});

// One-time checkout split (pay_split): the buyer pays in ONE instruction; the
// program splits merchant vs platform fee on-chain. This is what a single-CPI
// smart wallet (LazorKit) calls for /checkout.
describe("vineland_mandate — one-time split (pay_split)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.VinelandMandate;
  const conn = provider.connection;
  const buyer = provider.wallet.payer;

  const merchant = Keypair.generate();
  const platform = Keypair.generate();
  let mint: any, buyerAta: any, merchantAta: any, platformAta: any;

  before(async () => {
    mint = await createMint(conn, buyer, buyer.publicKey, null, USDC_DECIMALS);
    buyerAta = await getOrCreateAssociatedTokenAccount(conn, buyer, mint, buyer.publicKey);
    merchantAta = await getOrCreateAssociatedTokenAccount(conn, buyer, mint, merchant.publicKey);
    platformAta = await getOrCreateAssociatedTokenAccount(conn, buyer, mint, platform.publicKey);
    await mintTo(conn, buyer, mint, buyerAta.address, buyer, BigInt(usdc(1000).toString()));
  });

  const orderId = Array.from({ length: 32 }, (_, i) => i + 1); // dummy 32-byte order id
  const paySplit = (amount: any, feeBp: number) =>
    program.methods.paySplit(amount, feeBp, orderId)
      .accounts({
        payer: buyer.publicKey, mint,
        payerToken: buyerAta.address,
        merchantToken: merchantAta.address,
        platformToken: platformAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();

  it("splits 100 USDC at 297bp → merchant 97.03, platform 2.97", async () => {
    await paySplit(usdc(100), 297);
    const m = await conn.getTokenAccountBalance(merchantAta.address);
    const p = await conn.getTokenAccountBalance(platformAta.address);
    assert.equal(m.value.amount, "97030000"); // 97.03 USDC
    assert.equal(p.value.amount, "2970000");   // 2.97 USDC
  });

  it("floors the fee — dust to merchant, never overcharges platform", async () => {
    // 1 base unit at 297bp = 0.0297 → fee floors to 0, merchant gets the unit.
    const mBefore = (await conn.getTokenAccountBalance(merchantAta.address)).value.amount;
    const pBefore = (await conn.getTokenAccountBalance(platformAta.address)).value.amount;
    await paySplit(new anchor.BN(1), 297);
    const mAfter = (await conn.getTokenAccountBalance(merchantAta.address)).value.amount;
    const pAfter = (await conn.getTokenAccountBalance(platformAta.address)).value.amount;
    assert.equal(Number(mAfter) - Number(mBefore), 1);
    assert.equal(Number(pAfter) - Number(pBefore), 0);
  });

  it("rejects fee_bp > 10000", async () => {
    try { await paySplit(usdc(1), 10001); assert.fail("should revert"); }
    catch (e: any) { assert.match(e.toString(), /BadFeeBp|fee_bp/i); }
  });
});

#!/usr/bin/env node
// Devnet test-USDC helper for the Solana e2e. Creates a 6-decimal mint we control
// and funds arbitrary owners (incl. off-curve PDAs like a LazorKit smart wallet).
//
// Payer / mint authority = the solana CLI keypair (~/.config/solana/id.json,
// = F9neSDGmb…). Needs a little devnet SOL (same wallet that deploys the program).
//
// Usage:
//   node scripts/devnet-testmint.cjs create
//       -> prints MINT=<addr>  (put it in apps/web/.env.devnet VITE_SOLANA_USDC_MINT)
//   MINT=<addr> node scripts/devnet-testmint.cjs fund <ownerPubkey> [amountUsdc=100]
//       -> creates the owner's USDC ATA and mints test USDC to it
//   MINT=<addr> node scripts/devnet-testmint.cjs ata <ownerPubkey>
//       -> just creates/prints the owner's USDC ATA (e.g. merchant/platform)
//
// Env overrides: SOLANA_RPC, KEYPAIR.

const fs = require("fs");
const os = require("os");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = require("@solana/spl-token");

const RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const DECIMALS = 6;

function loadPayer() {
  const path = process.env.KEYPAIR || `${os.homedir()}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8"))));
}

function requireMint() {
  if (!process.env.MINT) throw new Error("set MINT=<addr> (run `create` first, then export it)");
  return new PublicKey(process.env.MINT);
}

(async () => {
  const conn = new Connection(RPC, "confirmed");
  const payer = loadPayer();
  const [cmd, owner, amountArg] = process.argv.slice(2);

  if (cmd === "create") {
    const mint = await createMint(conn, payer, payer.publicKey, null, DECIMALS);
    console.log("MINT=" + mint.toBase58());
    console.log("(put this in apps/web/.env.devnet -> VITE_SOLANA_USDC_MINT)");
    return;
  }

  if (cmd === "fund") {
    if (!owner) throw new Error("usage: MINT=<addr> ... fund <ownerPubkey> [amountUsdc]");
    const mint = requireMint();
    const ownerPk = new PublicKey(owner);
    // allowOwnerOffCurve=true: a LazorKit smart wallet is a PDA (off curve).
    const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, ownerPk, true);
    const amountUsdc = Number(amountArg || process.env.AMOUNT || "100");
    const base = BigInt(Math.round(amountUsdc * 10 ** DECIMALS));
    await mintTo(conn, payer, mint, ata.address, payer, base);
    console.log(`ATA=${ata.address.toBase58()}  minted ${amountUsdc} USDC -> ${ownerPk.toBase58()}`);
    return;
  }

  if (cmd === "ata") {
    if (!owner) throw new Error("usage: MINT=<addr> ... ata <ownerPubkey>");
    const mint = requireMint();
    const ownerPk = new PublicKey(owner);
    const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, ownerPk, true);
    console.log("ATA=" + ata.address.toBase58());
    return;
  }

  console.log("usage: create | fund <ownerPubkey> [amountUsdc] | ata <ownerPubkey>   (MINT env required for fund/ata)");
  process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });

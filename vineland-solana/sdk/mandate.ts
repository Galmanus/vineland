// Vineland mandate SDK — TypeScript client for the vineland_mandate Solana program.
// Used by the ported frontend, scripts, and the payment agent. Wallet-agnostic:
// pass any Anchor-compatible wallet (Privy embedded wallet in the browser, or a
// Keypair in Node). The biometric (Privy) wallet plugs in via the provider — no
// change here.

import {
  AnchorProvider, Program, BN, web3, type Idl,
} from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import idlJson from "../target/idl/vineland_mandate.json";

export const MANDATE_PROGRAM_ID = new PublicKey(
  "CmDKY8MxCWkCN9etSeKApHKnGuTKK6vn7qzhTkAtM9Bv",
);

const SEED = Buffer.from("mandate");

export interface MandateRules {
  agent: PublicKey;
  perPaymentCap: BN;   // base units (USDC = 6 decimals)
  monthlyCap: BN;
  periodSecs: BN;      // e.g. 2_592_000 (30d)
  allowed: PublicKey[]; // recipient owners on the allowlist (<= 8)
}

export interface MandateState {
  owner: PublicKey;
  agent: PublicKey;
  mint: PublicKey;
  perPaymentCap: BN;
  monthlyCap: BN;
  periodSecs: BN;
  periodStart: BN;
  spentInPeriod: BN;
  paused: boolean;
  allowed: PublicKey[];
}

export class VinelandMandate {
  readonly program: Program;
  constructor(provider: AnchorProvider) {
    this.program = new Program(idlJson as Idl, provider);
  }

  /** PDA for a given owner + mint. */
  pda(owner: PublicKey, mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [SEED, owner.toBuffer(), mint.toBuffer()],
      MANDATE_PROGRAM_ID,
    )[0];
  }

  /** Owner creates the mandate (delegates bounded spend to `agent`). */
  async initMandate(owner: PublicKey, mint: PublicKey, r: MandateRules): Promise<string> {
    const mandate = this.pda(owner, mint);
    return this.program.methods
      .initMandate(r.agent, r.perPaymentCap, r.monthlyCap, r.periodSecs, r.allowed)
      .accounts({ owner, mint, mandate, systemProgram: SystemProgram.programId })
      .rpc();
  }

  /** Agent charges `amount` to a recipient's token account. Fail-closed on rules.
   *  `agent` must be a signer on the provider (or passed via .signers()). */
  async charge(opts: {
    owner: PublicKey; mint: PublicKey; agent: PublicKey;
    ownerToken: PublicKey; recipientToken: PublicKey; amount: BN;
    agentSigner?: web3.Keypair;
  }): Promise<string> {
    const mandate = this.pda(opts.owner, opts.mint);
    const m = this.program.methods.charge(opts.amount).accounts({
      agent: opts.agent, mandate, mint: opts.mint,
      ownerToken: opts.ownerToken, recipientToken: opts.recipientToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
    return opts.agentSigner ? m.signers([opts.agentSigner]).rpc() : m.rpc();
  }

  async setPaused(owner: PublicKey, mint: PublicKey, paused: boolean): Promise<string> {
    return this.program.methods.setPaused(paused)
      .accounts({ owner, mandate: this.pda(owner, mint) }).rpc();
  }

  async updateCaps(owner: PublicKey, mint: PublicKey, perPaymentCap: BN, monthlyCap: BN): Promise<string> {
    return this.program.methods.updateCaps(perPaymentCap, monthlyCap)
      .accounts({ owner, mandate: this.pda(owner, mint) }).rpc();
  }

  async getMandate(owner: PublicKey, mint: PublicKey): Promise<MandateState> {
    // @ts-ignore - account namespace typed from IDL at runtime
    return this.program.account.mandate.fetch(this.pda(owner, mint));
  }
}

export { BN, PublicKey };

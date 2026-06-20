// Wallet bridge for the Vineland Solana SDK.
//
// Anchor needs a `Wallet` ({ publicKey, signTransaction, signAllTransactions }).
// - Node/dev: wrap a Keypair.
// - Browser: wrap a Privy embedded Solana wallet (biometric, no seed) — this is
//   the production path. Privy gives the user a wallet behind Face ID/passkey;
//   we adapt its signing into Anchor's Wallet. No seed phrase, ever.

import { AnchorProvider } from "@coral-xyz/anchor";
import {
  Connection, Keypair, PublicKey,
  type Transaction, type VersionedTransaction,
} from "@solana/web3.js";

type AnyTx = Transaction | VersionedTransaction;

export interface AnchorWallet {
  publicKey: PublicKey;
  signTransaction<T extends AnyTx>(tx: T): Promise<T>;
  signAllTransactions<T extends AnyTx>(txs: T[]): Promise<T[]>;
}

/** Node/dev wallet from a Keypair. */
export function keypairWallet(kp: Keypair): AnchorWallet {
  return {
    publicKey: kp.publicKey,
    async signTransaction<T extends AnyTx>(tx: T) {
      if ("version" in tx) (tx as VersionedTransaction).sign([kp]);
      else (tx as Transaction).partialSign(kp);
      return tx;
    },
    async signAllTransactions<T extends AnyTx>(txs: T[]) {
      for (const tx of txs) {
        if ("version" in tx) (tx as VersionedTransaction).sign([kp]);
        else (tx as Transaction).partialSign(kp);
      }
      return txs;
    },
  };
}

/**
 * Browser wallet from a Privy Solana wallet (the biometric production path).
 * `privyWallet` is the object from Privy's useSolanaWallets() — it exposes
 * `address` and `signTransaction` / `signAllTransactions`. The user approves with
 * Face ID/passkey; no seed.
 */
export function privyWallet(p: {
  address: string;
  signTransaction: <T extends AnyTx>(tx: T) => Promise<T>;
  signAllTransactions?: <T extends AnyTx>(txs: T[]) => Promise<T[]>;
}): AnchorWallet {
  return {
    publicKey: new PublicKey(p.address),
    signTransaction: (tx) => p.signTransaction(tx),
    signAllTransactions: async (txs) =>
      p.signAllTransactions ? p.signAllTransactions(txs)
        : Promise.all(txs.map((t) => p.signTransaction(t))),
  };
}

/** Build an AnchorProvider from a connection + any AnchorWallet. */
export function makeProvider(connection: Connection, wallet: AnchorWallet): AnchorProvider {
  // Anchor's Wallet type is structurally compatible with AnchorWallet.
  return new AnchorProvider(connection, wallet as unknown as AnchorProvider["wallet"], {
    commitment: "confirmed",
  });
}

export { Connection, Keypair, PublicKey };

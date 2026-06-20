// Active chain adapter, chosen by VITE_CHAIN (default "stellar"). Pages import
// `getChainAdapter()` and never touch a chain SDK. Stellar stays the default so
// the live product is unchanged until Solana is proven and cutover is flipped.
//
// The Solana adapter is dynamically imported so its heavy deps (@solana/web3.js,
// @coral-xyz/anchor) are code-split out of the Stellar bundle and only loaded
// when VITE_CHAIN=solana. Hence getChainAdapter() is async.

import type { ChainAdapter, ChainId } from "./types.ts";
import { stellarAdapter } from "./stellar/adapter.ts";

export * from "./types.ts";

export function activeChainId(): ChainId {
  return ((import.meta.env.VITE_CHAIN ?? "stellar").toLowerCase()) as ChainId;
}

let cached: ChainAdapter | null = null;

export async function getChainAdapter(): Promise<ChainAdapter> {
  if (cached) return cached;
  const id = activeChainId();
  switch (id) {
    case "stellar":
      cached = stellarAdapter;
      return cached;
    case "solana": {
      const { solanaAdapter } = await import("./solana/adapter.ts");
      cached = solanaAdapter;
      return cached;
    }
    default:
      throw new Error(`unknown VITE_CHAIN: ${id}`);
  }
}

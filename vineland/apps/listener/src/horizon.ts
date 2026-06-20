import { Horizon } from "@stellar/stellar-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchPaymentToOrder, type StellarPaymentEvent } from "./matcher.js";
import { reconcileMatch } from "./reconciler.js";
import { log } from "./log.js";
import { NETWORK } from "@vineland/shared";

const HORIZON: Record<"TESTNET" | "PUBLIC", string> = {
  TESTNET: NETWORK.testnet.horizon,
  PUBLIC:  NETWORK.mainnet.horizon,
};

export interface AccountWatcherDeps {
  db: SupabaseClient;
  network: "TESTNET" | "PUBLIC";
  accountId: string;
}

export async function watchAccount({ db, network, accountId }: AccountWatcherDeps): Promise<() => void> {
  const server = new Horizon.Server(HORIZON[network]);

  // resume cursor
  const { data: stateRow } = await db.from("listener_state").select("paging_token").eq("account_id", accountId).maybeSingle();
  const cursor = stateRow?.paging_token ?? "now";

  log("info", "stream_open", { account: accountId, cursor });

  const stop = server.payments()
    .forAccount(accountId)
    .cursor(cursor)
    .stream({
      onmessage: async (raw: any) => {
        try {
          if (raw.type !== "payment") return;
          const tx = await raw.transaction();
          const ev: StellarPaymentEvent = {
            memo_type: tx.memo_type,
            memo_b64: tx.memo ?? "",
            successful: tx.successful,
            asset_code: raw.asset_code,
            asset_issuer: raw.asset_issuer,
            to: raw.to,
            amount: raw.amount,
            hash: raw.transaction_hash,
          };

          const memoHex = ev.memo_type === "hash" ? Buffer.from(ev.memo_b64, "base64").toString("hex") : "";
          if (!memoHex) {
            await db.from("listener_state").upsert({ account_id: accountId, paging_token: raw.paging_token, updated_at: new Date().toISOString() });
            return;
          }
          const { data: order } = await db.from("orders")
            .select("id, merchant_id, memo, usdc_amount, merchant_stellar_address, merchants ( platform_fee_bp )")
            .eq("memo", memoHex)
            .eq("status", "pending")
            .maybeSingle();

          if (order) {
            const merchant = (order as any).merchants as { platform_fee_bp: number };
            const orderForMatch = {
              id: order.id as string,
              merchant_id: order.merchant_id as string,
              memo: order.memo as string,
              usdc_amount: order.usdc_amount as string,
              // PINNED at order creation — the matcher rejects any payment whose
              // destination drifted from the consented recipient.
              merchant_stellar_address: order.merchant_stellar_address as string,
              platform_fee_bp: merchant.platform_fee_bp,
            };
            const outcome = matchPaymentToOrder(ev, orderForMatch, network);
            await reconcileMatch(db, orderForMatch, outcome, ev.hash);
          }

          await db.from("listener_state").upsert({ account_id: accountId, paging_token: raw.paging_token, updated_at: new Date().toISOString() });
        } catch (e) {
          log("error", "stream_event_error", { error: String(e) });
        }
      },
      onerror: (e: unknown) => log("error", "stream_error", { account: accountId, error: String(e) }),
    });

  return stop;
}

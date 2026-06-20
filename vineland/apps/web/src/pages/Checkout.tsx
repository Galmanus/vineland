import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchOrder, type PublicOrder } from "../lib/api.ts";
import { Countdown } from "../components/Countdown.tsx";
import { PayButton } from "../components/PayButton.tsx";
import { Logo } from "../components/Logo.tsx";
import { getChainAdapter } from "../lib/chain/index.ts";
import { chainId } from "../lib/chain/validate.ts";

type SubmitState = "idle" | "building" | "signing" | "submitting" | "submitted" | "paid" | "error";

// Network-aware explorer base. On mainnet a hardcoded /testnet/ link points at the
// wrong network (broken link + wrong UX). Derive it from the configured network.
const EXPLORER_BASE =
  (import.meta.env.VITE_STELLAR_NETWORK ?? "TESTNET").toUpperCase() === "PUBLIC"
    ? "https://stellar.expert/explorer/public/tx"
    : "https://stellar.expert/explorer/testnet/tx";

function isEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed") === "1") return true;
  try { return window.parent !== window && window.parent != null; } catch { return true; }
}

function postToParent(msg: Record<string, unknown>) {
  if (!isEmbedded() || typeof window === "undefined") return;
  try { window.parent.postMessage(msg, "*"); } catch {}
}

export default function Checkout() {
  const { order_id } = useParams<{ order_id: string }>();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const embedded = isEmbedded();

  useEffect(() => {
    if (!order_id) return;
    fetchOrder(order_id).then(setOrder).catch(e => setError(e.message));
  }, [order_id]);

  useEffect(() => {
    if (submitState !== "submitted" || !order_id) return;
    const id = setInterval(async () => {
      try {
        const fresh = await fetchOrder(order_id);
        setOrder(fresh);
        if (fresh.status === "paid") {
          clearInterval(id);
          setSubmitState("paid");
        } else if (fresh.status === "expired") {
          clearInterval(id);
          postToParent({ type: "vineland:expired", orderId: order_id });
        }
      } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [submitState, order_id]);

  // notify parent (SDK) on terminal states
  useEffect(() => {
    if (submitState === "paid" && order_id && txHash) {
      postToParent({ type: "vineland:paid", orderId: order_id, txHash });
    }
  }, [submitState, order_id, txHash]);

  useEffect(() => {
    if (error) postToParent({ type: "vineland:error", orderId: order_id, message: error });
  }, [error, order_id]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#f1eee7] text-[#0a0a0a] flex items-center">
        <div className="max-w-[1400px] mx-auto px-8 md:px-12 py-16">
          <div className="text-xs uppercase tracking-[0.18em] text-red-700 mb-3">Error</div>
          <div className="text-3xl tracking-tight">{error}</div>
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="min-h-screen bg-[#f1eee7] flex items-center justify-center">
        <div className="text-xs uppercase tracking-[0.18em] text-[#0a0a0a]/55">Loading...</div>
      </div>
    );
  }

  const buttonLabel =
    submitState === "idle" || submitState === "error" ? `Pay ${order.usdc_amount} USDC` :
    submitState === "building" ? "Preparing..." :
    submitState === "signing" ? "Waiting for wallet..." :
    submitState === "submitting" ? "Submitting..." :
    submitState === "submitted" ? "Awaiting confirmation..." :
    "Paid";

  return (
    <div className="min-h-screen bg-[#f1eee7] text-[#0a0a0a] flex flex-col">
      {!embedded && (
        <header className="max-w-[1400px] w-full mx-auto px-8 md:px-12 py-8 flex items-center justify-between">
          <Logo />
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a]/55">
            Checkout · {order.id.slice(0, 8)}
          </div>
        </header>
      )}

      <main className="flex-1 flex items-center">
        <div className="max-w-[1400px] w-full mx-auto px-8 md:px-12 grid md:grid-cols-12 gap-8 md:gap-16 py-16 md:py-24">
          <div className="md:col-span-3 text-xs uppercase tracking-[0.18em] text-[#0a0a0a]/55">
            <span className="inline-block w-3 h-3 bg-[#FDDA24] mr-2 align-middle" />
            001. Pay with crypto
          </div>

          <div className="md:col-span-9">
            <div className="text-xs uppercase tracking-[0.18em] text-[#0a0a0a]/55 mb-4">Amount due</div>
            <div className="text-7xl md:text-9xl font-medium tabular-nums tracking-[-0.04em] leading-[0.9]">
              R$ {Number(order.brl_amount).toFixed(2)}
            </div>
            <div className="mt-6 flex items-baseline gap-6">
              <div className="text-2xl tabular-nums text-[#0a0a0a]/70">{order.usdc_amount} USDC</div>
              <div className="text-xs uppercase tracking-[0.18em] text-[#0a0a0a]/55">
                Expires in <span className="text-[#0a0a0a] tabular-nums"><Countdown expiresAt={order.expires_at} /></span>
              </div>
            </div>

            <div className="mt-16 max-w-md">
              {!walletAddress
                ? <PayButton onConnected={setWalletAddress} />
                : (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a]/55 mb-3">
                      Connected · <span className="font-mono normal-case tracking-normal">{walletAddress.slice(0,8)}...{walletAddress.slice(-4)}</span>
                    </div>
                    <button
                      disabled={submitState !== "idle" && submitState !== "error"}
                      onClick={async () => {
                        setError(null);
                        setSubmitState("building");
                        try {
                          // Merchant receive address. STOPGAP: the order only carries a
                          // Stellar address (PublicOrder.merchant_stellar_address). Until orders
                          // carry a Solana merchant address, the Solana checkout reads it from
                          // VITE_SOLANA_MERCHANT_ADDRESS (devnet e2e only).
                          const isSolana = chainId() === "solana";
                          const merchantAddress = isSolana
                            ? (import.meta.env.VITE_SOLANA_MERCHANT_ADDRESS as string | undefined)
                            : order.merchant_stellar_address;
                          if (!merchantAddress) throw new Error(isSolana
                            ? "VITE_SOLANA_MERCHANT_ADDRESS not set (devnet stopgap until orders carry a Solana merchant address)"
                            : "merchant has no stellar_address");
                          const platformAddress = import.meta.env.VITE_PLATFORM_ADDRESS;
                          if (!platformAddress) throw new Error("VITE_PLATFORM_ADDRESS not configured");
                          // Chain-agnostic: the active adapter (Stellar today) builds,
                          // signs and submits. State transitions stay user-visible.
                          setSubmitState("signing");
                          const adapter = await getChainAdapter();
                          const { hash } = await adapter.payOneTime({
                            buyerAddress: walletAddress,
                            merchantAddress,
                            platformAddress,
                            usdcAmount: order.usdc_amount,
                            platformFeeBp: 297, // 2.97% canonical (ideally read order.platform_fee_bp)
                            memoHex: order.memo,
                            maxTime: Math.floor(new Date(order.expires_at).getTime() / 1000),
                          });
                          setTxHash(hash);
                          setSubmitState("submitted");
                        } catch (e: unknown) {
                          setSubmitState("error");
                          setError(e instanceof Error ? e.message : "unknown error");
                        }
                      }}
                      className="w-full bg-[#0a0a0a] text-[#f1eee7] py-5 text-sm uppercase tracking-[0.18em] hover:bg-[#1a1a1a] disabled:opacity-50"
                    >
                      {buttonLabel}
                    </button>
                    {submitState === "submitted" && txHash && (
                      <div className="mt-6 border-l-2 border-amber-500 pl-4">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a]/70">Tx submitted · awaiting confirmation</div>
                        <a className="text-xs font-mono mt-2 block break-all hover:opacity-60"
                           href={`${EXPLORER_BASE}/${txHash}`} target="_blank" rel="noreferrer">
                          {txHash}
                        </a>
                      </div>
                    )}
                    {submitState === "paid" && (
                      <div className="mt-6 border-l-2 border-[#FDDA24] pl-4">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a] flex items-center gap-2">
                          <span className="inline-block w-1.5 h-1.5 bg-[#FDDA24]" />
                          Payment confirmed
                        </div>
                        {txHash && (
                          <a className="text-xs font-mono mt-2 block break-all hover:opacity-60"
                             href={`${EXPLORER_BASE}/${txHash}`} target="_blank" rel="noreferrer">
                            {txHash}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>
      </main>

      {!embedded && (
        <footer className="border-t border-[#0a0a0a]/10">
          <div className="max-w-[1400px] mx-auto px-8 md:px-12 py-6 text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a]/55">
            Non-custodial · Powered by Stellar · USDC by Circle
          </div>
        </footer>
      )}
    </div>
  );
}

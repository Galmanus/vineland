// Frontend client for the 4P Finance on-ramp (backend route /api/v1/4p).
// The backend holds the x-api-key; this client only sends the buyer's request
// with their Supabase JWT (the 4P endpoints sit behind requireApiKeyOrJwt).
//
// 4P settles USDC on EVM/Solana (NOT Stellar), so the buyer supplies the wallet
// address that receives the crypto.

import { authFetch } from "./apiAuth.ts";

export class Ramp4pError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number) {
    super(message);
    this.name = "Ramp4pError";
  }
}

async function handle<T>(res: Response): Promise<T> {
  let json: unknown = null;
  try { json = await res.json(); } catch { /* non-json */ }
  if (!res.ok) {
    const j = json as { error?: string; message?: string } | null;
    if (res.status === 503) throw new Ramp4pError("disabled", "Pagamento em Pix ainda não está ligado.", 503);
    if (res.status === 401) throw new Ramp4pError("auth", "Entre na sua conta para continuar.", 401);
    throw new Ramp4pError(j?.error ?? "error", j?.message ?? `Erro ${res.status}`, res.status);
  }
  return json as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await authFetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch { throw new Ramp4pError("network", "Sem conexão com o servidor."); }
  return handle<T>(res);
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try { res = await authFetch(path); } catch { throw new Ramp4pError("network", "Sem conexão."); }
  return handle<T>(res);
}

export interface Ramp4pStatus {
  enabled: boolean;
  chain?: string;
  asset?: string;
}

export async function status4p(): Promise<Ramp4pStatus> {
  try { return await get<Ramp4pStatus>("/v1/4p/status"); }
  catch { return { enabled: false }; }
}

/** Returns the approximate crypto amount received for `brl` (asset per 4P). */
export async function quote4p(brl: number): Promise<{ cryptoOut: number | null; asset: string | null }> {
  const { quote } = await post<{ quote: { quote?: Record<string, { price: number }> } }>(
    "/v1/4p/quote", { amountBrl: brl },
  );
  const map = quote?.quote ?? {};
  const asset = Object.keys(map)[0] ?? null;
  const entry = asset ? map[asset] : undefined;
  return { cryptoOut: entry ? entry.price : null, asset };
}

export type Ramp4pStatusValue =
  | "pending" | "paid" | "processing" | "completed" | "confirmed" | "failed" | string;

export interface Ramp4pOrder {
  id: string;
  txid?: string;
  pixCopiaECola?: string;
  status?: Ramp4pStatusValue;
}

/** Create a Pix on-ramp; USDC settles to `receiverWallet` (EVM/Solana). */
export async function createOnramp4p(input: {
  amountBrl: number;
  receiverWallet: string;
  email: string;
  cpf: string;
}): Promise<Ramp4pOrder> {
  const { order } = await post<{ order: Ramp4pOrder }>("/v1/4p/onramp", {
    amountBrl: input.amountBrl,
    receiverWallet: input.receiverWallet,
    email: input.email,
    cpf: input.cpf,
  });
  return order;
}

/** Poll an on-ramp's status (from the webhook-backed store). The store returns a
 * RampTxRecord whose `transactionStatus` carries 4P's status (e.g. "paid"). */
export async function getOnramp4p(id: string): Promise<{ transactionStatus?: string }> {
  const { order } = await get<{ order: { transactionStatus?: string } }>(
    `/v1/4p/onramp/${encodeURIComponent(id)}`,
  );
  return order;
}

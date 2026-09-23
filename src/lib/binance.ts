// Signed Binance Web3 API client.
//
// Auth (per /en/dev-docs/authentication): every request carries
// X-OC-APIKEY + X-OC-TIMESTAMP (ISO-8601 ms) + X-OC-SIGN =
// Base64(HMAC-SHA256(secret, timestamp + METHOD + requestPath + body)),
// where requestPath includes the `/build` prefix plus the RAW query string,
// and body is "" for GET. Base URL: https://web3.binance.com/build.
//
// Keys live server-side only (BINANCE_API_KEY / BINANCE_API_SECRET env).

import { createHmac, randomUUID } from "node:crypto";

const BASE = (process.env.BINANCE_BASE_URL || "https://web3.binance.com").replace(/\/$/, "") + "/build";

function creds(): { key: string; secret: string } {
  const key = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_API_SECRET;
  if (!key || !secret) throw new Error("BINANCE_API_KEY / BINANCE_API_SECRET missing");
  return { key, secret };
}

function timestamp(): string {
  return isoTimestamp();
}

function sign(secret: string, ts: string, method: string, requestPath: string, body: string): string {
  return createHmac("sha256", secret).update(ts + method + requestPath + body, "utf8").digest("base64");
}

/** Exported for unit tests: deterministic signature builder. */
export function signRequest(secret: string, timestamp: string, method: string, requestPath: string, body: string): string {
  return sign(secret, timestamp, method, requestPath, body);
}

export function isoTimestamp(d = new Date()): string {
  return d.toISOString();
}

function queryString(params: Record<string, string>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.append(k, v);
  return qs.toString();
}

interface OcResult<T> {
  code: number;
  message?: string | null;
  data?: T;
  success?: boolean;
}

async function oc<T>(method: "GET" | "POST", path: string, params: Record<string, string> = {}, body: unknown = null): Promise<T> {
  const { key, secret } = creds();
  const qs = queryString(params);
  const requestPath = `/build${path}${qs ? `?${qs}` : ""}`;
  const bodyStr = method === "GET" ? "" : JSON.stringify(body ?? {});
  const ts = timestamp();
  const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-OC-APIKEY": key,
      "X-OC-TIMESTAMP": ts,
      "X-OC-SIGN": sign(secret, ts, method, requestPath, bodyStr),
      "X-OC-NONCE": randomUUID(),
    },
    body: method === "GET" ? undefined : bodyStr,
  });
  if (!res.ok) throw new Error(`web3 api http ${res.status} for ${path}`);
  const out = (await res.json()) as OcResult<T>;
  if (typeof out.code === "number" && out.code !== 0) {
    throw new Error(`web3 api code ${out.code}: ${out.message ?? "unknown"} (${path})`);
  }
  return (out.data ?? out) as T;
}

export const ocGet = <T>(path: string, params?: Record<string, string>): Promise<T> => oc<T>("GET", path, params);
export const ocPost = <T>(path: string, body: unknown, params?: Record<string, string>): Promise<T> =>
  oc<T>("POST", path, params, body);

// ── Trading API ─────────────────────────────────────────────

export interface RfqRoute {
  vendor?: string;
  quoteId?: string;
  toTokenAmount?: string;
  executionMode?: string;
  [k: string]: unknown;
}

export type QuoteRoute = RfqRoute & {
  vendorName?: string;
  quoteId?: string;
  toTokenAmount?: string;
  executionMode?: string;
};

/** Note: the live API returns a bare ARRAY of routes (verified 2026-09-23). */
export function tradingQuote(params: {
  binanceChainId: string;
  amount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  userWalletAddress?: string;
}): Promise<QuoteRoute[]> {
  const p: Record<string, string> = {
    binanceChainId: params.binanceChainId,
    amount: params.amount,
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
  };
  if (params.userWalletAddress) p.userWalletAddress = params.userWalletAddress;
  return ocGet<QuoteRoute[]>("/api/v1/dex/aggregator/quote", p);
}

export function tradingSwap(params: {
  binanceChainId: string;
  amount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  userWalletAddress: string;
  quoteId: string;
  slippagePercent?: string;
}): Promise<{
  executionMode?: string;
  rfq?: { typedDataToSign?: unknown; vendor?: string; orderId?: string; signingScheme?: string; [k: string]: unknown };
  tx?: unknown;
  [k: string]: unknown;
}> {
  return ocGet("/api/v1/dex/aggregator/swap", {
    binanceChainId: params.binanceChainId,
    amount: params.amount,
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    userWalletAddress: params.userWalletAddress,
    quoteId: params.quoteId,
    slippagePercent: params.slippagePercent ?? "1",
  });
}

export function rfqSubmit(body: {
  requestId: string;
  userSignature: string;
  vendor: string;
  quoteId: string;
  signingScheme?: string;
}): Promise<{ orderId?: string; [k: string]: unknown }> {
  return ocPost("/api/v1/dex/aggregator/order/submit", body);
}

export function rfqStatus(orderId: string): Promise<{ status?: string; [k: string]: unknown }> {
  return ocGet(`/api/v1/dex/aggregator/order/${orderId}`);
}

// ── Transaction API ─────────────────────────────────────────

export function txSimulate(body: {
  binanceChainId: string;
  evmTx: { from: string; to: string; value: string; data: string };
}): Promise<{ status?: unknown; balanceChanges?: unknown; [k: string]: unknown }> {
  return ocPost("/api/v1/dex/pre-transaction/simulate", body);
}

// ── Wallet API ──────────────────────────────────────────────

export function walletBalances(
  address: string,
  chains: string,
  pageSize = 100,
): Promise<{ list?: Array<Record<string, unknown>>; [k: string]: unknown }> {
  return ocGet("/api/v1/dex/balance/all-token-balances-by-address", {
    address,
    chains,
    pageSize: String(pageSize),
  });
}

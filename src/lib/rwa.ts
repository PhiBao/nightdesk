// NightDesk RWA layer — public Binance Web3 reads (no key) + deterministic math.
// Code owns prices, spreads, sessions. TypeSafe only judges intent/risk (see guard.ts).

const BASE = "https://www.binance.com";
const WEB3 = "https://web3.binance.com";
const UA = { "User-Agent": "NightDesk/0.1 (hackathon)" };
const SKILL_UA = { "User-Agent": "binance-web3/1.1 (Skill)", "Accept-Encoding": "identity" };

export type IssuerType = 1 | 2 | 3; // 1=Ondo …on, 2=xStocks …x, 3=bStocks …B

export interface RwaRow {
  chainId: string;
  contractAddress: string;
  symbol: string;
  ticker: string;
  type: number;
  multiplier: string;
}

export interface TruthQuote {
  ticker: string;
  symbol: string;
  chainId: string;
  contractAddress: string;
  issuerType: number;
  onchainPrice: number | null;
  refPrice: number | null;
  spreadBps: number | null; // (onchain - ref)/ref * 1e4
  session: string; // marketStatus from API, e.g. "overnight" | "regular" | "closed"
  openState: boolean;
  reasonCode: string | null;
  nextOpenTime: number | null;
  nextCloseTime: number | null;
  stalenessMs: number | null;
  holders: number | null;
  multiplier: string | null;
  maxNotional: number | null;
  fetchedAt: number;
}

const TICKER_RE = /^[A-Z][A-Z.]{0,9}$/;

export function assertTicker(t: string): string {
  const u = t.trim().toUpperCase();
  if (!TICKER_RE.test(u)) throw new Error(`invalid ticker: ${t}`);
  return u;
}

export function spreadBps(onchain: number | null, ref: number | null): number | null {
  if (onchain == null || ref == null || !Number.isFinite(onchain) || !Number.isFinite(ref) || ref <= 0) return null;
  return ((onchain - ref) / ref) * 1e4;
}

/** Session badge: deterministic, from statusInfo. Never ask the model for this. */
export function sessionBadge(q: Pick<TruthQuote, "session" | "openState" | "reasonCode">): string {
  if (q.reasonCode && q.reasonCode !== "TRADING") return `HALTED · ${q.reasonCode}`;
  if (!q.openState) return "CLOSED";
  const s = (q.session || "").toLowerCase();
  if (s.includes("pre")) return "PRE-MARKET";
  if (s.includes("post") || s.includes("after")) return "POST-MARKET";
  if (s.includes("overnight")) return "OVERNIGHT";
  if (s.includes("regular") || s.includes("open")) return "OPEN";
  if (s.includes("weekend") || s.includes("closed")) return "WEEKEND";
  return q.session ? q.session.toUpperCase() : "UNKNOWN";
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!res.ok) throw new Error(`upstream ${res.status} for ${url}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(t);
  }
}

async function fetchWeb3(path: string, timeoutMs = 12000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${WEB3}${path}`, { headers: SKILL_UA, signal: ctrl.signal });
    if (!res.ok) throw new Error(`web3 upstream ${res.status} for ${path}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(t);
  }
}

/** On-chain DEX reality check: real buy/sell volume (tokenInfo.volume24h is US-stock volume, NOT this). */
export interface DexDynamic {
  priceUsd: number | null;
  volume24hBuy: number | null;
  volume24hSell: number | null;
  liquidityUsd: number | null;
}

export async function dexDynamic(chainId: string, contractAddress: string): Promise<DexDynamic | null> {
  try {
    const raw = (await fetchWeb3(
      `/bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info/ai?chainId=${encodeURIComponent(chainId)}&contractAddress=${encodeURIComponent(contractAddress)}`,
    )) as { code?: string; data?: Record<string, string | null> };
    if (!raw || raw.code !== "000000" || !raw.data) return null;
    const d = raw.data;
    const num = (v: string | null | undefined): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      priceUsd: num(d.price),
      volume24hBuy: num(d.volume24hBuy),
      volume24hSell: num(d.volume24hSell),
      liquidityUsd: num(d.liquidity ?? d.tvl),
    };
  } catch {
    return null;
  }
}

/** Token security pre-check for the buy screen: honeypot/tax/verification flags. */
export interface TokenAudit {
  riskLevel: string | null;
  riskScore: number | null;
  buyTax: string | null;
  sellTax: string | null;
  isVerified: boolean | null;
}

export async function tokenAudit(chainId: string, contractAddress: string): Promise<TokenAudit | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${WEB3}/bapi/defi/v1/public/wallet-direct/security/token/audit`, {
        method: "POST",
        headers: { ...SKILL_UA, "Content-Type": "application/json", source: "agent" },
        signal: ctrl.signal,
        body: JSON.stringify({ binanceChainId: chainId, contractAddress, requestId: crypto.randomUUID() }),
      });
      if (!res.ok) return null;
      const raw = (await res.json()) as { code?: string; data?: Record<string, unknown> };
      const d = raw?.data;
      if (!raw || raw.code !== "000000" || !d) return null;
      const extra = (d.extraInfo ?? {}) as Record<string, unknown>;
      return {
        riskLevel: typeof d.riskLevelEnum === "string" ? d.riskLevelEnum : null,
        riskScore: typeof d.riskLevel === "number" ? d.riskLevel : null,
        buyTax: extra.buyTax != null ? String(extra.buyTax) : null,
        sellTax: extra.sellTax != null ? String(extra.sellTax) : null,
        isVerified: typeof extra.isVerified === "boolean" ? extra.isVerified : null,
      };
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

export async function listRwa(type: IssuerType): Promise<RwaRow[]> {
  const url = `${BASE}/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=${type}`;
  const raw = (await fetchJson(url)) as { code?: string; data?: RwaRow[] };
  if (!raw || raw.code !== "000000" || !Array.isArray(raw.data)) throw new Error("bad RWA list response");
  return raw.data;
}

export async function findVenues(ticker: string): Promise<RwaRow[]> {
  const t = assertTicker(ticker);
  const types: IssuerType[] = [1, 2, 3];
  const lists = await Promise.all(types.map((ty) => listRwa(ty).catch(() => [] as RwaRow[])));
  const out: RwaRow[] = [];
  for (const rows of lists) for (const r of rows) {
    if (r.ticker?.toUpperCase() === t && String(r.chainId) === "56") out.push(r);
  }
  return out;
}

interface DynamicResp {
  code?: string;
  success?: boolean;
  data?: {
    symbol?: string;
    ticker?: string;
    type?: number;
    tokenInfo?: { price?: string; totalHolders?: string };
    stockInfo?: { price?: string | null };
    statusInfo?: {
      openState?: boolean;
      marketStatus?: string;
      reasonCode?: string | null;
      nextOpenTime?: number | null;
      nextCloseTime?: number | null;
    };
    limitInfo?: { maxActiveNotionalValue?: string | null };
  };
}

export async function dynamicQuote(row: RwaRow): Promise<TruthQuote> {
  const url =
    `${BASE}/bapi/defi/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai` +
    `?chainId=${encodeURIComponent(row.chainId)}&contractAddress=${encodeURIComponent(row.contractAddress)}`;
  const raw = (await fetchJson(url)) as DynamicResp;
  if (!raw || raw.code !== "000000" || !raw.data) throw new Error("bad dynamic response");
  const d = raw.data;
  const onchain = d.tokenInfo?.price != null ? Number(d.tokenInfo.price) : null;
  const ref = d.stockInfo?.price != null ? Number(d.stockInfo.price) : null;
  const st = d.statusInfo ?? {};
  return {
    ticker: row.ticker.toUpperCase(),
    symbol: row.symbol,
    chainId: row.chainId,
    contractAddress: row.contractAddress,
    issuerType: row.type,
    onchainPrice: Number.isFinite(onchain as number) ? (onchain as number) : null,
    refPrice: Number.isFinite(ref as number) ? (ref as number) : null,
    spreadBps: spreadBps(
      Number.isFinite(onchain as number) ? (onchain as number) : null,
      Number.isFinite(ref as number) ? (ref as number) : null,
    ),
    session: st.marketStatus ?? "unknown",
    openState: st.openState ?? false,
    reasonCode: st.reasonCode ?? null,
    nextOpenTime: st.nextOpenTime ?? null,
    nextCloseTime: st.nextCloseTime ?? null,
    stalenessMs: null, // computed against nextOpenTime by the caller when ref is frozen
    holders: d.tokenInfo?.totalHolders != null ? Number(d.tokenInfo.totalHolders) : null,
    multiplier: row.multiplier ?? null,
    maxNotional: d.limitInfo?.maxActiveNotionalValue != null ? Number(d.limitInfo.maxActiveNotionalValue) : null,
    fetchedAt: Date.now(),
  };
}

/** Truth card for one ticker: all BSC venues, cheapest-first. Throws only if every venue fails. */
export async function truthCard(ticker: string): Promise<TruthQuote[]> {
  const venues = await findVenues(ticker);
  if (venues.length === 0) throw new Error(`no BSC venue for ${ticker}`);
  const quotes = await Promise.all(venues.map((r) => dynamicQuote(r).catch(() => null)));
  const ok = quotes.filter((q): q is TruthQuote => q !== null);
  if (ok.length === 0) throw new Error(`all venue quotes failed for ${ticker}`);
  return ok.sort((a, b) => (a.onchainPrice ?? Infinity) - (b.onchainPrice ?? Infinity));
}

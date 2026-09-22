/**
 * NightDesk truth context — deterministic market data for the seller's jobs.
 *
 * A buyer asks for e.g. "NVDA weekend spread report". Code (this module)
 * fetches live RWA data and computes spreads/sessions; the LLM only narrates
 * the numbers into the deliverable. Money never touches the model: the quote
 * price is fixed in studio.toml and signed by fixed code in signing.ts.
 *
 * Pure public reads — no API keys.
 */

const BASE = "https://www.binance.com";
const UA = { "User-Agent": "NightDesk-Seller/0.1 (hackathon)" };

interface RwaRow {
  chainId: string;
  contractAddress: string;
  symbol: string;
  ticker: string;
  type: number;
  multiplier?: string;
}

async function getJson(url: string, timeoutMs = 10000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(t);
  }
}

function extractTicker(task: string): string {
  const m = task.toUpperCase().match(/\b[A-Z]{2,5}\b/);
  const stop = new Set(["THE", "AND", "FOR", "JOB", "WITH", "REPORT", "SPREAD", "PLEASE", "DELIVER"]);
  if (m && !stop.has(m[0])) return m[0];
  return "NVDA";
}

function spreadBps(onchain: number | null, ref: number | null): number | null {
  if (onchain == null || ref == null || !Number.isFinite(onchain) || !Number.isFinite(ref) || ref <= 0) return null;
  return ((onchain - ref) / ref) * 1e4;
}

function badge(session: string, open: boolean, reason: string | null): string {
  if (reason && reason !== "TRADING") return `HALTED ${reason}`;
  if (!open) return "CLOSED";
  const s = session.toLowerCase();
  if (s.includes("pre")) return "PRE-MARKET";
  if (s.includes("post") || s.includes("after")) return "POST-MARKET";
  if (s.includes("overnight")) return "OVERNIGHT";
  if (s.includes("regular") || s.includes("open")) return "OPEN";
  return session.toUpperCase() || "UNKNOWN";
}

/**
 * Build the live market context block for a job task. Never throws —
 * returns a degraded note when upstream is unreachable.
 */
export async function nightdeskContext(task: string): Promise<string> {
  const ticker = extractTicker(task);
  try {
    const lists = await Promise.all(
      [1, 2, 3].map((ty) =>
        getJson(`${BASE}/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=${ty}`).catch(
          () => null,
        ),
      ),
    );
    const venues: RwaRow[] = [];
    for (const l of lists) {
      const rows = (l as { code?: string; data?: RwaRow[] } | null)?.data ?? [];
      for (const r of rows) {
        if (r.ticker?.toUpperCase() === ticker && String(r.chainId) === "56") venues.push(r);
      }
    }
    if (venues.length === 0) return `No BSC venue found for ticker ${ticker}.`;
    const lines: string[] = [];
    for (const v of venues.slice(0, 4)) {
      try {
        const raw = (await getJson(
          `${BASE}/bapi/defi/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai?chainId=${v.chainId}&contractAddress=${v.contractAddress}`,
        )) as {
          code?: string;
          data?: {
            tokenInfo?: { price?: string; totalHolders?: string };
            stockInfo?: { price?: string | null };
            statusInfo?: { openState?: boolean; marketStatus?: string; reasonCode?: string | null };
          };
        };
        const d = raw?.data;
        if (!d) continue;
        const on = d.tokenInfo?.price != null ? Number(d.tokenInfo.price) : null;
        const ref = d.stockInfo?.price != null ? Number(d.stockInfo.price) : null;
        const sp = spreadBps(Number.isFinite(on as number) ? (on as number) : null, Number.isFinite(ref as number) ? (ref as number) : null);
        const issuer = v.type === 1 ? "Ondo" : v.type === 2 ? "xStocks" : "bStocks";
        lines.push(
          `- ${v.symbol} (${issuer}): on-chain ${on?.toFixed(2) ?? "?"}, reference ${ref?.toFixed(2) ?? "frozen"}, ` +
            `spread ${sp != null ? (sp / 100).toFixed(2) + "%" : "n/a"}, session ${badge(d.statusInfo?.marketStatus ?? "", d.statusInfo?.openState ?? false, d.statusInfo?.reasonCode ?? null)}, holders ${d.tokenInfo?.totalHolders ?? "?"}`,
        );
      } catch {
        lines.push(`- ${v.symbol}: quote failed`);
      }
    }
    return (
      `LIVE BSC TRUTH for ${ticker} (computed in code ${new Date().toISOString()}, trust over prior knowledge):\n` +
      lines.join("\n") +
      `\nStructural note (verified 2026-09-22): tokenized-stock V3 pools price correctly but revert on delivery to retail wallets; ` +
      `EOA-to-EOA movement works (probe tx mined). Recommend limit-at-reference or alert-at-open, never blind market buys after hours.`
    );
  } catch (e) {
    return `Live market fetch failed (${e instanceof Error ? e.message : e}); answer from general knowledge and say so.`;
  }
}

"use client";

import { useEffect, useRef, useState } from "react";

interface Quote {
  ticker: string;
  symbol: string;
  chainId: string;
  contractAddress: string;
  issuerType: number;
  onchainPrice: number | null;
  refPrice: number | null;
  spreadBps: number | null;
  session: string;
  badge: string;
  openState: boolean;
  reasonCode: string | null;
  holders: number | null;
}

interface Verdict {
  intent: string;
  intentConfidence: number;
  severity: number;
  severityConfidence: number;
  shouldBlockMarket: number;
  staleRisk: number;
  action: string;
  blocked: boolean;
  source: string;
}

interface Alert {
  id: string;
  ticker: string;
  note: string | null;
  status: string;
  createdAt: number;
  triggeredAt: number | null;
}

interface LimitIntent {
  id: string;
  ticker: string;
  symbol: string;
  refPrice: number;
  sizeUsd: number;
  approxTokens: number;
  status: string;
  simulation: { ok: boolean; reason: string; next: string };
}

interface Holding {
  symbol: string;
  contract: string | null;
  formatted: string;
}

const ISSUER = (t: number) => (t === 1 ? "Ondo" : t === 2 ? "xStocks" : t === 3 ? "bStocks" : `type${t}`);

const BADGE_STYLE: Record<string, string> = {
  OPEN: "bg-mint-900 text-mint-400 ring-1 ring-mint-500/40",
  "PRE-MARKET": "bg-ink-700 text-link-400 ring-1 ring-link-400/30",
  "POST-MARKET": "bg-ink-700 text-link-400 ring-1 ring-link-400/30",
  OVERNIGHT: "bg-amber-glow-900 text-amber-glow-400 ring-1 ring-amber-glow-400/30",
  WEEKEND: "bg-amber-glow-900 text-amber-glow-400 ring-1 ring-amber-glow-400/30",
  CLOSED: "bg-amber-glow-900 text-amber-glow-400 ring-1 ring-amber-glow-400/30",
};

function badgeClass(badge: string, reasonCode: string | null): string {
  if (reasonCode && reasonCode !== "TRADING") return "bg-ink-700 text-rose-soft-400 ring-1 ring-rose-soft-400/40";
  return BADGE_STYLE[badge] ?? "bg-ink-700 text-mist-500 ring-1 ring-ink-600";
}

function spreadClass(bps: number | null): string {
  if (bps == null) return "text-mist-500";
  if (Math.abs(bps) <= 50) return "text-mist-300";
  return bps > 0 ? "text-amber-glow-400" : "text-mint-400";
}

function fmtSpread(bps: number | null): string {
  if (bps == null) return "—";
  const pct = bps / 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function Meter({ label, value, display }: { label: string; value: number; display: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-mist-500">{label}</span>
        <span className="tabular font-mono text-mist-300">{display}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
        <div className="h-full rounded-full bg-gradient-to-r from-mint-500 to-link-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Card({ label, id, children }: { label: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={label} className="rounded-2xl border border-ink-600 bg-ink-800/70 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur sm:p-6">
      {children}
    </section>
  );
}

const inputCls =
  "rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-mist-100 placeholder:text-mist-500 outline-none transition focus:border-mint-500/60 focus:ring-2 focus:ring-mint-500/20";
const btnPrimary =
  "rounded-lg bg-mint-500 px-5 py-2 text-sm font-semibold text-ink-950 transition hover:bg-mint-400 disabled:cursor-not-allowed disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-ink-600 bg-ink-700/60 px-4 py-2 text-sm text-mist-100 transition hover:border-mist-500/50 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function Page() {
  const [ticker, setTicker] = useState("NVDA");
  const [text, setText] = useState("Buy $200 NVDA, don't overpay");
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sizeUsd, setSizeUsd] = useState("200");
  const [acting, setActing] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [intent, setIntent] = useState<LimitIntent | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [holdAddr, setHoldAddr] = useState("0x4Ba1e9e275EF61B56C99532D0066506436201D73");
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [holdScan, setHoldScan] = useState<string | null>(null);
  const autoStarted = useRef(false);

  async function check() {
    setLoading(true);
    setError(null);
    setVerdict(null);
    try {
      const t = await fetch(`/api/truth?ticker=${encodeURIComponent(ticker.trim())}`);
      const tj = (await t.json()) as { ok: boolean; quotes?: Quote[]; error?: string };
      if (!tj.ok) throw new Error(tj.error ?? "truth failed");
      setQuotes(tj.quotes ?? []);
      const g = await fetch("/api/guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.trim(), text }),
      });
      const gj = (await g.json()) as { ok: boolean; verdict?: Verdict; error?: string };
      if (!gj.ok) throw new Error(gj.error ?? "guard failed");
      setVerdict(gj.verdict ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAlerts() {
    try {
      const r = await fetch("/api/alerts");
      const j = (await r.json()) as { ok: boolean; alerts?: Alert[] };
      if (j.ok) setAlerts(j.alerts ?? []);
    } catch {
      /* alerts are secondary — never break the main flow */
    }
  }

  async function armLimit() {
    setActing(true);
    setReceipt(null);
    try {
      const r = await fetch("/api/limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.trim(), sizeUsd: Number(sizeUsd) }),
      });
      const j = (await r.json()) as { ok: boolean; intent?: LimitIntent; error?: string };
      if (!j.ok) throw new Error(j.error ?? "limit failed");
      setIntent(j.intent ?? null);
      const it = j.intent!;
      setReceipt(
        `Limit armed (paper): $${it.sizeUsd} → ~${it.approxTokens.toFixed(4)} ${it.symbol} @ ref $${it.refPrice.toFixed(2)}. Simulation: ${it.simulation.reason}`,
      );
    } catch (e) {
      setReceipt(`Limit failed: ${(e as Error).message}`);
    } finally {
      setActing(false);
    }
  }

  async function alertAtOpen() {
    setActing(true);
    setReceipt(null);
    try {
      const r = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.trim(), note: text.slice(0, 200) }),
      });
      const j = (await r.json()) as { ok: boolean; alert?: Alert; error?: string };
      if (!j.ok) throw new Error(j.error ?? "alert failed");
      setReceipt(`Alert armed: ping when ${j.alert!.ticker} reference market reopens.`);
      await refreshAlerts();
    } catch (e) {
      setReceipt(`Alert failed: ${(e as Error).message}`);
    } finally {
      setActing(false);
    }
  }

  async function checkHoldings() {
    setActing(true);
    setReceipt(null);
    try {
      const r = await fetch(`/api/holdings?address=${encodeURIComponent(holdAddr.trim())}`);
      const j = (await r.json()) as { ok: boolean; holdings?: Holding[]; bscscan?: string; error?: string };
      if (!j.ok) throw new Error(j.error ?? "holdings failed");
      setHoldings(j.holdings ?? []);
      setHoldScan(j.bscscan ?? null);
    } catch (e) {
      setReceipt(`Holdings failed: ${(e as Error).message}`);
    } finally {
      setActing(false);
    }
  }

  async function revoke(target: "halt" | "resume" | "allowance") {
    setActing(true);
    setReceipt(null);
    try {
      const r = await fetch("/api/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const j = (await r.json()) as { ok: boolean; hash?: string; error?: string };
      if (!j.ok) throw new Error(j.error ?? "revoke failed");
      setReceipt(
        target === "allowance" ? `Approval revoked: ${j.hash}` : target === "halt" ? "Kill-switch ENGAGED — live fills refused." : "Kill-switch released.",
      );
    } catch (e) {
      setReceipt(`Revoke failed: ${(e as Error).message}`);
    } finally {
      setActing(false);
    }
  }

  const best = quotes?.[0];

  // Judges (and screenshots) see live data with zero interaction.
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const visibleHoldings = holdings?.filter((h) => !/^0(\.0+)?$/.test(h.formatted)) ?? [];

  return (
    <div className="space-y-5">
      {/* ── top bar ─────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-mint-400 to-link-400 font-mono text-lg font-bold text-ink-950">
            N
          </div>
          <div>
            <div className="text-lg font-bold leading-none tracking-tight">NightDesk</div>
            <div className="mt-1 text-[11px] leading-none text-mist-500">session-aware tokenized stocks</div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-500/30 bg-mint-900 px-2.5 py-1 font-medium text-mint-400">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-mint-400" /> LIVE · BSC
          </span>
          <span className="rounded-full border border-ink-600 bg-ink-800 px-2.5 py-1 text-mist-500">BNB Hack · spot only</span>
          <a className="rounded-full border border-ink-600 bg-ink-800 px-2.5 py-1 text-link-400 transition hover:border-link-400/40" href="https://github.com/PhiBao/nightdesk" target="_blank" rel="noreferrer">
            repo
          </a>
        </div>
      </header>

      {/* ── hero ────────────────────────────────── */}
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          See what the after-hours price <span className="bg-gradient-to-r from-mint-400 to-link-400 bg-clip-text text-transparent">means</span> before you pay it.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-mist-500">
          It&apos;s Sunday 2am. The reference is frozen. The token isn&apos;t. NightDesk compares every venue, scores the
          staleness, and routes you to a limit — never a blind market buy.
        </p>
      </div>

      {/* ── controls ────────────────────────────── */}
      <Card label="Query">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-mist-500">Ticker</span>
            <input id="ticker" aria-label="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} className={`${inputCls} w-28 font-mono uppercase`} maxLength={10} placeholder="NVDA" />
          </label>
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-mist-500">Intent, in plain English</span>
            <input id="intent" aria-label="Intent" value={text} onChange={(e) => setText(e.target.value)} className={`${inputCls} w-full`} maxLength={500} placeholder="Buy $200 NVDA, don't overpay" />
          </label>
          <button id="check-truth" onClick={check} disabled={loading} className={`${btnPrimary} whitespace-nowrap py-2.5`}>
            {loading ? "Checking…" : "Check truth →"}
          </button>
        </div>
        {loading && (
          <div className="mt-4 space-y-2" aria-label="Loading">
            <div className="skeleton h-16 rounded-xl" />
            <div className="skeleton h-24 rounded-xl" />
          </div>
        )}
      </Card>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-soft-400/40 bg-rose-soft-400/10 px-4 py-3 text-sm text-rose-soft-400">
          {error}
        </div>
      )}
      {!quotes && !error && !loading && (
        <div className="rounded-2xl border border-dashed border-ink-600 px-4 py-10 text-center text-sm text-mist-500">
          Enter a ticker above — the live truth card, guard verdict, and holdings will appear here.
        </div>
      )}

      {/* ── truth card ──────────────────────────── */}
      {best && (
        <Card label="Truth card" id="truth-card">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-2xl font-bold tracking-tight">{best.ticker}</span>
            <span className={`rounded-full px-3 py-1 font-mono text-xs font-semibold ${badgeClass(best.badge, best.reasonCode)}`}>
              {best.reasonCode && best.reasonCode !== "TRADING" ? `HALTED · ${best.reasonCode}` : best.badge}
            </span>
            {best.refPrice == null && (
              <span className="text-xs text-amber-glow-400">reference frozen — staleness signal, not a bug</span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-ink-900/70 p-3.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-mist-500">Best on-chain</div>
              <div className="tabular mt-1 font-mono text-xl font-semibold">
                {best.onchainPrice != null ? `$${best.onchainPrice.toFixed(2)}` : "—"}
              </div>
              <div className="mt-0.5 text-xs text-mist-500">{best.symbol}</div>
            </div>
            <div className="rounded-xl bg-ink-900/70 p-3.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-mist-500">Reference</div>
              <div className="tabular mt-1 font-mono text-xl font-semibold">
                {best.refPrice != null ? `$${best.refPrice.toFixed(2)}` : "frozen"}
              </div>
              <div className="mt-0.5 text-xs text-mist-500">{best.refPrice != null ? "live reference" : "last close"}</div>
            </div>
            <div className="rounded-xl bg-ink-900/70 p-3.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-mist-500">Weekend premium</div>
              <div className={`tabular mt-1 font-mono text-xl font-semibold ${spreadClass(best.spreadBps)}`}>
                {fmtSpread(best.spreadBps)}
              </div>
              <div className="mt-0.5 text-xs text-mist-500">on-chain vs reference</div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-ink-600/60">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="bg-ink-900/70 text-left text-[11px] uppercase tracking-wider text-mist-500">
                  <th className="px-4 py-2.5 font-medium">Venue</th>
                  <th className="px-4 py-2.5 text-right font-medium">On-chain</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reference</th>
                  <th className="px-4 py-2.5 text-right font-medium">Spread</th>
                  <th className="px-4 py-2.5 text-right font-medium">Holders</th>
                </tr>
              </thead>
              <tbody>
                {quotes!.map((q) => (
                  <tr key={q.contractAddress} className="border-t border-ink-600/60 transition hover:bg-ink-700/30">
                    <td className="px-4 py-2.5">
                      <span className="text-mist-500">{ISSUER(q.issuerType)} · </span>
                      <a
                        className="font-mono text-link-400 hover:underline"
                        href={`https://bscscan.com/token/${q.contractAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        title={q.contractAddress}
                      >
                        {q.symbol}
                      </a>
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-mono">{q.onchainPrice != null ? `$${q.onchainPrice.toFixed(2)}` : "—"}</td>
                    <td className="tabular px-4 py-2.5 text-right font-mono text-mist-300">{q.refPrice != null ? `$${q.refPrice.toFixed(2)}` : "frozen"}</td>
                    <td className={`tabular px-4 py-2.5 text-right font-mono font-medium ${spreadClass(q.spreadBps)}`}>{fmtSpread(q.spreadBps)}</td>
                    <td className="tabular px-4 py-2.5 text-right font-mono text-mist-500">{q.holders?.toLocaleString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-xs text-mist-500">Cheapest venue first. Click a symbol for the BscScan contract.</p>
        </Card>
      )}

      {/* ── guard verdict ───────────────────────── */}
      {verdict && (
        <Card label="Guard verdict" id="guard-verdict">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-bold">Guard verdict</h2>
            <span className="rounded-full bg-ink-700 px-2.5 py-0.5 font-mono text-[11px] text-mist-500">source: {verdict.source}</span>
            {verdict.blocked ? (
              <span className="rounded-full bg-rose-soft-400/15 px-2.5 py-0.5 text-xs font-semibold text-rose-soft-400 ring-1 ring-rose-soft-400/40">
                market blocked
              </span>
            ) : (
              <span className="rounded-full bg-mint-900 px-2.5 py-0.5 text-xs font-semibold text-mint-400 ring-1 ring-mint-500/40">
                within tolerance
              </span>
            )}
          </div>

          <div className={`mt-3 rounded-xl border px-4 py-3 ${verdict.blocked ? "border-amber-glow-400/30 bg-amber-glow-900/40" : "border-mint-500/25 bg-mint-900/40"}`}>
            <span className="text-xs uppercase tracking-wider text-mist-500">Recommended action</span>
            <div className="font-mono text-lg font-bold">{verdict.action.replaceAll("_", " ")}</div>
            <p className="mt-1 text-sm text-mist-300">
              {verdict.blocked
                ? "Don't market-buy this now. Place a limit at the frozen reference or set an alert for open."
                : "Spread is within tolerance or you explicitly accepted it. Simulate, then execute small."}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Meter label="intent" value={verdict.intentConfidence} display={`${verdict.intent} · ${Math.round(verdict.intentConfidence * 100)}%`} />
            <Meter label="severity / 2" value={verdict.severity / 2} display={`${verdict.severity.toFixed(2)} · conf ${Math.round(verdict.severityConfidence * 100)}%`} />
            <Meter label="block" value={verdict.shouldBlockMarket} display={`${Math.round(verdict.shouldBlockMarket * 100)}%`} />
            <Meter label="stale" value={verdict.staleRisk} display={`${Math.round(verdict.staleRisk * 100)}%`} />
          </div>

          <div className="mt-4 flex flex-col gap-2.5 border-t border-ink-600/60 pt-4 lg:flex-row lg:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-mist-500">Size (USD)</span>
              <input aria-label="Size in USD" value={sizeUsd} onChange={(e) => setSizeUsd(e.target.value)} className={`${inputCls} tabular w-28 font-mono`} inputMode="decimal" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button onClick={armLimit} disabled={acting} className={btnGhost}>Arm limit at reference</button>
              <button onClick={alertAtOpen} disabled={acting} className={btnGhost}>Alert me at open</button>
              <button onClick={refreshAlerts} disabled={acting} className={btnGhost}>Refresh alerts</button>
            </div>
          </div>
          {receipt && (
            <p role="status" className="mt-3 rounded-lg bg-ink-900/70 px-3.5 py-2.5 font-mono text-xs leading-relaxed text-mist-300">
              {receipt}
            </p>
          )}
          {intent && <p className="mt-2 text-xs text-mist-500">Next: {intent.simulation.next}</p>}
        </Card>
      )}

      {/* ── alerts ──────────────────────────────── */}
      {alerts && alerts.length > 0 && (
        <Card label="Alerts" id="alerts">
          <h2 className="mb-2.5 text-base font-bold">Alerts <span className="tabular font-mono text-sm font-normal text-mist-500">{alerts.length}</span></h2>
          <ul className="space-y-1.5">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-ink-900/70 px-3 py-2 text-sm">
                <span className="font-mono font-semibold">{a.ticker}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.status === "triggered" ? "bg-mint-900 text-mint-400" : "bg-ink-700 text-mist-500"}`}>
                  {a.status}
                </span>
                {a.note && <span className="truncate text-mist-500">{a.note}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── holdings ────────────────────────────── */}
      <Card label="Holdings" id="holdings">
        <h2 className="mb-1 text-base font-bold">Holdings</h2>
        <p className="mb-3 text-xs text-mist-500">Public on-chain balances. No key, no signing — pure reads.</p>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-mist-500">BSC address</span>
            <input id="hold-addr" aria-label="Address" value={holdAddr} onChange={(e) => setHoldAddr(e.target.value)} className={`${inputCls} w-full font-mono text-xs`} maxLength={42} placeholder="0x…" />
          </label>
          <button id="check-holdings" onClick={checkHoldings} disabled={acting} className={`${btnGhost} whitespace-nowrap`}>
            Check holdings
          </button>
        </div>
        {holdings && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-ink-600/60">
            <table className="w-full min-w-[320px] border-collapse text-sm">
              <tbody>
                {visibleHoldings.map((h) => (
                  <tr key={h.symbol} className="border-t border-ink-600/60 first:border-t-0">
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      {h.contract ? (
                        <a className="text-link-400 hover:underline" href={`https://bscscan.com/token/${h.contract}`} target="_blank" rel="noreferrer">{h.symbol}</a>
                      ) : (
                        h.symbol
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-mono">{h.formatted}</td>
                  </tr>
                ))}
                {visibleHoldings.length === 0 && (
                  <tr><td className="px-4 py-3 text-sm text-mist-500">No tracked balances at this address.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {holdScan && (
          <a className="mt-2.5 inline-block text-xs text-link-400 hover:underline" href={holdScan} target="_blank" rel="noreferrer">
            View on BscScan →
          </a>
        )}
      </Card>

      {/* ── safety footer ───────────────────────── */}
      <footer className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink-600 bg-ink-800/50 px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-mist-500">Safety</span>
        <button onClick={() => revoke("halt")} disabled={acting} className="rounded-lg border border-rose-soft-400/40 bg-rose-soft-400/10 px-3 py-1.5 text-xs font-medium text-rose-soft-400 transition hover:bg-rose-soft-400/20 disabled:opacity-50">
          Halt live fills
        </button>
        <button onClick={() => revoke("resume")} disabled={acting} className="rounded-lg border border-ink-600 bg-ink-700/60 px-3 py-1.5 text-xs text-mist-300 transition hover:bg-ink-700 disabled:opacity-50">
          Resume
        </button>
        <button onClick={() => revoke("allowance")} disabled={acting} className="rounded-lg border border-ink-600 bg-ink-700/60 px-3 py-1.5 text-xs text-mist-300 transition hover:bg-ink-700 disabled:opacity-50">
          Revoke router approval
        </button>
        <a className="ml-auto text-xs text-mist-500 hover:text-link-400" href="https://github.com/PhiBao/nightdesk" target="_blank" rel="noreferrer">
          PhiBao/nightdesk · MIT
        </a>
      </footer>
    </div>
  );
}

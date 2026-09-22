"use client";

import { useState } from "react";

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

  const best = quotes?.[0];

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
        `Limit armed (paper): ${it.sizeUsd} USD → ~${it.approxTokens.toFixed(4)} ${it.symbol} @ ref $${it.refPrice.toFixed(2)}. ` +
          `Simulation: ${it.simulation.reason}`,
      );
    } catch (e) {
      setReceipt(`Limit failed: ${(e as Error).message}`);
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
      const j = (await r.json()) as { ok: boolean; hash?: string; bscscan?: string; halted?: boolean; error?: string };
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

  async function checkHoldings() {    setActing(true);
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

  async function alertAtOpen() {    setActing(true);
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
  return (
    <div>
      <p style={{ color: "#8b93a3", margin: "0 0 8px" }}>BNB Hack · Tokenized Stocks · BSC mainnet · spot only</p>
      <h1 style={{ margin: "0 0 8px", fontSize: 36 }}>NightDesk</h1>
      <p style={{ margin: "0 0 24px", color: "#b8c0cf" }}>
        It&apos;s Sunday 2am. The reference is frozen. The token isn&apos;t. See what the price <em>means</em> before
        you pay it.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <label>
          Ticker{" "}
          <input
            aria-label="Ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            style={{ padding: 8, width: 100 }}
            maxLength={10}
          />
        </label>
        <label style={{ flex: 1, minWidth: 240 }}>
          Intent{" "}
          <input
            aria-label="Intent"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ padding: 8, width: "100%" }}
            maxLength={500}
          />
        </label>
        <button onClick={check} disabled={loading} style={{ padding: "8px 20px", cursor: "pointer" }}>
          {loading ? "Checking…" : "Check truth"}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: "#ff9d9d" }}>
          {error}
        </p>
      )}
      {!quotes && !error && !loading && <p style={{ color: "#8b93a3" }}>Enter a ticker to see the live truth card.</p>}

      {best && (
        <section aria-label="Truth card" style={{ border: "1px solid #2a3342", borderRadius: 12, padding: 16, marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 20 }}>{best.ticker}</strong>
            <span
              style={{
                background: best.badge === "OPEN" ? "#123f2a" : "#3f2a12",
                padding: "2px 10px",
                borderRadius: 999,
                fontSize: 12,
              }}
            >
              {best.badge}
            </span>
            {best.reasonCode && best.reasonCode !== "TRADING" && <span>· {best.reasonCode}</span>}
          </div>
          <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#8b93a3", textAlign: "left" }}>
                <th>Venue</th>
                <th>On-chain</th>
                <th>Reference</th>
                <th>Spread</th>
                <th>Holders</th>
              </tr>
            </thead>
            <tbody>
              {quotes!.map((q) => (
                <tr key={q.contractAddress} style={{ borderTop: "1px solid #222b3a" }}>
                  <td>{ISSUER(q.issuerType)} · {q.symbol}</td>
                  <td>{q.onchainPrice != null ? `$${q.onchainPrice.toFixed(2)}` : "—"}</td>
                  <td>{q.refPrice != null ? `$${q.refPrice.toFixed(2)}` : "frozen"}</td>
                  <td>{q.spreadBps != null ? `${(q.spreadBps / 100).toFixed(2)}%` : "—"}</td>
                  <td>{q.holders?.toLocaleString() ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: "#8b93a3", fontSize: 13 }}>
            Cheapest venue first. Reference can be null outside hours — that&apos;s the staleness signal, not a bug.
          </p>
        </section>
      )}

      {verdict && (
        <section aria-label="Guard verdict" style={{ border: "1px solid #2a3342", borderRadius: 12, padding: 16, marginTop: 12 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Guard verdict · {verdict.source}</h2>
          <p style={{ margin: "0 0 4px" }}>
            Action: <strong>{verdict.action}</strong> {verdict.blocked && <span>· market blocked</span>}
          </p>
          <p style={{ margin: "0 0 4px", color: "#b8c0cf" }}>
            intent {verdict.intent} ({Math.round(verdict.intentConfidence * 100)}%) · severity{" "}
            {verdict.severity.toFixed(2)}/2 · block {Math.round(verdict.shouldBlockMarket * 100)}% · stale{" "}
            {Math.round(verdict.staleRisk * 100)}%
          </p>
          {verdict.blocked ? (
            <p>Don&apos;t market-buy this now. Place a limit at the frozen reference or set an alert for open.</p>
          ) : (
            <p>Spread is within tolerance or you explicitly accepted it. Simulate, then execute small.</p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
            <label>
              Size (USD){" "}
              <input
                aria-label="Size in USD"
                value={sizeUsd}
                onChange={(e) => setSizeUsd(e.target.value)}
                style={{ padding: 8, width: 100 }}
                inputMode="decimal"
              />
            </label>
            <button onClick={armLimit} disabled={acting} style={{ padding: "8px 16px", cursor: "pointer" }}>
              Arm limit at reference
            </button>
            <button onClick={alertAtOpen} disabled={acting} style={{ padding: "8px 16px", cursor: "pointer" }}>
              Alert me at open
            </button>
            <button onClick={refreshAlerts} disabled={acting} style={{ padding: "8px 16px", cursor: "pointer" }}>
              Refresh alerts
            </button>
          </div>
          {receipt && (
            <p role="status" style={{ marginTop: 8, color: "#c9d4e3" }}>
              {receipt}
            </p>
          )}
          {intent && (
            <p style={{ color: "#8b93a3", fontSize: 13 }}>
              Next: {intent.simulation.next}
            </p>
          )}
        </section>
      )}

      {alerts && alerts.length > 0 && (
        <section aria-label="Alerts" style={{ border: "1px solid #2a3342", borderRadius: 12, padding: 16, marginTop: 12 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Alerts</h2>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {alerts.map((a) => (
              <li key={a.id}>
                {a.ticker} · {a.status}
                {a.note ? ` · ${a.note}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Holdings" style={{ border: "1px solid #2a3342", borderRadius: 12, padding: 16, marginTop: 12 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Holdings</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            Address{" "}
            <input
              aria-label="Address"
              value={holdAddr}
              onChange={(e) => setHoldAddr(e.target.value)}
              style={{ padding: 8, width: 380, maxWidth: "100%" }}
              maxLength={42}
            />
          </label>
          <button onClick={checkHoldings} disabled={acting} style={{ padding: "8px 16px", cursor: "pointer" }}>
            Check holdings
          </button>
        </div>
        {holdings && (
          <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#8b93a3", textAlign: "left" }}>
                <th>Asset</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {holdings
                .filter((h) => h.formatted !== "0" && !h.formatted.startsWith("0.000000"))
                .map((h) => (
                  <tr key={h.symbol} style={{ borderTop: "1px solid #222b3a" }}>
                    <td>{h.symbol}</td>
                    <td>{h.formatted}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        {holdScan && (
          <p style={{ color: "#8b93a3", fontSize: 13 }}>
            <a href={holdScan} target="_blank" rel="noreferrer" style={{ color: "#8ab4ff" }}>
              View on BscScan
            </a>
          </p>
        )}
      </section>

      <footer style={{ borderTop: "1px solid #2a3342", marginTop: 24, paddingTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: "#8b93a3", fontSize: 13 }}>Safety:</span>
        <button onClick={() => revoke("halt")} disabled={acting} style={{ padding: "6px 12px", cursor: "pointer" }}>
          Halt live fills
        </button>
        <button onClick={() => revoke("resume")} disabled={acting} style={{ padding: "6px 12px", cursor: "pointer" }}>
          Resume
        </button>
        <button onClick={() => revoke("allowance")} disabled={acting} style={{ padding: "6px 12px", cursor: "pointer" }}>
          Revoke router approval
        </button>
      </footer>
    </div>
  );
}

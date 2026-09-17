// NightDesk execution layer — alert + limit intents.
//
// Honest boundary: arming intents and evaluating alerts is fully local and
// real. Broadcasting to BSC requires BINANCE_API_KEY (Transaction API) plus a
// funded wallet, which this MVP does not assume — intents stay `armed (paper)`
// and say so, instead of faking fills.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sessionBadge, type TruthQuote } from "./rwa";

export interface OpenAlert {
  id: string;
  ticker: string;
  note: string | null;
  status: "armed" | "triggered";
  createdAt: number;
  triggeredAt: number | null;
}

export interface LimitIntent {
  id: string;
  ticker: string;
  symbol: string;
  chainId: string;
  contractAddress: string;
  refPrice: number;
  sizeUsd: number;
  approxTokens: number;
  status: "armed-paper";
  simulation: SimulationResult;
  createdAt: number;
}

export interface SimulationResult {
  ok: boolean;
  reason: string;
  next: string;
}

function dataDir(): string {
  return process.env.NIGHTDESK_DATA_DIR ?? join(process.cwd(), "data");
}

async function loadList<T>(file: string): Promise<T[]> {
  try {
    const raw = await readFile(join(dataDir(), file), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]).slice(0, 100) : [];
  } catch {
    return [];
  }
}

async function saveList<T>(file: string, rows: T[]): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  await writeFile(join(dataDir(), file), JSON.stringify(rows.slice(0, 100), null, 2), "utf8");
}

/** Trigger rule (code, not model): reference market is OPEN for this ticker. */
export function shouldTriggerAlert(alert: OpenAlert, quotes: TruthQuote[]): boolean {
  if (alert.status !== "armed") return false;
  return quotes
    .filter((q) => q.ticker === alert.ticker)
    .some((q) => sessionBadge(q) === "OPEN" && q.refPrice != null);
}

export async function listAlerts(): Promise<OpenAlert[]> {
  return loadList<OpenAlert>("alerts.json");
}

export async function createAlert(ticker: string, note: string | null): Promise<OpenAlert> {
  const alerts = await listAlerts();
  const alert: OpenAlert = {
    id: randomUUID(),
    ticker,
    note: note?.slice(0, 200) ?? null,
    status: "armed",
    createdAt: Date.now(),
    triggeredAt: null,
  };
  await saveList("alerts.json", [alert, ...alerts]);
  return alert;
}

/** Re-evaluate all armed alerts against fresh quotes. Returns newly triggered. */
export async function evaluateAlerts(quotes: TruthQuote[]): Promise<OpenAlert[]> {
  const alerts = await listAlerts();
  let changed = false;
  for (const a of alerts) {
    if (shouldTriggerAlert(a, quotes)) {
      a.status = "triggered";
      a.triggeredAt = Date.now();
      changed = true;
    }
  }
  if (changed) await saveList("alerts.json", alerts);
  return alerts.filter((a) => a.status === "triggered");
}

/**
 * Build a limit-at-reference intent from the cheapest venue that HAS a
 * reference price. Pure (no IO) so it is unit-testable.
 */
export function buildLimitIntent(quotes: TruthQuote[], sizeUsd: number): LimitIntent | null {
  if (!Number.isFinite(sizeUsd) || sizeUsd <= 0 || sizeUsd > 1_000_000) return null;
  const withRef = quotes.filter((q) => q.refPrice != null && q.refPrice > 0);
  if (withRef.length === 0) return null;
  const best = withRef.sort((a, b) => (a.onchainPrice ?? Infinity) - (b.onchainPrice ?? Infinity))[0]!;
  const ref = best.refPrice as number;
  return {
    id: randomUUID(),
    ticker: best.ticker,
    symbol: best.symbol,
    chainId: best.chainId,
    contractAddress: best.contractAddress,
    refPrice: ref,
    sizeUsd,
    approxTokens: sizeUsd / ref,
    status: "armed-paper",
    simulation: simulateIntent(),
    createdAt: Date.now(),
  };
}

/**
 * Transaction-API dry-run hook. Without a key we MUST NOT pretend to
 * simulate — return the explicit gap instead.
 */
export function simulateIntent(): SimulationResult {
  if (!process.env.BINANCE_API_KEY) {
    return {
      ok: false,
      reason: "no BINANCE_API_KEY configured — Transaction API dry-run unavailable",
      next: "add BINANCE_API_KEY to .env.local, then replay this intent through the Transaction API simulate endpoint before any broadcast",
    };
  }
  return {
    ok: false,
    reason: "signed Transaction API wiring pending — key present, simulation call not yet implemented",
    next: "implement simulate-then-broadcast against the Transaction API and flip this intent to simulated",
  };
}

export async function listLimits(): Promise<LimitIntent[]> {
  return loadList<LimitIntent>("limits.json");
}

export async function saveLimit(intent: LimitIntent): Promise<void> {
  const rows = await listLimits();
  await saveList("limits.json", [intent, ...rows]);
}

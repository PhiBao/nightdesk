import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildLimitIntent,
  createAlert,
  evaluateAlerts,
  shouldTriggerAlert,
  simulateIntent,
  type OpenAlert,
} from "../src/lib/execution";
import type { TruthQuote } from "../src/lib/rwa";

function quote(over: Partial<TruthQuote>): TruthQuote {
  return {
    ticker: "NVDA",
    symbol: "NVDAon",
    chainId: "56",
    contractAddress: "0xabc",
    issuerType: 1,
    onchainPrice: 215.6,
    refPrice: 215.2,
    spreadBps: 18.6,
    session: "overnight",
    openState: true,
    reasonCode: "TRADING",
    nextOpenTime: null,
    nextCloseTime: null,
    stalenessMs: null,
    holders: 100,
    multiplier: "1",
    maxNotional: 1200000,
    fetchedAt: Date.now(),
    ...over,
  };
}

beforeEach(() => {
  process.env.NIGHTDESK_DATA_DIR = mkdtempSync(join(tmpdir(), "nd-test-"));
  delete process.env.BINANCE_API_KEY;
});

describe("alert trigger rule", () => {
  const armed: OpenAlert = { id: "1", ticker: "NVDA", note: null, status: "armed", createdAt: 0, triggeredAt: null };
  it("fires only when reference market is OPEN", () => {
    expect(shouldTriggerAlert(armed, [quote({ session: "regular" })])).toBe(true);
    expect(shouldTriggerAlert(armed, [quote({ session: "overnight" })])).toBe(false);
    expect(shouldTriggerAlert(armed, [quote({ session: "regular", refPrice: null })])).toBe(false);
  });
  it("ignores already-triggered alerts", () => {
    expect(shouldTriggerAlert({ ...armed, status: "triggered" }, [quote({ session: "regular" })])).toBe(false);
  });
});

describe("alert store", () => {
  it("arms then triggers on open", async () => {
    const a = await createAlert("NVDA", "open ping");
    expect(a.status).toBe("armed");
    const fired = await evaluateAlerts([quote({ session: "regular" })]);
    expect(fired.map((x) => x.id)).toContain(a.id);
  });
});

describe("limit intent", () => {
  it("pegs to cheapest venue with a reference", () => {
    const intent = buildLimitIntent(
      [quote({ onchainPrice: 216, symbol: "NVDAx" }), quote({ onchainPrice: 215.6, symbol: "NVDAon" })],
      200,
    );
    expect(intent?.symbol).toBe("NVDAon");
    expect(intent?.refPrice).toBe(215.2);
    expect(intent?.approxTokens).toBeCloseTo(200 / 215.2, 6);
    expect(intent?.status).toBe("armed-paper");
  });
  it("refuses when no reference anywhere", () => {
    expect(buildLimitIntent([quote({ refPrice: null })], 200)).toBeNull();
    expect(buildLimitIntent([quote({})], -5)).toBeNull();
  });
  it("simulation is honest without a key", () => {
    const sim = simulateIntent();
    expect(sim.ok).toBe(false);
    expect(sim.reason).toMatch(/BINANCE_API_KEY/);
  });
});

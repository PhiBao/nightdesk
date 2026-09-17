import { describe, expect, it } from "vitest";
import { fallbackGuard } from "../src/lib/guard";
import { sessionBadge, spreadBps } from "../src/lib/rwa";

describe("spread math", () => {
  it("computes bps", () => {
    expect(spreadBps(258.7, 254.12)).toBeCloseTo(180.2, 0);
  });
  it("returns null on missing ref", () => {
    expect(spreadBps(258.7, null)).toBeNull();
    expect(spreadBps(null, 254.12)).toBeNull();
    expect(spreadBps(10, 0)).toBeNull();
  });
});

describe("session badge", () => {
  it("labels overnight", () => {
    expect(sessionBadge({ session: "overnight", openState: true, reasonCode: "TRADING" })).toBe("OVERNIGHT");
  });
  it("surfaces halts", () => {
    expect(sessionBadge({ session: "regular", openState: false, reasonCode: "EARNINGS_HALT" })).toContain("HALTED");
  });
});

describe("fallback guard", () => {
  it("routes dont-overpay to limit", () => {
    const v = fallbackGuard("Buy $200 NVDA, don't overpay", {
      ticker: "NVDA",
      session: "OVERNIGHT",
      spread_bps: 180,
      onchain_price: 258.7,
      ref_price: 254.12,
      open_state: true,
      reason_code: "TRADING",
    });
    expect(v.action).toBe("limit_at_reference");
    expect(v.blocked).toBe(true);
    expect(v.source).toBe("fallback");
  });
  it("does not block fair open-market spreads", () => {
    const v = fallbackGuard("buy now", {
      ticker: "NVDA",
      session: "OPEN",
      spread_bps: 12,
      onchain_price: 215.5,
      ref_price: 215.2,
      open_state: true,
      reason_code: "TRADING",
    });
    expect(v.blocked).toBe(false);
  });
});

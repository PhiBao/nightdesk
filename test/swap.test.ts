import { describe, expect, it } from "vitest";
import { liveCapUsd, pickDeepest, slippageMinOut, type PoolPick } from "../src/lib/swap";

function pool(sym: string, liq: bigint): PoolPick {
  return { pool: "0xpool", fee: 500, liquidity: liq, tokenContract: "0xtok", symbol: sym, issuerType: 1 };
}

describe("pickDeepest", () => {
  it("picks deepest live pool, skips zero liquidity", () => {
    expect(pickDeepest([pool("A", 0n), pool("B", 5n), pool("C", 9n)])?.symbol).toBe("C");
  });
  it("returns null when nothing is liquid", () => {
    expect(pickDeepest([pool("A", 0n)])).toBeNull();
    expect(pickDeepest([])).toBeNull();
  });
});

describe("slippageMinOut", () => {
  it("cuts 1% at 100bps", () => {
    expect(slippageMinOut(1_000_000n, 100)).toBe(990_000n);
  });
  it("rejects absurd tolerance", () => {
    expect(() => slippageMinOut(100n, 5001)).toThrow();
  });
});

describe("liveCapUsd", () => {
  it("defaults to 10 and never exceeds hard ceiling", () => {
    delete process.env.MAX_LIVE_USD;
    expect(liveCapUsd()).toBe(10);
    process.env.MAX_LIVE_USD = "1000000";
    expect(liveCapUsd()).toBeLessThanOrEqual(100);
    delete process.env.MAX_LIVE_USD;
  });
});

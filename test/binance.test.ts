import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isoTimestamp, signRequest } from "../src/lib/binance";

describe("signed client", () => {
  it("produces base64 HMAC-SHA256 over timestamp+METHOD+path+body", () => {
    const sig = signRequest("secret", "2026-05-11T10:08:57.715Z", "GET", "/build/api/v1/dex/aggregator/supported/chain", "");
    const expected = createHmac("sha256", "secret")
      .update("2026-05-11T10:08:57.715ZGET/build/api/v1/dex/aggregator/supported/chain", "utf8")
      .digest("base64");
    expect(sig).toBe(expected);
    expect(sig).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
  it("is deterministic and input-sensitive", () => {
    const a = signRequest("s", "t", "GET", "/build/x", "");
    expect(signRequest("s", "t", "GET", "/build/x", "")).toBe(a);
    expect(signRequest("s", "t", "POST", "/build/x", "")).not.toBe(a);
    // the #1 documented pitfall: missing /build prefix changes the signature
    expect(signRequest("s", "t", "GET", "/api/v1/x", "")).not.toBe(a);
  });
  it("timestamps are ISO-8601 with milliseconds", () => {
    expect(isoTimestamp(new Date("2026-05-11T10:08:57.715Z"))).toBe("2026-05-11T10:08:57.715Z");
    expect(isoTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

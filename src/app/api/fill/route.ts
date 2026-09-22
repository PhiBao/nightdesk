import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertTicker } from "@/lib/rwa";
import { broadcastBuy, liveCapUsd, quoteBuy, resolveToken, simulateSwap, verifySwappable, walletAddressOrNull } from "@/lib/swap";

function halted(): boolean {
  try {
    return existsSync(join(process.cwd(), "data", "HALT"));
  } catch {
    return false;
  }
}

// POST /api/fill { ticker, usdAmount, slippageBps?, confirm? }
//
// confirm !== true  → paper: live quote + real eth_call simulation, no broadcast.
// confirm === true  → LIVE broadcast, only if usdAmount ≤ liveCapUsd() and key set.
export async function POST(req: Request) {
  let body: { ticker?: string; usdAmount?: number; slippageBps?: number; confirm?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  try {
    const ticker = assertTicker(String(body.ticker ?? ""));
    const usdAmount = Number(body.usdAmount);
    const slippageBps = body.slippageBps == null ? 100 : Number(body.slippageBps);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      return NextResponse.json({ ok: false, error: "usdAmount must be > 0" }, { status: 400 });
    }
    if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 5000) {
      return NextResponse.json({ ok: false, error: "slippageBps must be within [0, 5000]" }, { status: 400 });
    }
    const cap = liveCapUsd();
    if (usdAmount > cap) {
      return NextResponse.json({ ok: false, error: `usdAmount $${usdAmount} exceeds live cap $${cap}` }, { status: 400 });
    }
    const q = await quoteBuy(ticker, usdAmount, slippageBps);
    const sim = await simulateSwap(q, slippageBps);
    const quote = {
      symbol: q.symbol,
      pool: q.pool,
      fee: q.fee,
      amountInUsdt: Number(q.amountIn) / 1e18,
      amountOutTokens: Number(q.amountOut) / 10 ** q.tokenDecimals,
      minOutTokens: Number(q.minOut) / 10 ** q.tokenDecimals,
    };
    if (body.confirm !== true) {
      const pick = await resolveToken(ticker).catch(() => null);
      const exec = pick
        ? await verifySwappable(pick, walletAddressOrNull())
        : { swappable: false, quotedOut: null, dryRunOk: false, reason: "no liquid pool found" };
      const executability = { ...exec, quotedOut: exec.quotedOut == null ? null : exec.quotedOut.toString() };
      return NextResponse.json({ ok: true, mode: "paper", cap, quote, simulation: sim, executability });
    }
    if (halted()) {
      return NextResponse.json({ ok: false, error: "kill-switch engaged (data/HALT exists) — live broadcast refused" }, { status: 403 });
    }
    if (!sim.ok) {
      return NextResponse.json({ ok: false, error: `refusing live broadcast: ${sim.reason}` }, { status: 409 });
    }
    const fill = await broadcastBuy(q, slippageBps, usdAmount, true);
    const record = { ticker, usdAmount, slippageBps, quote, fill, at: Date.now() };
    try {
      const dir = join(process.cwd(), "data");
      await mkdir(dir, { recursive: true });
      let rows: unknown[] = [];
      try {
        rows = JSON.parse(await readFile(join(dir, "fills.json"), "utf8")) as unknown[];
      } catch {
        rows = [];
      }
      await writeFile(join(dir, "fills.json"), JSON.stringify([record, ...(Array.isArray(rows) ? rows : [])].slice(0, 50), null, 2));
    } catch {
      /* fills record is nice-to-have; the chain is the source of truth */
    }
    return NextResponse.json({ ok: true, mode: "live", cap, quote, simulation: sim, fill });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 500) }, { status: 502 });
  }
}

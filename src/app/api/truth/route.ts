import { NextResponse } from "next/server";
import { assertTicker, dexDynamic, sessionBadge, tokenAudit, truthCard } from "@/lib/rwa";

// GET /api/truth?ticker=NVDA — live BSC venue quotes, cheapest-first,
// enriched with on-chain DEX volume + token security audit for the best venue.
export async function GET(req: Request) {
  const url = new URL(req.url);
  let ticker: string;
  try {
    ticker = assertTicker(url.searchParams.get("ticker") ?? "NVDA");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
  try {
    const quotes = await truthCard(ticker);
    const best = quotes[0]!;
    const [dex, audit] = await Promise.all([
      dexDynamic(best.chainId, best.contractAddress),
      tokenAudit(best.chainId, best.contractAddress),
    ]);
    return NextResponse.json({
      ok: true,
      ticker,
      fetchedAt: Date.now(),
      quotes: quotes.map((q) => ({ ...q, badge: sessionBadge(q) })),
      best: { symbol: best.symbol, dex, audit },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { assertTicker, sessionBadge, truthCard } from "@/lib/rwa";

// GET /api/truth?ticker=NVDA — live BSC venue quotes, cheapest-first.
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
    return NextResponse.json({
      ok: true,
      ticker,
      fetchedAt: Date.now(),
      quotes: quotes.map((q) => ({ ...q, badge: sessionBadge(q) })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}

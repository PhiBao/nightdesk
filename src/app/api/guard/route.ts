import { NextResponse } from "next/server";
import { marketOf, typesafeGuard } from "@/lib/guard";
import { assertTicker, dynamicQuote, findVenues } from "@/lib/rwa";

// POST /api/guard { ticker, text } — TypeSafe intent/risk over live market state.
export async function POST(req: Request) {
  let body: { ticker?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  let ticker: string;
  try {
    ticker = assertTicker(String(body.ticker ?? "NVDA"));
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
  const text = String(body.text ?? "").slice(0, 500);
  if (!text.trim()) return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
  try {
    const venues = await findVenues(ticker);
    if (venues.length === 0) return NextResponse.json({ ok: false, error: `no BSC venue for ${ticker}` }, { status: 404 });
    const quote = await dynamicQuote(venues[0]!);
    const verdict = await typesafeGuard(text, marketOf(quote));
    return NextResponse.json({ ok: true, ticker, quote, verdict });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}

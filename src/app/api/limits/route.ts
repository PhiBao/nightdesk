import { NextResponse } from "next/server";
import { buildLimitIntent, listLimits, saveLimit } from "@/lib/execution";
import { assertTicker, truthCard } from "@/lib/rwa";

// POST /api/limits { ticker, sizeUsd } — arm a limit-at-reference intent (paper).
export async function POST(req: Request) {
  let body: { ticker?: string; sizeUsd?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  try {
    const ticker = assertTicker(String(body.ticker ?? ""));
    const sizeUsd = Number(body.sizeUsd);
    if (!Number.isFinite(sizeUsd) || sizeUsd <= 0 || sizeUsd > 1_000_000) {
      return NextResponse.json({ ok: false, error: "sizeUsd must be within (0, 1000000]" }, { status: 400 });
    }
    const quotes = await truthCard(ticker);
    const intent = buildLimitIntent(quotes, sizeUsd);
    if (!intent) {
      return NextResponse.json(
        { ok: false, error: `no venue with a live reference price for ${ticker} — cannot peg a limit` },
        { status: 409 },
      );
    }
    await saveLimit(intent);
    return NextResponse.json({ ok: true, intent, history: await listLimits() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}

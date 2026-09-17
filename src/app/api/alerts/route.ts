import { NextResponse } from "next/server";
import { createAlert, evaluateAlerts, listAlerts } from "@/lib/execution";
import { assertTicker, truthCard } from "@/lib/rwa";

// GET /api/alerts — list alerts (re-evaluated against live truth first).
export async function GET() {
  try {
    const alerts = await listAlerts();
    // Best-effort re-evaluation per armed ticker; never fail the list on it.
    const tickers = [...new Set(alerts.filter((a) => a.status === "armed").map((a) => a.ticker))].slice(0, 5);
    for (const t of tickers) {
      try {
        await evaluateAlerts(await truthCard(t));
      } catch {
        /* upstream hiccup — keep armed state */
      }
    }
    return NextResponse.json({ ok: true, alerts: await listAlerts() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/alerts { ticker, note? } — arm an alert-at-open.
export async function POST(req: Request) {
  let body: { ticker?: string; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  try {
    const ticker = assertTicker(String(body.ticker ?? ""));
    const alert = await createAlert(ticker, body.note ? String(body.note) : null);
    return NextResponse.json({ ok: true, alert });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

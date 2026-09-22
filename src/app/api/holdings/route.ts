import { NextResponse } from "next/server";
import { assertAddress, holdingsFor } from "@/lib/holdings";

// GET /api/holdings?address=0x… — public on-chain balances (native + USDT +
// known tokenized-stock venues). Read-only, no key.
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const address = assertAddress(url.searchParams.get("address") ?? "");
    return NextResponse.json({ ok: true, ...(await holdingsFor(address)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

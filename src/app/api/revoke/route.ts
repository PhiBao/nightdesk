import { NextResponse } from "next/server";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { SWAP_ROUTER, USDT_BSC } from "@/lib/swap";

const RPCS = ["https://bsc-dataseed.binance.org", "https://bsc-dataseed1.bnbchain.org"];

// POST /api/revoke { target: "halt" | "resume" | "allowance" }
// halt/resume: file kill-switch gating /api/fill live broadcasts (no gas).
// allowance: broadcasts approve(router, 0) — real tx, costs gas, needs key.
export async function POST(req: Request) {
  let body: { target?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const dir = join(process.cwd(), "data");
  if (body.target === "halt") {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "HALT"), `halted at ${new Date().toISOString()}\n`);
    return NextResponse.json({ ok: true, halted: true });
  }
  if (body.target === "resume") {
    try {
      if (existsSync(join(dir, "HALT"))) unlinkSync(join(dir, "HALT"));
    } catch {
      /* already resumed */
    }
    return NextResponse.json({ ok: true, halted: false });
  }
  if (body.target === "allowance") {
    try {
      const pk = process.env.PRIVATE_KEY;
      if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
        return NextResponse.json({ ok: false, error: "PRIVATE_KEY missing" }, { status: 400 });
      }
      const w = new Wallet(pk, new JsonRpcProvider(RPCS[0], 56));
      const usdt = new Contract(USDT_BSC, ["function approve(address,uint256) returns (bool)"], w);
      const tx = await usdt.getFunction("approve")(SWAP_ROUTER, 0n);
      const rc = await tx.wait(1);
      const hash = (rc?.hash ?? tx.hash) as string;
      return NextResponse.json({ ok: true, hash, bscscan: `https://bscscan.com/tx/${hash}` });
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 300) }, { status: 502 });
    }
  }
  return NextResponse.json({ ok: false, error: "target must be halt | resume | allowance" }, { status: 400 });
}

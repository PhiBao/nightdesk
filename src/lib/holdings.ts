// NightDesk holdings — public on-chain balance reads for any BSC address.
// No key, no signing, no exposure: pure eth_call / eth_getBalance.

import { Contract, JsonRpcProvider } from "ethers";
import { USDT_BSC } from "./swap";

const RPCS = ["https://bsc-dataseed.binance.org", "https://bsc-dataseed1.bnbchain.org", "https://rpc.ankr.com/bsc"];

const ERC20_MIN = ["function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)"];

export interface Holding {
  symbol: string;
  contract: string | null;
  raw: string;
  formatted: string;
  decimals: number;
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export function assertAddress(a: string): string {
  const t = a.trim();
  if (!ADDR_RE.test(t)) throw new Error(`invalid address: ${a}`);
  return t;
}

/** Tracked tokens: native BNB + USDT + known BSC tokenized-stock venues. */
export async function trackedTokens(): Promise<{ symbol: string; contract: string }[]> {
  const { findVenues } = await import("./rwa");
  const out = new Map<string, string>();
  for (const ticker of ["SPCX", "NVDA", "TSLA", "AAPL"]) {
    try {
      for (const v of await findVenues(ticker)) {
        if (!out.has(v.contractAddress)) out.set(v.contractAddress, v.symbol);
      }
    } catch {
      /* one ticker failing must not kill holdings */
    }
  }
  return [...out.entries()].map(([contract, symbol]) => ({ symbol, contract }));
}

export async function holdingsFor(address: string): Promise<{ address: string; bscscan: string; holdings: Holding[] }> {
  const addr = assertAddress(address);
  const provider = new JsonRpcProvider(RPCS[0], 56);
  const holdings: Holding[] = [];
  const bnbWei = await provider.getBalance(addr);
  holdings.push({
    symbol: "BNB",
    contract: null,
    raw: bnbWei.toString(),
    formatted: (Number(bnbWei) / 1e18).toFixed(6),
    decimals: 18,
  });
  const tokens = [{ symbol: "USDT", contract: USDT_BSC }, ...(await trackedTokens())];
  for (const t of tokens) {
    try {
      const c = new Contract(t.contract, ERC20_MIN, provider);
      const [dec, bal] = (await Promise.all([
        c.getFunction("decimals")(),
        c.getFunction("balanceOf")(addr),
      ])) as [number, bigint];
      const decimals = Number(dec);
      holdings.push({
        symbol: t.symbol,
        contract: t.contract,
        raw: bal.toString(),
        formatted: (Number(bal) / 10 ** decimals).toFixed(decimals > 6 ? 6 : decimals),
        decimals,
      });
    } catch {
      /* unreadable token — skip, don't fail the panel */
    }
  }
  return { address: addr, bscscan: `https://bscscan.com/address/${addr}`, holdings };
}

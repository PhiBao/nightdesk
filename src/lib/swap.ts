// NightDesk swap layer — direct PancakeSwap V3 execution on BSC.
//
// Address discipline: V3 addrs below are copied from the official
// pancake-v3-contracts deployments/bscMainnet.json (verified 2026-09-22).
// Token/pool addresses are NEVER hardcoded from memory — resolveToken()
// discovers them live via RWA list + on-chain getPool + liquidity reads.
// Signing key lives server-side only (PRIVATE_KEY env, never committed).

import { Contract, JsonRpcProvider, Wallet, ZeroAddress, type BigNumberish } from "ethers";

// Verified: https://github.com/pancakeswap/pancake-v3-contracts/blob/main/deployments/bscMainnet.json
export const V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
export const QUOTER_V2 = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997";
export const SWAP_ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
// Verified on-chain 2026-09-22 (code exists, decimals()=18).
export const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

export const BSC_CHAIN_ID = 56;
const RPCS = ["https://bsc-dataseed.binance.org", "https://bsc-dataseed1.bnbchain.org", "https://rpc.ankr.com/bsc"];
const FEES = [100, 500, 2500, 10000];
const HARD_CEILING_USD = 100;

const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];
const POOL_ABI = ["function liquidity() view returns (uint128)", "function token0() view returns (address)", "function token1() view returns (address)"];
const QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
];
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const ROUTER_ABI = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",
];

export interface PoolPick {
  pool: string;
  fee: number;
  liquidity: bigint;
  tokenContract: string;
  symbol: string;
  issuerType: number;
}

/** Pure: pick deepest pool. Exported for unit tests. */
export function pickDeepest(pools: PoolPick[]): PoolPick | null {
  const live = pools.filter((p) => p.liquidity > 0n);
  if (live.length === 0) return null;
  return live.sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1))[0]!;
}

/** Pure: minimum acceptable out given slippage tolerance in bps. */
export function slippageMinOut(amountOut: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 5000) throw new Error("slippageBps out of range (0, 5000]");
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** Live cap: env MAX_LIVE_USD (default 10), never above HARD_CEILING_USD. */
export function liveCapUsd(): number {
  const env = Number(process.env.MAX_LIVE_USD ?? 10);
  const cap = Number.isFinite(env) && env > 0 ? env : 10;
  return Math.min(cap, HARD_CEILING_USD);
}

function provider(): JsonRpcProvider {
  return new JsonRpcProvider(RPCS[0], BSC_CHAIN_ID);
}

async function poolLiquidity(pool: string): Promise<bigint> {
  const c = new Contract(pool, POOL_ABI, provider());
  return (await c.getFunction("liquidity")()) as bigint;
}

/**
 * Resolve a ticker to the deepest USDT V3 pool across its BSC venues.
 * Returns null when nothing is tradable (e.g. NVDAx on 2026-09-22).
 */
export async function resolveToken(ticker: string): Promise<PoolPick | null> {
  const { findVenues } = await import("./rwa");
  const venues = await findVenues(ticker);
  const factory = new Contract(V3_FACTORY, FACTORY_ABI, provider());
  const out: PoolPick[] = [];
  for (const v of venues) {
    for (const fee of FEES) {
      try {
        const pool: string = await factory.getFunction("getPool")(USDT_BSC, v.contractAddress, fee);
        if (!pool || pool === ZeroAddress) continue;
        const liq = await poolLiquidity(pool).catch(() => 0n);
        out.push({ pool, fee, liquidity: liq, tokenContract: v.contractAddress, symbol: v.symbol, issuerType: v.type });
      } catch {
        /* one fee failing must not kill discovery */
      }
    }
  }
  return pickDeepest(out);
}

export interface Quote {
  amountIn: bigint;
  amountOut: bigint;
  minOut: bigint;
  fee: number;
  pool: string;
  tokenContract: string;
  symbol: string;
  tokenDecimals: number;
}

export async function quoteBuy(ticker: string, usdAmount: number, slippageBps = 100): Promise<Quote> {
  const pick = await resolveToken(ticker);
  if (!pick) throw new Error(`no liquid USDT pool for ${ticker} on Pancake V3`);
  const erc = new Contract(pick.tokenContract, ERC20_ABI, provider());
  const tokenDecimals = Number(await erc.getFunction("decimals")());
  const usdt = new Contract(USDT_BSC, ERC20_ABI, provider());
  const usdtDec = Number(await usdt.getFunction("decimals")());
  const amountIn = BigInt(Math.round(usdAmount * 10 ** usdtDec));
  const quoter = new Contract(QUOTER_V2, QUOTER_ABI, provider());
  const [amountOut] = (await quoter.getFunction("quoteExactInputSingle").staticCall({
    tokenIn: USDT_BSC,
    tokenOut: pick.tokenContract,
    amountIn,
    fee: pick.fee,
    sqrtPriceLimitX96: 0,
  })) as [bigint, bigint, number, bigint];
  if (amountOut <= 0n) throw new Error("quoter returned zero output — pool too thin for this size");
  return {
    amountIn,
    amountOut,
    minOut: slippageMinOut(amountOut, slippageBps),
    fee: pick.fee,
    pool: pick.pool,
    tokenContract: pick.tokenContract,
    symbol: pick.symbol,
    tokenDecimals,
  };
}

function wallet(): Wallet {
  const pk = process.env.PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("PRIVATE_KEY missing or malformed");
  return new Wallet(pk, provider());
}

/** Real dry-run: eth_call the exact swap calldata. Never broadcasts. */
export async function simulateSwap(q: Quote, slippageBps = 100): Promise<{ ok: boolean; reason: string }> {
  try {
    const w = wallet();
    const router = new Contract(SWAP_ROUTER, ROUTER_ABI, provider());
    const tx = await router.getFunction("exactInputSingle").populateTransaction({
      tokenIn: USDT_BSC,
      tokenOut: q.tokenContract,
      fee: q.fee,
      recipient: w.address,
      amountIn: q.amountIn,
      amountOutMinimum: slippageMinOut(q.amountOut, slippageBps),
      sqrtPriceLimitX96: 0,
    });
    await provider().call({ ...tx, from: w.address });
    return { ok: true, reason: "eth_call succeeded — swap would execute at current chain state" };
  } catch (e) {
    return { ok: false, reason: `simulation reverted: ${(e as Error).message.slice(0, 300)}` };
  }
}

export interface FillResult {
  approvedHash: string | null;
  swapHash: string;
  bscscan: string;
}

/**
 * LIVE broadcast. Gated three ways: explicit confirm, liveCapUsd(), key present.
 * Refuses anything above the cap — no exceptions, no overrides.
 */
export async function broadcastBuy(q: Quote, slippageBps: number, usdAmount: number, confirm: boolean): Promise<FillResult> {
  if (!confirm) throw new Error("broadcast requires explicit confirm=true");
  if (usdAmount > liveCapUsd()) throw new Error(`$${usdAmount} exceeds live cap $${liveCapUsd()}`);
  const w = wallet();
  const usdt = new Contract(USDT_BSC, ERC20_ABI, w);
  const allowance = (await usdt.getFunction("allowance")(w.address, SWAP_ROUTER)) as bigint;
  let approvedHash: string | null = null;
  if (allowance < q.amountIn) {
    const tx = await usdt.getFunction("approve")(SWAP_ROUTER, q.amountIn);
    await tx.wait(1);
    approvedHash = tx.hash as string;
  }
  const router = new Contract(SWAP_ROUTER, ROUTER_ABI, w);
  const tx = await router.getFunction("exactInputSingle")({
    tokenIn: USDT_BSC,
    tokenOut: q.tokenContract,
    fee: q.fee,
    recipient: w.address,
    amountIn: q.amountIn,
    amountOutMinimum: slippageMinOut(q.amountOut, slippageBps),
    sqrtPriceLimitX96: 0,
  });
  const receipt = await tx.wait(1);
  const hash = (receipt?.hash ?? tx.hash) as string;
  return { approvedHash, swapHash: hash, bscscan: `https://bscscan.com/tx/${hash}` };
}

export type { BigNumberish };

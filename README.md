# NightDesk — the session-aware buy screen for tokenized stocks

Friday 4pm ET: the reference freezes. The token doesn't. NightDesk shows what the
after-hours price *means* — session badge, on-chain vs reference spread, venue
compare — then a TypeSafe guard routes intent → limit-at-reference / alert-at-open /
guarded market, instead of a blind swap.

## Stack

- Next.js + TypeScript (pnpm), BSC mainnet, spot only
- Binance Web3 public RWA reads (no key): list + dynamic V2 (both prices + statusInfo)
- TypeSafe System One (`jev-latest`), server-side only: 1 batched call, 4 parallel
  questions (intent Choice, severity Score, block Noul, staleness Noul)
- Code owns math/policy/execution; model supplies intent + risk judgments

## Run

```bash
pnpm install
cp .env.example .env.local  # add TYPESAFE_API_KEY (server-only)
pnpm dev                    # http://localhost:3000
pnpm test && pnpm typecheck && pnpm build
```

Without `TYPESAFE_API_KEY` the guard uses a deterministic fallback (same shape,
conservative after hours) so the demo never dies.

## API

- `GET /api/truth?ticker=NVDA` → live BSC venue quotes, cheapest-first + badge
- `POST /api/guard { ticker, text }` → live quote + guard verdict + recommended action
- `POST /api/limits { ticker, sizeUsd }` → arms a limit-at-reference intent (paper until Transaction API key)
- `GET /api/alerts` + `POST /api/alerts { ticker, note? }` → alert-at-open, re-evaluated against live truth
- `POST /api/fill { ticker, usdAmount, slippageBps?, confirm? }` → paper: live V3 quote +
  real `eth_call` simulation. `confirm:true`: LIVE broadcast, only under `MAX_LIVE_USD`

## Execution (live path)

Pool discovery is fully on-chain: RWA list → `getPool` across fee tiers → deepest
non-zero liquidity wins. Verified 2026-09-22: NVDAx has NO USDT V3 pool (unroutable),
NVDAon routes via fee-100, NVDAB via fee-2500 (deepest). V3 addresses copied from
`pancake-v3-contracts/deployments/bscMainnet.json`, never from memory.

## Structural finding: liquidity ≠ executability

A 10-ticker × 3-issuer × 4-fee scan (28 liquid pools) showed every pool prices
correctly via the quoter but reverts on delivery to a retail wallet — tokenized
stocks restrict permissionless transfers. `/api/fill` paper mode reports this per
ticker as `executability: { swappable, quotedOut, dryRunOk, reason }` instead of
pretending a fill is one click away. On-chain evidence: mined 5-USDT approval
from the demo wallet (readable via `allowance()`), swap leg reverts.

## Proof

- `test/guard.test.ts` — spread math, session badge, fallback routing
- Live TypeSafe batch verified 2026-09-17: intent `limit_at_reference` 0.85,
  severity 1.74/2, block 0.89, stale 0.91 on the +180bps weekend case
- See `DX_LOG.md` for the developer-experience report log (counts 25% of score)

## Non-goals (MVP)

Perps, fiat ramp, tax filing, appreciation forecasts, own token. Trading/Transaction
signed execution wires in next behind the same guard action.

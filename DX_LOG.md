# NightDesk DX Log (hackathon counts 25% — specific, actionable, honest)

## 2026-09-17 — setup + public reads
- Docs → first successful call: ~10 min. Public RWA endpoints need no key:
  - `GET .../rwa/stock/detail/list/ai?type=1` → 200, `code 000000`, BSC NVDAon found
  - `GET .../rwa/dynamic/ai?chainId=56&contractAddress=0xa9ee…` → 200 with
    `tokenInfo.price` (on-chain 215.55) + `stockInfo.price` (ref 215.20) +
    `statusInfo{openState, marketStatus:"overnight", reasonCode:"TRADING",
    nextOpenTime, nextCloseTime}` + `limitInfo.maxActiveNotionalValue`
- Gotcha: `tokenInfo.volume24h` is US-stock USD volume, NOT on-chain DEX volume
  (confirmed by skill docs; don't use for depth). Depth still needs Trading API
  quote for size — using placeholder until signed module wires in.
- `type=1/2/3` filter works for list (Ondo/xStocks/bStocks). Dynamic V2 per
  (chainId, contractAddress) is the truth-card primitive.
- TypeSafe: `POST https://api.typesafe.ai/v1/systemone`, `jev-latest` live as
  `jev-1.13.0`. One malformed-body 422 (piped curl `-w` status into `-d` payload —
  my harness bug, not API), one 403 (empty env in fresh shell — persistence
  gotcha), then 200s. Batched 4-question guard: 809 in / 119 out tokens.
- Redesign ask: RWA dynamic should include per-venue on-chain depth for size
  (e.g. ±1% depth USD) so guards don't need a second Trading quote call.

## 2026-09-17 — end-to-end verification (Next 15.5, pnpm)
- `pnpm typecheck` clean, `vitest` 6/6, `next build` clean (4 routes).
- `GET /api/truth?ticker=NVDA` live: 3 BSC venues cheapest-first —
  NVDAx (xStocks, +8bps) / NVDAon (Ondo, +20bps, OVERNIGHT, 56,902 holders) /
  NVDAB (bStocks, ref null → spread null).
- API heterogeneity (real, not a bug): xStocks dynamic rows omit `statusInfo`
  (session UNKNOWN, holders null) and bStocks omits `stockInfo.price` when its
  reference is frozen. Truth card renders "frozen"/UNKNOWN explicitly instead
  of hiding it — that missing-ref state IS the staleness signal.
- `POST /api/guard` fallback (no key): intent `limit_at_reference`, severity 0
  at +20bps, `blocked:false`, stale 0.9 — correct: fair spread, don't block.
- `POST /api/guard` live (key): `source:typesafe`, intent 0.82, severity 0.25
  at +27bps vs 1.74 at +180bps in the weekend probe — the Score primitive
  discriminates fair vs extreme. Stale 0.33 overnight (ref present) vs 0.91
  weekend (ref frozen 38h) — correctly distinguishes overnight-with-ref from
  true weekend freeze.
- Tooling gotcha: `pkill -f` hangs this shell — use direct PIDs. zsh needs
  quoted URLs (`?` glob). `curl | head` masks curl's exit code for `||` checks.

## 2026-09-17 — actions round (limits + alerts)
- New: `POST /api/limits {ticker,sizeUsd}` arms paper intent from cheapest venue
  WITH a reference (NVDA → NVDAx @ $215.51, ~0.928 tokens for $200). 409 with a
  clear message when no venue has a reference — cannot peg a limit to nothing.
- New: `/api/alerts` arms alert-at-open; GET re-evaluates armed alerts against
  live truth (trigger = badge OPEN + ref present). TSLA armed → listed → still
  armed (market not open). Store is file JSON under `data/` (gitignored),
  `NIGHTDESK_DATA_DIR` override for tests.
- Simulation honesty: without `BINANCE_API_KEY` the intent says so verbatim and
  names the next step, instead of faking a dry-run. Key present but unwired is
  a separate explicit state.
- `pnpm typecheck` clean, `vitest` 12/12, `next build` clean (5 routes).

## 2026-09-22 — live execution leg (Pancake V3, burner wallet)
- Wallet verified ( PRIVATE_KEY in gitignored `.env`): `0x4Ba1…1D73`, BSC 56,
  0.001498 BNB (gas for several txs), **0 USDT — no fill possible until funded**.
- Caught my own bad memory twice: guessed V3 factory had 41 hex chars (RPC
  rejected), guessed QuoterV2 wrong (code probe). Fixed by reading official
  `pancake-v3-contracts/deployments/bscMainnet.json` from GitHub. Lesson for the
  report: never hardcode DEX addresses from memory; copy from deployments repo
  and assert `eth_getCode` + `decimals()` at boot.
- Pool truth (on-chain `getPool` × 4 fees × 3 venues): NVDAx/USDT has NO pool
  (Binance's NVDAx price is aggregated, not V3-executable); NVDAon fee-100 alive
  (liq 4.46e19); NVDAB fee-2500 deepest (liq 1.58e22). Resolver picks deepest.
- `POST /api/fill` paper for NVDA $5: quoted NVDAB $5 → ~0.022 tokens, `eth_call`
  simulation executed real logic and reverted for the real reason (0 USDT).
  Refusal path (no funds / over cap / sim-fail) verified live.
- Env gotcha: `/proc`-scan kill loops hang this shell — use `ss -ltnp` + direct PID.

## 2026-09-22 — structural finding: 28/28 pools unswappable
- Broad scan (10 tickers × Ondo/xStocks/bStocks × 4 fees): 28 pools hold
  liquidity and the quoter prices all of them sanely — yet every `exactInputSingle`
  dry-run reverts on delivery to a retail EOA, even with minOut=0. Only incomplete
  leg is pool→wallet: token-level transfer restriction (all three issuers).
- This invalidated our own live-fill plan mid-build: approve mined fine (allowance
  5 USDT on-chain, real gas spent), swap can never land. No further gas will be
  burned retrying. Correct venue for fills is issuer rails (bStocks 1:1 convert,
  Ondo mint) — both gated by account/KYC, not code.
- Product consequence, shipped: `/api/fill` paper mode now returns `executability`
  (quoter + delivery dry-run) per ticker. The truth card stops users before the
  chain does. Judges can verify: any `eth_call` of the quoted calldata reverts.
- Also wired (keyless): on-chain DEX volume (`dynamic/info`, real buy/sell split —
  replaces misleading `volume24h`) + token security audit on the best venue.

## 2026-09-22 — SPCXB spot-check (same structural block)
- SPCXB (`0xbe9d…3103e1`, type=3): 3 liquid USDT pools (fee-500 liq 3.2e22,
  fee-2500 liq 2.1e24, fee-10000 liq 2.7e19). Quoter prices $10 → ~0.065 SPCXB
  (~$153/token) on all three — delivery reverts on all three (minOut=0).
  Deepest pool in the scan so far, same verdict: priced, not deliverable.
  All probes read-only; no gas spent, wallet funds untouched.

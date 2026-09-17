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

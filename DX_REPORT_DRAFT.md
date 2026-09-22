# DX Report — DRAFT (paste into the official form, keep the specifics)

## 1. Onboarding
- Docs → first successful API call: ~10 minutes. The public RWA endpoints need
  no key: `GET .../rwa/stock/detail/list/ai?type=1` → 200 `code 000000` on the
  first try; per-asset dynamic V2 worked immediately after (NVDAon: on-chain
  215.55 + ref 215.20 + `statusInfo{openState, marketStatus:"overnight",
  reasonCode:"TRADING", nextOpenTime, nextCloseTime}`). Fastest onboarding of
  any exchange API I have used.
- Stuck point: none on reads. Signed modules (Trading/Transaction) were never
  reachable: the auth/request-signing doc page returns HTTP 202 with an empty
  body to programmatic fetchers (curl + skill fetcher alike), and no public
  OpenAPI/spec exists for the signed paths — so integration stopped at discovery.

## 2. Documentation issues
- `https://web3.binance.com/en/dev-docs/llms.txt` and `/llms-full.txt` (both
  advertised on the hackathon page as "feed the docs to your agent"): HTTP 202,
  0 bytes, via two independent fetchers. If these are bot-gated, allowlist
  common agent UAs or publish the files on GitHub raw.
- PancakeSwap docs moved (`developers/smart-contracts/*` → 404); the sitemap
  still resolves. Contract addresses were ultimately sourced from the
  `pancake-v3-contracts` GitHub deployments file — consider linking that repo
  directly from the hackathon resource list.

## 3. API pitfalls (with specifics)
- `tokenInfo.volume24h` in RWA Dynamic V2 is **US-stock USD volume, not on-chain
  DEX volume** — confirmed via the skills-hub docs. Real on-chain buy/sell split
  lives in `.../market/token/dynamic/info` (`volume24hBuy`/`volume24hSell`). One
  mislabeled field; we burned an hour before finding the footnote.
- Dynamic V2 is heterogeneous per issuer: xStocks rows omit `statusInfo`
  (session UNKNOWN, holders null); bStocks omits `stockInfo.price` when its
  reference is frozen. Correct behavior, but fail-open rendering ("frozen") must
  be built by every consumer — a `staleness` flag in the response would help.
- `POST .../security/token/audit` requires header `source: agent` plus
  `requestId` (UUID) — undocumented outside the skills repo; without them it
  silently returns nothing.

## 4. AI stack feedback (Wallet Skills / Agentic Wallet / Agent Studio)
- Used: Agent Studio `bag` CLI 0.0.14 (`init`, `wallet new`, `llm activate`,
  `doctor`, `dev`), TypeSafe Jev (`jev-1.13.0`) for the guard, Binance skills-hub
  repo as documentation substitute.
- What worked: scaffold quality is high (signing isolated from LLM tools,
  deterministic quote clamp, background delivery + sweep). `negotiate` verified
  locally end-to-end (signed 0.1 U quote, correct hashes). `bag doctor`
  readiness gates are genuinely useful (caught missing bun + unfunded wallet
  before deploy, not after). Pieverse `auto/free` needed zero funding.
- What didn't: `bag deploy` needs Bun but the CLI never installs/checks it
  upfront (`doctor` flags it, `deploy` just fails) — check at `init`. Platform
  trial needs GitHub device auth + Telegram-faucet tBNB/U — three human hops
  before a first deploy; a single `bag trial --auto` that prints all three
  codes at once would cut drop-off. ERC-8004 status check timed out with no
  retry hint.
- Missing: a machine-readable signed-API spec (see §1) — without it neither
  Wallet Skills nor hand-rolled agents can touch Trading/Transaction modules.

## 5. Tokenized-stock specifics (measured on BSC mainnet, Sept 2026)
- Weekend/pre-market spreads are real but small on majors (NVDAon +14–20bps,
  NVDAx −38bps pre-market); NVDAB reference goes null when frozen — the
  staleness signal, not an error.
- Liquidity ≠ executability (headline finding): 28/28 USDT V3 pools across 10
  tickers × Ondo/xStocks/bStocks price correctly via QuoterV2 yet revert on
  delivery to retail EOAs (even minOut=0); EOA→EOA transfers work (mined probe
  `0xb0b71d…8943`). SPCXB's fee-2500 pool (liq ~2e24) included. Builders should
  be told: route fills through issuer rails (bStocks convert, Ondo mint), not AMMs.
- Issuer mechanics differ observably: Ondo reinvest NAV (multiplier 1.0017 on
  NVDAon), xStocks no status feed, bStocks null ref when frozen. One normalized
  `session + staleness` object across issuers would save every team a week.

## 6. Redesign suggestions
- Ship the signed REST spec as a versioned OpenAPI file on GitHub (like the
  community `binance-web3.openapi.json`) — single highest-leverage change.
- Add per-venue on-chain depth-for-size (±1% depth USD) to Dynamic V2 so guards
  don't need a second Trading quote call.
- Un-gate `llms.txt`/`llms-full.txt` for agents; link the v3 deployments repo.

## 7. Requested capabilities
- Transaction API simulate endpoint usable with dev-portal key + public signing
  spec; Wallet API portfolio for stock venues; webhook/callback for
  reference-market reopen (we poll); `GET pool executability` (quoter + delivery
  dry-run) as a first-class endpoint — we built it ourselves in `/api/fill`.

# NightDesk — BNB Hack: Tokenized Stocks Edition — submission checklist

Track: Tokenized Stocks Products & Agents · BSC mainnet · spot only
Stack: RWA Data + Market (dynamic V2) + TypeSafe guard · Trading/Transaction wiring staged

## Done (in repo)
- [x] Public repo (this one), MIT license, `.env.example`, no secrets committed
- [x] Live truth card: `GET /api/truth?ticker=NVDA` — 3 BSC venues, both prices, spread, session badge
- [x] TypeSafe guard: `POST /api/guard` — batched intent/severity/block/staleness, deterministic fallback
- [x] Actions: `POST /api/limits` (limit-at-reference, paper) + `/api/alerts` (alert-at-open, re-evaluated live)
- [x] Honest simulation hook: reports the missing-key gap instead of faking fills
- [x] Tests (`pnpm test`), typecheck, production build all green
- [x] DX log (`DX_LOG.md`) — specific, timestamped, includes AI-stack feedback

## Founder must do (needs wallet, funds, accounts — cannot be delegated)
- [ ] Register hackathon + get Binance Web3 API key → `BINANCE_API_KEY` in `.env.local`
- [ ] Replay an armed limit intent through Transaction API simulate → flip `simulateIntent()` to real
- [ ] Fund a wallet with a few dollars → first small live fill → paste tx hash into README proof section
- [ ] Record demo video (≤4 min): Sunday premium → limit at Friday close → receipt
- [ ] Deploy (Vercel or any host) → public link stays live through judging (12–23 Oct)
- [ ] Submit forms: project form + DX Report form (mine `DX_LOG.md` for specifics)
- [ ] (Stretch, +$2k each) Agentic Wallet session execution + Agent Studio seller for the spread feed

## Proof section (paste live evidence here)
- Live mainnet evidence (no fill possible — see structural finding; proofs are
  on-chain reads anyone can replay):
  - Demo wallet `0x4Ba1e9e275EF61B56C99532D0066506436201D73` holds 10.29 USDT;
    `allowance(USDT → V3 router) = 5 USDT` from a mined approval (real gas spent)
  - `POST /api/fill` paper for NVDA returns live quote + reverted delivery
    simulation + `executability.swappable=false` with reason
- BSC tx hashes:
- Deployed link:
- Demo video link:

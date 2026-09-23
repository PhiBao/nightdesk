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
- HELD STOCK (live, 2026-09-22): demo wallet
  `0x4Ba1e9e275EF61B56C99532D0066506436201D73` holds **0.080079 SPCXB**
  (SpaceX bStocks, `0xbe9d…3103e1`) + 10.29 USDT — withdrawn from Binance to BSC,
  verified via `balanceOf`: <a href="https://bscscan.com/address/0x4Ba1e9e275EF61B56C99532D0066506436201D73" target="_blank" rel="noreferrer">https://bscscan.com/address/0x4Ba1e9e275EF61B56C99532D0066506436201D73</a>
  - Withdrawal delivery: <a href="https://bscscan.com/tx/0x9cb6af7ec8be38b5f79840e04c882cda30e98cd0ce8602416570c0a9ec3afdd1" target="_blank" rel="noreferrer">https://bscscan.com/tx/0x9cb6af7ec8be38b5f79840e04c882cda30e98cd0ce8602416570c0a9ec3afdd1</a>
    (status 1 — Binance hot wallet → SPCXB contract)
  - Transfer probe (dust self-transfer, status 1, block 123361771):
    <a href="https://bscscan.com/tx/0xb0b71d55dfed25b702e73177104bd6013012176917c14cc753d34a28b5679433" target="_blank" rel="noreferrer">https://bscscan.com/tx/0xb0b71d55dfed25b702e73177104bd6013012176917c14cc753d34a28b5679433</a>
    — proves EOA↔EOA movement works while AMM pool delivery reverts
  - **Sanctioned-rail fill (the answer): $10 → 0.043644 NVDAon, status 1, block 123527330:**
    <a href="https://bscscan.com/tx/0xcb486bf02608194d4544187ea132f37444f2f0f54232a355ff1e48eb23605d6f" target="_blank" rel="noreferrer">https://bscscan.com/tx/0xcb486bf02608194d4544187ea132f37444f2f0f54232a355ff1e48eb23605d6f</a>
    — quoted + built via Trading API aggregator (LiquidMesh USDT→NVDAB→NVDAon),
    predicted by Transaction API simulate, approved via approve-transaction
    (`0x0a8682…351a664c`), settled on BSC
  - Approval hygiene: leftover 5-USDT router approval revoked on-chain
    (allowance now 0):
    <a href="https://bscscan.com/tx/0xc1a14d876e15320c8e332a5f9c409eb7c6e2302190859415078ae8429d197804" target="_blank" rel="noreferrer">https://bscscan.com/tx/0xc1a14d876e15320c8e332a5f9c409eb7c6e2302190859415078ae8429d197804</a>
- AGENT (live, testnet trial ~48h from 2026-09-22 ~11:25 UTC):
  - A2A card: <a href="https://bnbagent-api.bnbchain.world/v1/rt/01M34DSYKGTMQ4QQ1EFQE99T1V/.well-known/agent-card.json" target="_blank" rel="noreferrer">https://bnbagent-api.bnbchain.world/v1/rt/01M34DSYKGTMQ4QQ1EFQE99T1V/.well-known/agent-card.json</a>
  - ERC-8004: agent_id 2460, wallet `0xCBF4…9640C` (gasless operator relay)
  - Remote `negotiate` verified: signed 0.1 U quote for "NVDA weekend spread report"
  - x402 rail: deployed but UNVERIFIED (gateway 404) — ERC-8183 escrow is the proven rail
- Delivery block (all 28 pools + 3 SPCXB pools): `POST /api/fill` paper returns live
  quote + reverted delivery simulation + `executability.swappable=false`
- Deployed link: <a href="https://nightdesk-psi.vercel.app" target="_blank" rel="noreferrer">https://nightdesk-psi.vercel.app</a> (Vercel prod, TYPESAFE_API_KEY configured — live guard)
- Demo video link: <a href="https://youtu.be/N-KIcmmdEZE" target="_blank" rel="noreferrer">https://youtu.be/N-KIcmmdEZE</a>

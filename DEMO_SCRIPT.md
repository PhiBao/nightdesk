# Demo video script — NightDesk (target 3:00, hard cap 4:00)

## 0:00–0:20 — Hook (Sunday screen)
"It's Sunday 2am in São Paulo. Apple closed Friday at $254. Its token didn't.
Every screen shows you a price. None tells you what it means. This is NightDesk."

## 0:20–0:50 — Truth card (live)
- Type NVDA → truth card loads: 3 BSC venues, on-chain vs reference, spread in bps.
- Point at the session badge: "OVERNIGHT — reference frozen 38 hours. That +1.8%
  premium is the price of Sunday."
- Venue compare: "bStocks cheapest — same stock, three prices."

## 0:50–1:30 — Guard verdict (the wow)
- Intent box: "Buy $200 NVDA, don't overpay" → verdict: LIMIT_AT_REFERENCE,
  market blocked, severity 1.74/2.
- "The model doesn't trade. It judges. Code does the math, Jev reads the intent —
  one batched call, four judgments."
- Click "Arm limit at reference" → receipt: size, ref price, simulation status.

## 1:30–2:10 — The finding (memorable minute)
- "Then we tried to fill it. 28 pools, 10 tickers, all three issuers — every pool
  prices correctly…" (show quoter output) "…and every delivery reverts." (show revert)
- "So we probed a wallet-to-wallet move — mined first try." (show BscScan tx
  `0xb0b71d…8943`) "Hold and move: yes. Permissionless swap: no. NightDesk tells
  you that BEFORE you pay gas."
- Holdings panel: real 0.080079 SPCXB in the demo wallet + BscScan link.

## 2:10–2:45 — Agent layer
- "The same truth feed is for sale." Show the Agent Studio seller: A2A card,
  negotiate → signed 0.1 U quote (local verification output).
- "Any agent can buy a spread report via ERC-8183 escrow or x402 — pricing is
  fixed code, the LLM only narrates numbers computed from live feeds."

## 2:45–3:00 — Payoff
- "NightDesk: the session-aware buy screen. It shows what the after-hours price
  means — and stops you paying for Sunday."
- Repo + live link on screen. End.

## Shot list (all must be real, no mocks in hero path)
1. Live truth card for NVDA (or weekend timestamp if filming on weekend)
2. Guard verdict JSON (intent 0.8+, severity, blocked:true on a premium case)
3. Quoter output vs revert trace, side by side
4. BscScan: SPCXB balance + probe tx + withdrawal tx
5. bash: `negotiate` returning a signed quote
6. Fallback proof: same flow with TYPESAFE_API_KEY unset (verdict source: fallback)

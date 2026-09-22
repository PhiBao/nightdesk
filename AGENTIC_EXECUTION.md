# Agentic execution — design + status

## Thesis
The agent never holds unchecked spending power. Every live action passes three
gates: TypeSafe guard verdict (intent + block flag) → executability probe
(quoter + delivery dry-run) → hard cap + kill-switch. The key lives server-side
and can only move through allowlisted operations.

## Shipped (this repo, no App pairing needed)
- `POST /api/fill` live path: explicit `confirm:true` + `usdAmount ≤ MAX_LIVE_USD`
  (default 10, absolute ceiling 100) + `data/HALT` kill-switch check + simulation
  must pass. Paper mode otherwise.
- `POST /api/revoke { halt | resume | allowance }`: file kill-switch (no gas) +
  on-chain allowance revoke (real tx). Revoke UI is wired in the app footer.
- Allowance hygiene: leftover approvals are revocable in one click; every
  approval is exact-amount (never infinite).
- Agent Studio seller (`nightdeskseller/`): ERC-8004 identity + ERC-8183
  negotiate/notify_funded + x402, selling spread-truth reports. Locally verified
  (`negotiate` returns a signed 0.1 U quote). Platform deploy pending founder:
  `bag platform login` (GitHub device flow) + Telegram-faucet tBNB/U for
  `0xCBF499915e234DC55e12e96011D75D245FC9640C`, then `bag deploy --provider bnb`
  + `bag erc8004 register`.

## Pending: Binance App pairing (unlocks the $2k Agentic Wallet special)
- `baw auth signin` → pairing code → confirm in Binance Wallet App →
  `baw auth verify` → trade through the wallet's MEV-protected routing with
  scoped sessions (spend cap + expiry + allowlist) and user-visible revoke.
- Why still worth it despite the delivery block: paired execution proves the
  guard→session→revoke loop on real rails, and issuer-rail fills (bStocks
  convert/Ondo mint paths) become agent-drivable where AMMs cannot settle.
- Estimated founder time: ~15 minutes in the App + one fund move.

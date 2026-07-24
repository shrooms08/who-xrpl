# lib/ledger — XRPL adapter boundary

**All** XRPL / Xaman interaction goes through the `LedgerAdapter` interface.
Game logic and UI depend only on the interface — grep-proven: no file outside
this directory imports `xrpl` or `xumm`.

- `adapter.ts` — `LedgerAdapter` interface + types (`SignRequest`,
  `SeatClaimVerification`, `AccountInfo`), `SEAT_CLAIM_DROPS` (12 drops), and the
  `WHO?:seat:{lobbyId}:{playerId}` memo helpers.
- `mock.ts` — `MockLedgerAdapter`: instant-success, no network. Default (Week-1
  Casual) and used by the test suite.
- `xrpl-testnet.ts` — `XrplTestnetAdapter`: Xaman (`xumm-sdk`) for sign
  payloads, `xrpl.js` for ledger reads. **Verification always reads
  `meta.delivered_amount`, never `Amount`** (partial-payment safety — see the
  comment in `verifySeatClaim`).
- `index.ts` — `getLedgerAdapter()` selects by `LEDGER_ADAPTER` env var
  (`xrpl-testnet` → real; anything else → mock). Server-only.

Seat claims are **pre-game** (they gate the host's Start), so they are keyed to
the **lobby**, recorded in `ledger_events` (with `lobby_id`), and checked via the
`has_verified_seat_claim(lobby, player)` RPC.

**Runtime config** (only when `LEDGER_ADAPTER=xrpl-testnet`): `XUMM_API_KEY`,
`XUMM_API_SECRET` (server-only), `XRPL_APP_ADDRESS` (the app's public testnet
receiving address), `XRPL_NETWORK`.

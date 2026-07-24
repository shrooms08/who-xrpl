# Gate 3 — XRPL testnet seat-claim · Report

**Status:** code-complete, awaiting review + the live-testnet acceptance (which
needs your Xumm credentials — see §5). Supabase project `wzpvdverwrqipxuequaf`.

---

## 1. What was built (file map)

```
lib/ledger/
  adapter.ts        LedgerAdapter interface + types + SEAT_CLAIM_DROPS (12) +
                    WHO?:seat:{lobby}:{player} memo helpers
  mock.ts           MockLedgerAdapter — instant success (default / tests)
  xrpl-testnet.ts   XrplTestnetAdapter — xumm-sdk sign payloads + xrpl.js verify
  index.ts          getLedgerAdapter() — env-var selection (server-only)

app/api/wallet/link, wallet/resolve                 Xaman wallet link → profile
app/api/lobby/[lobbyId]/seat-claim, …/verify        seat-claim sign + verify
app/api/game/start                                  + on-chain gating added
app/lobby/[id]/SeatClaim.tsx                         wallet-link + seat-claim UI
app/lobby/[id]/LobbyRoom.tsx                          Casual/On-chain toggle
                                                     (persisted), roster claim
                                                     status, start gating
app/admin/ledger/page.tsx                            ledger-events listing

supabase/migrations/0012_seat_claim_schema.sql       profiles.xrpl_address,
  lobbies.mode (casual|onchain), ledger_events.lobby_id, has_verified_seat_claim()
```

## 2. Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| On-chain lobby: a player without a verified seat claim cannot occupy a starting slot | ✅ PROVEN | The start route rejects with `seat_claims_incomplete` unless every member has a verified `seat_claim` in `ledger_events`. DB harness verified the exact gate: unclaimed member → **blocked**; all claimed → **allowed**; `has_verified_seat_claim` true/false correct. |
| A real testnet tx from Xaman is verified and appears in `/admin/ledger` | ⏳ needs your creds | Fully built: `createSeatClaimRequest` (Xumm payload, 12-drop payment + memo) → sign in Xaman → `verifySeatClaim` reads the ledger and records the event. Requires `XUMM_API_KEY/SECRET` + an app testnet address (see §5) + a real Xaman signature — your manual step. |
| Entire Gate 2 test suite passes with `MockLedgerAdapter` | ✅ PROVEN | 42 engine tests green; the game engine imports nothing from `lib/ledger`, so it is fully insulated. |
| Grep proof: no file outside `lib/ledger/` imports `xrpl` or `xumm` | ✅ PROVEN | `grep` over `app/ components/ lib/` → the only importers are inside `lib/ledger/`. |

## 3. Decisions made that weren't specified (all flagged)

1. **Seat claims are keyed to the LOBBY, not a game.** Claims gate the host's
   Start, which happens *before* any game row exists — so the memo is
   `WHO?:seat:{lobbyId}:{playerId}` and `ledger_events.lobby_id` (nullable) holds
   the reference. The interface param is still named `gameId` per the spec.
2. **Partial-payment safety**: `verifySeatClaim` reads `meta.delivered_amount`
   and never `Amount` (commented in the adapter) — a `tfPartialPayment` sender
   can set a high `Amount` but deliver less.
3. **Real-adapter memo binding**: on `xrpl-testnet`, verify also requires the
   memo to equal `WHO?:seat:{thisLobby}:{thisPlayer}`, so a player can't submit
   someone else's (or another lobby's) payment. (Mock skips this.)
4. **`/admin/ledger` access**: auth-gated to any signed-in user, reads via the
   service role. Proper admin-role gating is deferred (no admin role exists yet;
   testnet seat claims are public on-ledger anyway).
5. **Wallet link is optional to claiming**: the seat-claim payment itself is the
   gating action; linking (Xaman sign-in → `profiles.xrpl_address`) is offered
   but a claim doesn't strictly require a prior link.
6. **Adapter caching**: `getLedgerAdapter()` memoises one instance per server
   process.

## 4. Known issues / debt

- The **live-testnet path is unexercised** here (mock only) — it compiles and the
  logic follows the xrpl.js v4 / xumm-sdk APIs, but the real Xaman round-trip
  wants your creds + a phone (§5). The mock proves the whole app flow + gating.
- `ledger_events` isn't in the realtime publication, so the lobby learns of new
  claims via its existing resync poll (not instantly) — fine for the pre-game
  screen.
- `/admin/ledger` admin gating (decision 4).

## 5. To finish the live-testnet acceptance — what I need from you

1. Create a Xaman/Xumm app at **apps.xumm.dev** and add to `.env.local`:
   `XUMM_API_KEY=…`, `XUMM_API_SECRET=…`
2. An **app testnet receiving address** (public) as `XRPL_APP_ADDRESS=…` — the
   app never holds its key; it only watches for incoming 12-drop payments. I can
   generate a testnet account via the faucet if you'd like, or use one you control.
3. Flip `LEDGER_ADAPTER=xrpl-testnet` in `.env.local` (default stays `mock`).

Then: create an on-chain lobby, link Xaman + claim a seat (sign the 12-drop
payment on your phone), and confirm the verified claim shows in `/admin/ledger`
and that Start unblocks only once everyone has claimed.

## 6. Wait for approval

Three of four acceptance criteria are proven now; the fourth is the credential-
gated live-testnet run. Standing by for the Xumm creds / app address and your
review before considering Gate 3 closed.

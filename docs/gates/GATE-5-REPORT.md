# Gate 5 — Seat-claim UX, wallet disconnect, host settings

Three parts, each with a stop. Testnet only. Mock-adapter insulation preserved;
no file outside `lib/ledger` imports xrpl/xumm.

---

## Part 1 — Seat-claim UX fix ✅ (STOP for re-test)

### Problem
After signing in Xaman the UI frequently showed `not_validated` and invited a
re-sign, producing duplicate payments. Root cause: **signed ≠ validated**. A
signed tx needs a few ledger closes to validate; `verifySeatClaim` returns
`not_validated` (or `txnNotFound`) during that window, and the old client flow
(`runSignFlow`) treated *any* reason other than `not_signed` as terminal — it
surfaced the interim state as an error and re-enabled the claim button.

### Fix (no schema migration — reuses `ledger_events.verified`)

**Ledger adapter** (`lib/ledger`)
- `resolveSeatClaim` now returns a real lifecycle — `pending | signed | rejected
  | expired` (`SeatClaimResolution`) — instead of `{txHash} | null`. Rejection
  and expiry are distinguished from "not yet signed".
- New `findSeatClaim(lobbyId, playerId, payerAddress)` — reconciles against the
  ledger via `account_tx`, matching a validated Payment to the app address that
  carries this exact seat memo. Adopts the first validated match; **logs extras**
  (duplicate signs from testing). Best-effort: any error → `null` (never throws).
- Mock adapter: `resolveSeatClaim → {state:"signed"}` (validates instantly),
  `findSeatClaim → null`. Casual play + the test suite are unaffected.

**Verify route** (`/api/lobby/[lobbyId]/seat-claim/verify`)
- Returns a tri-state `{status}`: `validated | pending | rejected | expired |
  failed`. Only genuinely-wrong payments are terminal (`not_payment`,
  `wrong_destination`, `insufficient_amount`); `not_validated` / `txnNotFound` /
  transient read errors report **`pending`** (keep polling), never an error.
- On `signed`, writes a **pending** `ledger_events` row (keyed on `tx_hash`)
  *before* validation, so a refresh mid-confirm can resume that exact tx. Flips
  it to `verified=true` on validation (upsert on `tx_hash`, idempotent).

**Reconcile route** (`/api/lobby/[lobbyId]/seat-claim/reconcile`, new)
- No signature. In order: (1) already verified → `validated`; (2) a pending row →
  re-check its tx on-ledger (`validated` or still `pending`); (3) `findSeatClaim`
  ledger scan → adopt a past/unrecorded payment. Else `none`.

**Client** (`app/lobby/[id]/SeatClaim.tsx`)
- State machine: `checking → idle → awaiting(QR) → confirming → ✓` / `error`.
- **Reconciles on mount AND on claim-press** — an existing or in-flight claim is
  adopted, never re-signed.
- Once a payload is signed the claim button is **gone** (state is `confirming`),
  so the player is never invited to re-sign while pending.
- Signed → ink-styled `confirming on the ledger…` pending chip (dashed `--calm`,
  pulsing dot), **not** an error. Polls ~2s; after 30s the copy softens to
  `taking longer than usual — still watching…` and **keeps polling**.
- Failure only on explicit `rejected` / `expired` / hard `failed`.
- Raw `not_validated` is never shown to the user.

### Acceptance (manual, testnet — to be run)
1. Sign once → "confirming…" a few seconds → chip flips ✓ hands-free.
2. Refresh mid-confirm → reconcile resumes the pending tx → resolves.
3. Raw `not_validated` never shown; no re-sign prompt while pending.

### Notes / accounts
Wallet links found (all with 0 verified / 0 pending claims):
- `rukevwe.eminokanju08@gmail.com` (minos) → `rEQMs6…mB14`
- `emirukevwe@gmail.com` (juju) → `rEQMs6…mB14` — **same wallet as minos** (stale
  duplicate; recommend clearing on `juju`).
- `quiesce08@gmail.com` (Qui) → `rHJoeS…6mng`

Not cleared — awaiting the go-ahead (Part 2 will add in-app disconnect).

### Tests
- Unit suite green (49 tests) incl. mock-adapter path.
- `tsc` clean; production build compiles; reconcile route registered.

---

## Part 2 — Wallet disconnect ✅ (STOP for review)

### Affordance
In the on-chain lobby's wallet UI (`WalletLinkButton`), a linked wallet now shows
an ink-styled `disconnect` link. Clicking opens a two-step confirm (dashed-ink
panel) that **states the consequence**: "disconnect this wallet? your seat claim
will be dropped — you'll re-link and claim again." → `disconnect` / `keep wallet`.
(No profile page exists; the wallet UI is the single, lobby-scoped home for this.)

### Server — `/api/wallet/disconnect` (new)
- Re-auths the caller.
- Clears `profiles.xrpl_address` (RLS `profiles_update_self`; next claim re-links).
- When called from an on-chain lobby the caller is a member of: inserts a
  `seat_unclaim` **tombstone** row and deletes only **unverified** in-flight
  `seat_claim` rows. **Verified claim rows are never modified** — the on-chain
  payment record stays in `ledger_events` history untouched.

### Claim semantics — "latest event wins" (migration 0014)
A verified `seat_claim` counts only if no `seat_unclaim` for the same lobby+player
is at-or-after it. Applied consistently:
- `has_verified_seat_claim` rewritten (drives verify/reconcile idempotency).
- Game-start gating (`/api/game/start`), lobby load (`page.tsx`), and live
  `refetchClaims` all compute the same latest-event-wins set.
- Additive only: existing rows are never touched, so disconnect can't destroy the
  audit trail.

### Interaction with Part 1
After disconnect the player is unclaimed: reconcile finds no live claim (tombstone),
no pending row (deleted), and `findSeatClaim` is scoped to the *current* wallet
(now null / a new address), so the old-wallet payment is never re-adopted. They
re-link and claim fresh. (Re-linking the *same* wallet auto-adopts the existing
valid payment via reconcile — desirable, since that seat was genuinely paid.)

### Tests
- Predicate proved against synthetic rows: claimed-no-unclaim → true;
  claimed-then-disconnected → false; disconnected-then-reclaimed → true;
  only-pending → false.
- `tsc` clean; build compiles; disconnect route registered; 49 unit tests pass.

---

## Part 3 — Host settings ⏳ (pending)

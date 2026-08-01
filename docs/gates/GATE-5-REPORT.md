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

## Part 2 — Wallet disconnect ⏳ (pending)

## Part 3 — Host settings ⏳ (pending)

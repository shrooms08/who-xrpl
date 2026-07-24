# Gate 4 — The Money Loop · Report

**Status:** 🟡 **Part A (Payout engine) complete — STOP for review.** Part B
(commit-reveal votes + 20s guess timer) not yet started. Testnet only. Supabase
project `wzpvdverwrqipxuequaf`.

---

## Part A — Payout engine

### 1. What was built (file map)

```
lib/game/config.ts        + GAME_POT_DROPS (1_000_000 = 1 XRP)
                          + PAYOUT_RESERVE_DROPS (2_000_000) — the ONE reward config
lib/ledger/
  split.ts                splitPot() — PURE, testable pot split (remainder → first winner)
  adapter.ts              + PayoutResult, payout()/payoutPotBalanceDrops() on the
                          LedgerAdapter interface, payoutMemo/parsePayoutMemo helpers
  mock.ts                 MockLedgerAdapter.payout — instant success, pot always flush
  xrpl-testnet.ts         XrplTestnetAdapter.payout — Wallet.fromSeed → autofill → sign
                          → submitAndWait → tesSUCCESS + meta.delivered_amount; balance
                          read; SEED read here and NOWHERE else (never logged/returned)
  payouts.ts              server-only runner: settleGameIfEnded, runPayouts,
                          advanceAndSettle

app/api/game/[gameId]/advance   advanceIfDue → advanceAndSettle (timeout→end path)
app/api/game/[gameId]/guess     + settleGameIfEnded after mutation (correct-guess end)
app/api/game/[gameId]/vote      + settleGameIfEnded after mutation (defensive)
app/game/[gameId]/page.tsx      reads payouts, passes initialPayouts
app/game/[gameId]/GameRoom.tsx  payouts state + refreshPayouts in the backstop poll
app/game/[gameId]/panels.tsx    EndScreen paid chips (--calm amount + tx link / pending)
app/game/[gameId]/types.ts      PayoutView, dropsToXrp, txExplorerUrl
app/admin/ledger/page.tsx       + dedicated payouts table (status/amount/tx/error)

supabase/migrations/0013_payouts_schema.sql   payouts table + RLS (see §3)
lib/database.types.ts                          regenerated (payouts table)
.env.example                                   XRPL_PAYOUT_ADDRESS / XRPL_PAYOUT_SEED
```

### 2. Reward model (config-driven)

- **On-chain games only.** Casual games record zero ledger activity (proven).
- Winning **side** (every player whose role = `winner`, alive or ejected) splits
  `GAME_POT_DROPS` equally; remainder (`pot mod n`) → the first winner in canonical
  order (**player_id asc**, deterministic). Single imposter-side winner takes the
  whole pot.
- Payout tx memo: `WHO?:payout:{gameId}:{playerId}`.

### 3. Idempotency (the critical property)

Two independent layers guarantee **no double-pay** on a retried / double-invoked
game-end:

1. **Obligations created exactly once** — `payouts (game_id, player_id)` is
   `UNIQUE`; rows are `upsert(..., ignoreDuplicates:true)` = `ON CONFLICT DO
   NOTHING`. A retry leaves existing rows (incl. already-`sent`) untouched.
2. **Per-row claim CAS** — each row is claimed with
   `update … set status='sending' where id=? and status='pending'`. Postgres
   row-locking serialises concurrent claims, so exactly one runner submits the tx
   for a given row.

Plus a cheap short-circuit: once every row is terminal (`sent`/`failed`/`skipped`)
`settleGameIfEnded` returns `already_settled` without a balance call or any writes.

**Balance guard** (all-or-nothing): if pot balance < `pot + reserve` (or the
balance is unreadable), *every* payout is marked `skipped/insufficient_pot`, a
single `payout_skipped_insufficient_pot` ledger event is recorded, and the
game-end flow returns cleanly — it never crashes on a dry pot. The whole runner is
wrapped so a ledger hiccup can never propagate into game-end.

### 4. Custody & insulation

- The payout wallet is a **new, dedicated** hot wallet (`XRPL_PAYOUT_*`), separate
  from the receive-only `XRPL_APP_ADDRESS`. Provisioned/funded by the operator.
- `XRPL_PAYOUT_SEED` is read **only** in `lib/ledger/xrpl-testnet.ts`
  (grep-proven), behind the `server-only` guard chain; never logged, never placed
  in a returned `reason` (seed is stripped from any error string). A
  seed↔address mismatch check refuses to sign from an unexpected key.
- Game code calls `payout()`/`payoutPotBalanceDrops()` on the `LedgerAdapter`
  interface only. No file outside `lib/ledger/` imports `xrpl`/`xumm`.

### 5. Tests

| Test | Result |
|---|---|
| Split math (pure unit) — even split, remainder→first, single winner, sum-conservation over 1..10 winners, order-determinism, bigint precision | ✅ 7 pass |
| **Idempotency: concurrent double game-end → each winner paid exactly once** (payout() called exactly `n` times across two overlapping `settleGameIfEnded`; `n` distinct tx hashes; shares sum to the pot; one `payout` ledger event per winner) | ✅ pass |
| Re-settle an already-paid game (refresh-spam) adds nothing (`already_settled`) | ✅ pass |
| Single imposter-side winner receives the whole pot | ✅ pass |
| Insufficient pot → all `skipped`, zero payout() calls, one skip event, no crash | ✅ pass |
| Casual game → `not_onchain`, zero payouts, zero ledger activity | ✅ pass |
| Full engine unit suite (mock adapter still green) | ✅ 49 pass |
| Full live-DB e2e suite (existing game e2e + payouts e2e) | ✅ pass |

### 6. Design decisions (flag for review)

- **Winners = the whole winning side** (role = winner), including a crew member
  who was wrongly ejected. Rationale: "the winning side splits." Trivial to change
  to survivors-only if you'd prefer. In the 4-player acceptance run this is moot
  (crew wins with all 3 crew alive).
- **`PAYOUT_RESERVE_DROPS = 2 XRP`** buffer over the pot (covers XRPL account
  reserve + fees). Tunable in the one config file.
- **Trigger sites:** the request that transitions a game to `end` settles it — the
  timeout/reveal→conclude path via the 3 s advance poll, and the correct-guess
  path via the guess route. Page load does **not** block SSR on payouts.
- **In-doubt rows:** a process killed mid-submit could leave a row `sending`
  (favours no-double-pay over guaranteed-pay). Acceptable for testnet; noted.

### 7. Not in this part

`/admin/ledger` already lists payouts with hashes (acceptance #2). Live-testnet
manual acceptance (#1, #4, #5) is the operator's run once `XRPL_PAYOUT_*` are set
in Vercel with a faucet-funded wallet. Commit-reveal votes (acceptance #3) and the
20 s guess timer are **Part B**.

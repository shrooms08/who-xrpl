# Gate 6 — Playtest bug batch (membership / presence launch-blocker)

One live session (laptop host + 2 phones, clueRounds=2, game→payout). Fixed as one
gate. Precedes profile gate / face system / mainnet cutover.

## Diagnosis — the unifying hypothesis was correct

Pulled tonight's timeline. Game `f20c410c…` (lobby `0173499b…`, on-chain, crew win,
payout succeeded): **4 players dealt, only 2 lobby members remained.**

| player | device | still lobby member | verified claim | seat_unclaim |
|---|---|---|---|---|
| minos (host) | laptop | ✅ | 1 | 0 |
| juju | phone | ✅ | 1 | 0 |
| **Qui** | phone | ❌ **deleted** | 1 | **0** |
| **Emmy** | phone | ❌ **deleted** | 1 | **0** |

Both phones' `lobby_players` rows were deleted with **verified claims intact and
zero disconnect tombstones** — so this was not an explicit leave or a Part-2
disconnect. It was presence-driven deletion.

**Root cause (single):** `LobbyRoom.tsx` — on a presence `leave` event, the host's
client executed `delete from lobby_players` for the leaving player (RLS
`lobby_players_delete_self_or_host` permits the host to delete anyone). Mobile
presence flakes constantly (background throttling, Xaman round-trips), so the
laptop host reaped the phones. And `is_game_member` **joined `lobby_players`**, so
a deleted row → `authGameMember` 403 on every game route (Bug 2) and RLS-filtered
every refetch to empty, which the client swallowed → fossilized screens (Bug 4).
The pass-boundary "turn desync" (Bug 3) was the same: the 403'd phones couldn't
refetch the turn pointer. **Bugs 1, 2, 3, 4 are one bug.**

## Fixes

### Bug 1 — presence never removes membership
- **Removed** the host-deletes-on-presence-leave block. Presence loss now only
  dims the roster and feeds host-migration timing — nothing deletes membership.
  Leaving is explicit only (leave button / host kick).
- `reap_and_migrate_host` (migration 0016) rewritten: gates on **60s** staleness
  (was 20s), **migrates the host role only — never deletes the stale host's row**,
  respects a claim grace window, and picks a successor other than the absent host.
- **Grace immunity**: `set_claim_grace` marks the player non-stale for **5 min**;
  the seat-claim / wallet-link flows call it before opening a Xaman payload (the
  flow requires leaving the browser). The reaper honours it.
- **Return-from-Xaman**: the lobby's visibility/focus/pageshow handler now
  **re-registers presence** (channel `track` + `touch_lobby_presence`) in addition
  to refetching — a returned player is shown present again, not just re-synced.
- Returning with a live verified claim → claimed state returns automatically
  (Part-2 tombstone semantics, verified: no unclaim → still claimed). An ejected
  player can always re-join via code (`join_lobby` re-inserts).

### Bug 2 — 403 on clue submit (the invariant)
- `is_game_member` (migration 0016) now keys off **`game_players`**: a player dealt
  into a game is a game member until game end, regardless of live lobby membership.
  `authGameMember` and every game RLS policy inherit the fix.
- **Regression test** (`membership.e2e.test.ts`): signs in as a dealt non-host,
  deletes their `lobby_players` row mid-game, and asserts `is_game_member` stays
  true, `rounds` stays readable, and the role card still resolves. **Passes.**

### Bug 3 — turn desync at the clue-pass boundary
- (a) The phase banner announces the pass — **"round N of M"** in the clue header;
  the clue feed already groups by round (Gate 5) with a "round N" divider.
- (b) With membership intact + `is_game_member` fixed, the 3s backstop poll's
  `refetchAll` reconciles `current_turn_player_id` every tick (previously the
  phones were 403-blocked). The desync was a symptom of the membership bug.

### Bug 4 — phones stuck at clue through discussion/vote/settlement
- (a) **Trouble watchdog**: if no state fetch succeeds for **>10s** while visible
  and mid-game, the indicator shows **"connection trouble — retrying…"** — never a
  silent freeze. (`refreshRound` timestamps each success; a 2s watchdog trips it.)
- (b) Resolved by the membership + `is_game_member` fix (blocked refetches were the
  cause); covered by the same regression test.

## Migration 0016 (applied to DB)
`is_game_member` → game_players; `reap_and_migrate_host` 60s + role-only + grace;
`lobby_players.grace_until` + `set_claim_grace`.

## Verification
- Regression e2e (membership survives lobby delete): **pass**.
- 93 unit tests pass; `tsc` clean; production build compiles.
- Full live-DB e2e suite re-run (game orchestration + payouts + signup + membership).

## Acceptance (host re-run with phones)
1. Phone joins on-chain lobby → connect + sign in Xaman taking 60+s → return →
   still in lobby, claim confirming.
2. Phone backgrounded 2 min mid-lobby → still a member, at most dimmed.
3. Full clueRounds=2 game: both passes submit, no 403s, pass banner visible, no
   turn disagreement persisting >5s.
4. Every phase transition reaches all devices within ~4s, or the trouble indicator
   shows.
5. Ejection-free end to end, through payout.

# P1 addendum — match history + career counters on /profile

Specced in the profile gate, built now. Both are live read-models (no denormalized
counters); the composer page (`/profile`) gains a record section below the face
editor.

## Career counters
`get_career_stats()` computes, live from `game_players` / `games` / `payouts`:
games · wins (my role = winner) · imposter games · imposter wins · total XRP won
(sum of my `sent` payout drops, shown as XRP). Rendered as a 5-tile ink row.

## Match history
`get_match_history(limit=20, offset=0)` returns the caller's completed games,
reverse-chron by `ended_at`: date · topic (the drawn word's category) · player
count · my role chip (crew `--calm` / imposter `--hot`) · result (`won` `--calm` /
`lost` `--hot`) · payout amount + testnet explorer link where a `sent` payout
exists. "load more" pages by 20. Empty state in the ink voice ("no games yet —
you haven't hunted an imposter yet. start a game.").

## RLS reasoning (why these are safe)
Both functions are `SECURITY DEFINER` and **every row is filtered to
`auth.uid()`** — a caller can only ever read games they participated in. What is
returned is deliberately minimized to *own participation + game-level facts*:

- **Own participation**: `my_role` (from the caller's own `game_players` row) and
  the caller's own payout (`payouts` filtered to `player_id = auth.uid()`).
- **Game-level facts**: `ended_at`, `topic`, `player_count`, `winner`. `winner` is
  a property of the game (already public on the end screen), not a per-player
  secret. `player_count` is a **COUNT**, never an enumeration — no other player's
  row (and therefore no other player's role) is ever selected or returned.
- **No other players' roles**: the query joins the caller's own `game_players` row
  only; other players' rows are touched solely by `count(*)`. Topic comes from
  `game_secrets` (normally unreadable by clients) but only for the caller's own
  **ended** games, where the word/category is already revealed.

`SECURITY DEFINER` is required because the read spans `game_secrets` (no client
RLS) and needs `payouts`/`games` for games the caller belongs to; the `auth.uid()`
filter inside each function is the authorization boundary. `execute` is revoked
from `public`/`anon` and granted to `authenticated` only.

## Verification
- Read-model proven against live data (minos: 3 games, 1 win, 0 imposter games,
  0.333334 XRP won; one game with a `sent` payout + tx surfaced, losses show no
  payout) — shape confirmed to carry no other players' roles.
- `tsc` clean; production build ok (`/profile` route built); 97 unit tests pass.
- Migration 0019 applied to the DB.

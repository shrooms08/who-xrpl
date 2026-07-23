# Row-Level Security (RLS) — WHO?

This document explains **every** RLS policy and access-control decision in
[`supabase/migrations/0001_initial_schema.sql`](../supabase/migrations/0001_initial_schema.sql).

## Principles

1. **Default deny.** RLS is `ENABLE`d **and** `FORCE`d on every table. A table
   with no matching policy grants **no** access to the `anon` or `authenticated`
   roles. Every allowance below is explicit.
2. **Two secrets never touch a client-readable table:**
   - **A player's role** (`crew` / `imposter`) — a client may read only its
     *own* `game_players` row. Other players' roles are never selectable.
   - **The secret word** — stored in its own `game_secrets` table that has **no
     policy at all** (and revoked grants). It is reachable only through a
     `SECURITY DEFINER` RPC or the service role.
3. **Server is authoritative.** All phase/timer/role transitions are written by
   server-side orchestration (Gate 2) using the **service-role key**, which has
   `BYPASSRLS`. The player-facing policies below therefore never obstruct the
   engine — they only constrain what a *browser client* can do.
4. **No recursion.** Membership tests used inside policies run through
   `SECURITY DEFINER` helper functions (`is_lobby_member`, `is_game_member`,
   `is_round_member`, `shares_lobby_with`) so a policy on `lobby_players` doesn't
   recursively evaluate `lobby_players`.

## Helper functions

| Function | Returns true when… |
|---|---|
| `is_lobby_member(lobby)` | the caller has a `lobby_players` row in that lobby |
| `is_game_member(game)` | the caller belongs to the lobby that owns that game |
| `is_round_member(round)` | the caller belongs to the game that owns that round |
| `shares_lobby_with(other)` | the caller and `other` share any lobby |

All are `security definer`, `stable`, and pinned to `set search_path = public`.

## Policy-by-policy

### `profiles`
| Policy | Cmd | Rule |
|---|---|---|
| `profiles_select_self_or_colobby` | SELECT | `id = auth.uid()` **or** `shares_lobby_with(id)` — you can read your own profile and the display names of anyone in a lobby with you. |
| `profiles_insert_self` | INSERT | `id = auth.uid()` — you can only create your own profile row. |
| `profiles_update_self` | UPDATE | `id = auth.uid()` (USING + WITH CHECK) — you can only edit yourself. |

No DELETE policy → profiles cannot be deleted by clients (cascades from
`auth.users` deletion only).

### `lobbies`
| Policy | Cmd | Rule |
|---|---|---|
| `lobbies_select_member` | SELECT | `is_lobby_member(id)` **or** `host_id = auth.uid()`. |
| `lobbies_insert_host` | INSERT | `host_id = auth.uid()` — you create lobbies as yourself. |
| `lobbies_update_host` | UPDATE | `host_id = auth.uid()` — only the host changes lobby state (status, start). |
| `lobbies_delete_host` | DELETE | `host_id = auth.uid()`. |

**Pre-join lookup:** a user joining by code is *not yet* a member, so they
cannot `SELECT` the lobby directly. Joining goes through a `join_lobby(code)`
RPC (Gate 1) that validates the code + capacity and inserts the membership row.

### `lobby_players`
| Policy | Cmd | Rule |
|---|---|---|
| `lobby_players_select_member` | SELECT | `is_lobby_member(lobby_id)` — members see the full roster. |
| `lobby_players_insert_self` | INSERT | `player_id = auth.uid()` — you may add only yourself. Capacity/code checks live in `join_lobby()`; this is the hard self-only floor. |
| `lobby_players_delete_self_or_host` | DELETE | `player_id = auth.uid()` (leave) **or** you are the lobby's host (kick). |

No UPDATE policy.

### `games`
| Policy | Cmd | Rule |
|---|---|---|
| `games_select_member` | SELECT | `is_lobby_member(lobby_id)` — members read game metadata. |

No INSERT/UPDATE/DELETE for clients → games are created and advanced only by the
server (service role). The secret word is **not** a column on this table.

### `game_secrets`  ⚠️ the secret word
**No policy exists.** With RLS enabled, no policy means every client role is
denied. Grants to `anon`/`authenticated` are additionally `REVOKE`d. The word is
readable only via `get_my_word()` (below) or the service role. This is the
concrete implementation of "do NOT expose the secret through a table the client
can select on."

### `game_players`  ⚠️ the role column
| Policy | Cmd | Rule |
|---|---|---|
| `game_players_select_self` | SELECT | `player_id = auth.uid()` — **own row only**. |

Because a client can select only its own row, it learns only its own role;
no other player's role is ever reachable through this table. There is **no**
client write policy — role assignment is server-only. The masked full roster
(who's alive, turn order, roles hidden) is served by `get_game_roster()`.

### `rounds`
| Policy | Cmd | Rule |
|---|---|---|
| `rounds_select_member` | SELECT | `is_game_member(game_id)`. |

No client writes — phase and timer transitions are server-authoritative.

### `clues`
| Policy | Cmd | Rule |
|---|---|---|
| `clues_select_member` | SELECT | `is_round_member(round_id)` — the clue feed is public to game members. |

No client INSERT: clues are written by the server **after** it validates turn
order, phase, and the no-secret-word rule. The client is never trusted for
timing.

### `chat_messages`
| Policy | Cmd | Rule |
|---|---|---|
| `chat_select_member` | SELECT | `is_lobby_member(lobby_id)` — members read all chat in their lobby. |
| `chat_insert_self` | INSERT | `player_id = auth.uid()` **and** `is_lobby_member(lobby_id)` — post as yourself in your lobby. |

Phase-specific muting (silence during clue phase, dead-player/spectator mute) is
tightened in Gate 2. This policy is the membership floor.

### `votes`
| Policy | Cmd | Rule |
|---|---|---|
| `votes_select_self` | SELECT | `voter_id = auth.uid()` — you can read only your **own** vote. |

Live tallies stay hidden (no member-wide SELECT); the ejection outcome is
delivered through the round reveal. No client INSERT — votes are written by the
server after it validates the vote phase.

### `ledger_events` (Gate 3; empty now)
| Policy | Cmd | Rule |
|---|---|---|
| `ledger_select_member` | SELECT | `player_id = auth.uid()` **or** `is_game_member(game_id)` — you see verified claims for yourself or your games. |

No client writes — events are written by the server after on-ledger
verification. The `/admin/ledger` listing reads via the service role.

## Client-facing RPCs (`SECURITY DEFINER`)

| RPC | Grant | Behaviour |
|---|---|---|
| `get_my_word(game)` | `authenticated` | Returns the secret word **iff** the caller is a `crew` member of that game; imposters and non-members get `NULL`. The only client path to the word. |
| `get_game_roster(game)` | `authenticated` | Full player list for a game member, with `role` **masked** — revealed only for the caller's own row, or after the game has ended. Raises if the caller isn't a game member. |

> Imposter-knows-imposter (imposters seeing each other on their role card at deal
> time) is intentionally **not** exposed by `get_game_roster`. It will be served
> by a dedicated, tightly-scoped Gate 2 RPC so this function leaks nothing extra.

## Realtime

Client-observed tables are added to the `supabase_realtime` publication.
Realtime enforces RLS, so `game_players` streams only the subscriber's own row
and `game_secrets` (not in the publication) is never broadcast.

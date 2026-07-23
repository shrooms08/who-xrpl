# Gate 2 — Game Loop · Report

**Status:** delivered, awaiting review. Supabase project `wzpvdverwrqipxuequaf`.
Built in three parts (engine → orchestration → UI), each committed separately.

---

## 1. What was built (file map)

```
lib/game/                       PURE ENGINE (deterministic, no I/O, no ledger)
  config.ts                     imposter scaling (1/2/3) + timers — single source
  types.ts  rng.ts              state types; seeded mulberry32 RNG + shuffle
  engine.ts                     deal→clue→discussion→vote→reveal→guess→loop|end
  wordBank.ts                   word-bank loader / deterministic pick
  orchestration.ts  (server)    load/persist/advance/startGame, server-time deadlines
  api-auth.ts        (server)   re-auth + membership guard for routes
  __tests__/                    engine.test.ts (42), transcript.test.ts, game.e2e.test.ts

lib/supabase/admin.ts (server)  service-role client behind `import "server-only"`

app/api/game/                   ROUTE HANDLERS (per-route auth + membership)
  start/route.ts                host-only start (host, ≥4, ≤max, atomic claim)
  [gameId]/clue|vote|guess|advance/route.ts

app/game/[gameId]/              GAME UI (ink system)
  page.tsx                      server: auth, opportunistic advance, load state
  GameRoom.tsx                  realtime, server-time countdown, phase routing, actions
  panels.tsx                    DealOverlay, RolePeek, TurnStrip, ClueFeed, ChatPanel,
                                VotePanel, RevealScreen (Splat + GUILTY), GuessPanel
                                (blinking cursor), EndScreen (+ play-again)
  types.ts

supabase/migrations/            0006 guess phase · 0007 orchestration (apply_game_state
                                CAS, get_my_role_card, send_chat, reap heartbeat fix) ·
                                0008 spectator roster reveal · 0009 roster bugfix
app/lobby/[id]/LobbyRoom.tsx     real Start (POST /api/game/start), heartbeat, →/game
```

## 2. Acceptance criteria

| Criterion | Status | Evidence / verification method |
|---|---|---|
| Full 4-player game completes end-to-end | ✅ (headless) + ⏳ 4-browser | **`test:e2e`** drives a full 4/1 game through the *real* server path (`startGame` → `loadGameState` → engine → `persist`/`apply_game_state` → `advanceIfDue`) against the live DB to a crew win. I can't run 4 browsers here, so the live cross-client UI run is your manual step — everything upstream (engine, orchestration, persistence, timers, realtime data) is machine-verified. |
| Engine test suite passes; transcript included | ✅ PROVEN | **42 unit tests** pass; `docs/gates/gate2-engine-transcript.txt` is a deterministic sample game. |
| Crew never receives another player's role / imposter list before game end | ✅ PROVEN | **Verification method (data layer):** `game_players.role` is RLS **own-row-only** (a client cannot select another player's row). The only paths to others' state are two RPCs, both verified: `get_my_role_card` (crew gets word+category, imposter gets category + fellow imposters but **no word**) and `get_game_roster` (a **living** caller sees `role=null` for everyone but themselves — masked=3/visible=1 in the harness; revealed only to dead spectators and at game end). The client calls only these two. |
| Timeout paths work | ✅ PROVEN | `test:e2e`: an overdue clue turn → `advanceIfDue` inserts `(no clue)` for the timed-out player and moves the turn on. (Discussion/vote/guess/reveal timeouts use the same `advanceIfDue` switch, exercised across the full-game drivers.) |
| **[added]** literal parallel advance = single transition | ✅ PROVEN | `test:e2e`: two `advanceIfDue` calls fired with `Promise.all` on one overdue phase → `games.version` increases by **exactly 1** (CAS + `SELECT … FOR UPDATE`; the loser gets `-1`). |
| **[added]** full 6-player / 2-imposter game | ✅ PROVEN | `test:e2e`: 6/2 game dealt (asserts 2 imposters, each with exactly one fellow — the data behind the fellow-imposter chip), driven to a crew win over **≥2 rounds** (exercises the loop + plurality vote math + two guess phases). |

All e2e tests create isolated users and **clean up** (verified: 0 stray lobbies/games/profiles/test-users afterward).

## 3. Decisions made that weren't specified (all flagged)

1. **`reveal` is a short timed display phase (6s)** then auto-concludes, so the ejection/guess result is visible before the round loops. Added `TIMERS.reveal`; the engine already modelled `reveal` as a distinct step.
2. **Chat is discussion-only + living-only** — enforced server-side in `send_chat` (dead/spectators muted, non-discussion phases rejected); the permissive direct-insert policy was dropped so clients can't bypass it.
3. **Role deal = full `RoleCard` (hold-to-peek) overlay** shown once per game (sessionStorage), then a compact "hold to peek" strip during play (re-check your role/word privately).
4. **Vote excludes self** (you can't vote yourself) + an explicit skip.
5. **Play-again = host flips the lobby to `waiting`** (RLS host-only); every player's game client observes it and returns to the lobby. The ended game row is retained.
6. **Timers are client-triggered, server-validated & server-timed**: the DB writes `phase_ends_at = now()+interval`; clients render the countdown from it (with a one-time skew correction), and on expiry POST `/advance` (idempotent). `advanceIfDue` advances one due step per contact — a fully-abandoned game pauses until the next contact rather than freezing permanently (inherent to serverless without an always-on ticker).
7. **`game_players.turn_order`** is repurposed to hold each player's index in the *current* round's order (keeps `get_game_roster` ordering meaningful).
8. **Spectators see all roles** — implemented by revealing roles in `get_game_roster` when the caller is dead (migration 0008), per the spec's Spectators rule.

## 4. Known issues / debt

- **Bug found & fixed during e2e:** `get_game_roster` referenced `alive` unqualified (ambiguous with the `RETURNS TABLE` column) — every roster call errored, which would have broken the game screen's roster load. Fixed in **migration 0009** (`gp.alive`); the role-leak harness now passes. Caught precisely because the acceptance run exercised the RPC.
- **4-browser UI acceptance is your manual step** — headless-verified upstream, but the live multi-client feel (turn handoff, realtime chat, reveal animation, live guess) wants real eyes.
- **Abandoned-game advance** is contact-driven (decision 6); a game with zero online players pauses until someone loads it. Acceptable for testnet; a Vercel Cron sweep could be added later.
- **Realtime refreshes by refetch** (roster/clues/chat re-query on change rather than applying payloads) — simple and correct; could be optimized.
- **Carry-forwards from earlier gates** all landed here: public category, imposter-knows-imposter (`get_my_role_card`), server-side start enforcement, reap griefing fix (heartbeat wired in the lobby).

## 5. Wait for approval

Gate 2 is code-complete, committed, and green on the automated acceptance run. The one human-in-the-loop item is a live 4-session playthrough (`npm run dev`, four logins, start a game, play to a win). Note the one-time email-template step from Gate 1 (`{{ .Token }}`) is still required for OTP login. I'll hold here before Gate 3 (XRPL testnet seat-claim).

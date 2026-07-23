# Gate 1 — Lobbies · Report

**Status:** delivered, awaiting review. Supabase project `wzpvdverwrqipxuequaf`.

---

## 1. What was built (file map)

```
lib/supabase/
  client.ts            Browser Supabase client (publishable key)
  server.ts            Server client bound to request cookies
  middleware.ts        updateSession() — refreshes auth on every request
middleware.ts          Next middleware (session refresh, matcher)
lib/database.types.ts  Generated DB types (from the live schema)
lib/lobby-errors.ts    Maps RPC error codes → friendly copy

app/login/             Email-OTP sign in (page.tsx server + LoginForm client)
app/onboarding/        Display-name capture (page.tsx server + OnboardingForm)
app/page.tsx           Home: auth+onboarding gate → HomeClient
app/HomeClient.tsx     Create lobby (max 4–10) · join by code · sign out
app/lobby/[id]/        Lobby room (page.tsx server + LobbyRoom client)
app/join/[code]/       Invite-link join → redirects into the lobby

supabase/migrations/
  0004_lobby_rpcs.sql              create/join/leave/reap RPCs + replica identity
  0005_fix_lobby_code_generator.sql  code gen via gen_random_uuid (pgcrypto-free)
.env.local             URL + publishable key (gitignored; service-role deferred)
```

## 2. Acceptance criteria

| Criterion | Status | Evidence / verification method |
|---|---|---|
| Two browsers can create/join a lobby and see each other in real time | ✅ implemented; ⏳ needs your 2-browser confirm | Realtime is wired: `LobbyRoom` subscribes to `postgres_changes` on `lobby_players` (filtered by `lobby_id`) + a presence channel; the server seeds the initial roster. Build + typecheck pass and the room compiles/boots. The **join** half is proven at the DB layer (harness below). The live cross-browser view inherently needs two real OTP logins — **your manual acceptance step**. |
| Start blocked at 3 players, enabled at 4 | ✅ implemented | `LobbyRoom` gates `canStart = isHost && members.length >= 4` (const `MIN_PLAYERS = 4`); button is `disabled` with a "need N more" hint below 4. Count comes from the authoritative `lobby_players` list. |
| 11th join attempt rejected | ✅ PROVEN | DB harness: filled a max-10 lobby then attempted an 11th join → raised `lobby_full`. `join_lobby` locks the lobby row `FOR UPDATE` before the capacity check to also stop concurrent over-fill. |

**DB harness (ran in a rolled-back transaction, nothing persisted)** exercised the
RPCs end-to-end and all 8 checks passed:

```
max=3 rejected .......................... PASS (max_players_out_of_range)
create_lobby → 1 member ................. PASS  (code EA8ZRJ)
fill to 10 .............................. PASS  (members=10)
11th join rejected ...................... PASS  (lobby_full)
idempotent + case-insensitive join ...... PASS  (members stayed 10)
host migration on leave ................. PASS  (new host = earliest remaining, members=9)
lobbies.host_id updated ................. PASS
unknown code rejected ................... PASS  (lobby_not_found)
```

**Other verification:** `tsc --noEmit` clean · `next build` compiles all 6 routes ·
route-gating checked over HTTP — unauthenticated `/`, `/onboarding`, `/lobby/[id]`,
`/join/[code]` all 307 → `/login` (the last two preserve `?next=…`); `/login` 200.
Security advisor: new RPCs are `anon=EXECUTE:false, authenticated:true`
(`gen_lobby_code` internal-only).

## 3. Decisions made that weren't specified (all flagged)

1. **Upgraded `@supabase/ssr` 0.5 → 0.7 and pinned `@supabase/supabase-js` `^2.110.8`.**
   The `^` ranges resolved supabase-js to 2.110.8, whose types moved out of the
   `dist/module/lib/types` path that ssr 0.5.2 imported — collapsing every typed
   query to `never`. 0.7 imports from the package root and is `__InternalSupabase`
   aware. Runtime was unaffected; this was a types fix.
2. **Realtime membership model.** `lobby_players` is the **authoritative** roster
   (drives the list + the start count) via `postgres_changes`; **presence** adds
   online dots and disconnect handling. Disconnect cleanup is presence-driven:
   the host prunes members who drop from presence; if the *host* drops, a
   deterministically-chosen remaining member calls `reap_and_migrate_host` after a
   2s grace. Explicit **Leave**/**Kick** fully update the DB. I did **not** rely on
   `beforeunload` (unreliable).
3. **Start button is a Gate-1 stub** — enablement (≥4) is the deliverable; clicking
   it shows a "Game start arrives in Gate 2" note. No game/deal is created.
4. **Kick = host direct `DELETE`** on `lobby_players` (allowed by RLS); self-leave
   and host-migration go through the `leave_lobby` RPC.
5. **`reap_and_migrate_host` trusts the caller** that the named host is absent
   (it can't see presence from SQL). A malicious member could reap a live host —
   acceptable for small testnet lobbies; see debt.
6. **OTP email template requires `{{ .Token }}`** to show the code (default
   template is link-only). Documented in the README as a one-time dashboard step.
7. **Publishable key** (`sb_publishable_…`) used for `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   The **service-role key is intentionally not stored** — Gate 1 needs none.
8. **`replica identity full` on `lobby_players`** so realtime DELETE events carry
   `lobby_id` for client-side filtering.
9. **Two migrations for the code generator** (0004 then 0005) rather than editing
   0004 in place, keeping migration history honest on the already-migrated project.

## 4. Known issues / debt

- **End-to-end 2-browser realtime + start-gating are not machine-verified** — they
  build, boot, and gate correctly, but confirming the live cross-client view needs
  two real OTP logins (your manual test). Everything upstream is proven.
- **Disconnect edge:** a hard crash of the *only* member (or host with no one left
  to reap) leaves a stale `lobby_players`/lobby row until someone rejoins/leaves.
- **`reap_and_migrate_host` griefing vector** (decision 5) — revisit with a
  presence-authenticated or heartbeat-based reaper if it matters.
- **Supabase built-in SMTP hourly limit** may throttle heavy login testing.
- **Gate-2 carry-forwards still open:** public `category` amendment and the
  mandatory imposter-knows-imposter RPC (unchanged, not touched here).

## 5. Wait for approval

Gate 1 is code-complete and committed. To fully close acceptance criterion #1,
please: (a) add `{{ .Token }}` to the Magic Link email template (README), then
(b) open two browsers, sign in with two emails, create a lobby in one and join by
code/link in the other, and confirm the live roster + start-gating + kick/leave.
I'll hold here for your go-ahead before Gate 2 (game loop).

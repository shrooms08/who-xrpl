-- ============================================================================
-- WHO? — Gate 0 initial schema
-- Social-deduction (imposter) game on Supabase Postgres.
--
-- Security model (see docs/RLS.md for the full narrative):
--   * RLS is ENABLED and FORCED on every table. Default is DENY — a table with
--     no matching policy grants no access to `anon` / `authenticated`.
--   * The two secret pieces of state — a player's ROLE and the secret WORD —
--     are never selectable from a client-facing table:
--       - `game_players.role` : a client may read only its OWN row.
--       - the secret word      : lives in `game_secrets`, which has NO policies
--                                 (fully denied) and is reachable only through a
--                                 SECURITY DEFINER RPC.
--   * Server-side orchestration (Gate 2) uses the service-role key, which has
--     BYPASSRLS, so these player-facing policies never block the engine.
-- ============================================================================

-- Supabase provides gen_random_uuid() via pgcrypto; ensure it's present.
create extension if not exists pgcrypto;

-- ─────────────────────────────── ENUMS ─────────────────────────────────────
create type public.lobby_status as enum ('waiting', 'in_game', 'ended');
create type public.game_status  as enum ('active', 'ended');
create type public.player_role  as enum ('crew', 'imposter');
create type public.round_phase  as enum ('deal', 'clue', 'discussion', 'vote', 'reveal', 'end');

-- ────────────────────────────── TABLES ─────────────────────────────────────

-- profiles: one row per authenticated user. `id` == auth.users.id.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- lobbies: a pre-game room. `code` is the 6-char shareable invite code.
create table public.lobbies (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  host_id     uuid not null references public.profiles (id) on delete cascade,
  max_players int  not null default 10 check (max_players between 4 and 10),
  status      public.lobby_status not null default 'waiting',
  created_at  timestamptz not null default now()
);

-- lobby_players: membership of a lobby (the join table that drives RLS).
create table public.lobby_players (
  id        uuid primary key default gen_random_uuid(),
  lobby_id  uuid not null references public.lobbies (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (lobby_id, player_id)
);

-- games: one active/ended game per lobby run. NO secret state lives here.
create table public.games (
  id            uuid primary key default gen_random_uuid(),
  lobby_id      uuid not null references public.lobbies (id) on delete cascade,
  status        public.game_status not null default 'active',
  current_round int not null default 0,
  created_at    timestamptz not null default now(),
  ended_at      timestamptz
);

-- game_secrets: the secret word, isolated in its own table with NO RLS policy.
-- Clients can never select this; only get_my_word() (SECURITY DEFINER) and the
-- service role reach it. Split out precisely so the word is not a column on any
-- table a client can read.
create table public.game_secrets (
  game_id  uuid primary key references public.games (id) on delete cascade,
  word     text not null,
  category text not null
);

-- game_players: per-game role/alive/turn_order. `role` is sensitive (see RLS).
create table public.game_players (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  role       public.player_role not null,
  alive      boolean not null default true,
  turn_order int not null,
  created_at timestamptz not null default now(),
  unique (game_id, player_id)
);

-- rounds: one row per clue→discussion→vote→reveal cycle within a game.
create table public.rounds (
  id                     uuid primary key default gen_random_uuid(),
  game_id                uuid not null references public.games (id) on delete cascade,
  round_number           int not null,
  phase                  public.round_phase not null default 'deal',
  phase_ends_at          timestamptz,
  current_turn_player_id uuid references public.profiles (id),
  created_at             timestamptz not null default now(),
  unique (game_id, round_number)
);

-- clues: exactly one clue per player per round (<= 60 chars, engine-validated).
create table public.clues (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references public.rounds (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  text       text not null check (char_length(text) <= 60),
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

-- chat_messages: lobby chat and in-game discussion. game_id null = lobby chat.
create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  lobby_id   uuid not null references public.lobbies (id) on delete cascade,
  game_id    uuid references public.games (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

-- votes: one vote per player per round. target_id null = an explicit skip.
create table public.votes (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references public.rounds (id) on delete cascade,
  voter_id   uuid not null references public.profiles (id) on delete cascade,
  target_id  uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, voter_id)
);

-- ledger_events: verified XRPL seat claims (populated in Gate 3). Empty now.
create table public.ledger_events (
  id               uuid primary key default gen_random_uuid(),
  game_id          uuid references public.games (id) on delete set null,
  player_id        uuid references public.profiles (id) on delete set null,
  event_type       text not null,             -- e.g. 'seat_claim'
  tx_hash          text unique,
  delivered_amount text,                       -- drops, from meta.delivered_amount
  memo             text,
  verified         boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ───────────────────────────── INDEXES ─────────────────────────────────────
create index idx_lobby_players_lobby   on public.lobby_players (lobby_id);
create index idx_lobby_players_player  on public.lobby_players (player_id);
create index idx_games_lobby           on public.games (lobby_id);
create index idx_game_players_game     on public.game_players (game_id);
create index idx_game_players_player   on public.game_players (player_id);
create index idx_rounds_game           on public.rounds (game_id);
create index idx_clues_round           on public.clues (round_id);
create index idx_chat_lobby            on public.chat_messages (lobby_id);
create index idx_chat_game             on public.chat_messages (game_id);
create index idx_votes_round           on public.votes (round_id);
create index idx_ledger_game           on public.ledger_events (game_id);

-- ─────────────────── SECURITY-DEFINER HELPER FUNCTIONS ──────────────────────
-- These break RLS recursion: a policy on lobby_players cannot itself SELECT
-- lobby_players without recursing, so membership checks run as the definer.

create or replace function public.is_lobby_member(p_lobby uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.lobby_players
    where lobby_id = p_lobby and player_id = auth.uid()
  );
$$;

create or replace function public.is_game_member(p_game uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.games g
    join public.lobby_players lp on lp.lobby_id = g.lobby_id
    where g.id = p_game and lp.player_id = auth.uid()
  );
$$;

create or replace function public.is_round_member(p_round uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.rounds r
    join public.games g on g.id = r.game_id
    join public.lobby_players lp on lp.lobby_id = g.lobby_id
    where r.id = p_round and lp.player_id = auth.uid()
  );
$$;

create or replace function public.shares_lobby_with(p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.lobby_players a
    join public.lobby_players b on a.lobby_id = b.lobby_id
    where a.player_id = auth.uid() and b.player_id = p_other
  );
$$;

-- ─────────────────── ENABLE + FORCE RLS ON EVERY TABLE ──────────────────────
alter table public.profiles       enable row level security;
alter table public.lobbies        enable row level security;
alter table public.lobby_players  enable row level security;
alter table public.games          enable row level security;
alter table public.game_secrets   enable row level security;
alter table public.game_players   enable row level security;
alter table public.rounds         enable row level security;
alter table public.clues          enable row level security;
alter table public.chat_messages  enable row level security;
alter table public.votes          enable row level security;
alter table public.ledger_events  enable row level security;

alter table public.profiles       force row level security;
alter table public.lobbies        force row level security;
alter table public.lobby_players  force row level security;
alter table public.games          force row level security;
alter table public.game_secrets   force row level security;
alter table public.game_players   force row level security;
alter table public.rounds         force row level security;
alter table public.clues          force row level security;
alter table public.chat_messages  force row level security;
alter table public.votes          force row level security;
alter table public.ledger_events  force row level security;

-- Defense in depth: even if Supabase default privileges granted table access to
-- the client roles, revoke it on the secret-word table outright.
revoke all on public.game_secrets from anon, authenticated;

-- ─────────────────────────────── POLICIES ──────────────────────────────────
-- Naming: <table>_<action>_<subject>. Absence of a policy = deny.

-- profiles ------------------------------------------------------------------
create policy profiles_select_self_or_colobby on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_lobby_with(id));

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- lobbies -------------------------------------------------------------------
-- Members and the host can read the lobby. Pre-join lookup by CODE happens
-- through the join_lobby() RPC (Gate 1), not a direct select.
create policy lobbies_select_member on public.lobbies
  for select to authenticated
  using (public.is_lobby_member(id) or host_id = auth.uid());

create policy lobbies_insert_host on public.lobbies
  for insert to authenticated
  with check (host_id = auth.uid());

create policy lobbies_update_host on public.lobbies
  for update to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy lobbies_delete_host on public.lobbies
  for delete to authenticated
  using (host_id = auth.uid());

-- lobby_players -------------------------------------------------------------
create policy lobby_players_select_member on public.lobby_players
  for select to authenticated
  using (public.is_lobby_member(lobby_id));

-- A user may add only themselves. Capacity / code validation is done by the
-- join_lobby() RPC in Gate 1; this policy is the hard floor (self-only).
create policy lobby_players_insert_self on public.lobby_players
  for insert to authenticated
  with check (player_id = auth.uid());

-- Leave (self) or be kicked by the host.
create policy lobby_players_delete_self_or_host on public.lobby_players
  for delete to authenticated
  using (
    player_id = auth.uid()
    or exists (
      select 1 from public.lobbies l
      where l.id = lobby_id and l.host_id = auth.uid()
    )
  );

-- games ---------------------------------------------------------------------
-- Read-only for lobby members. The secret word is NOT a column here.
-- Rows are created/updated by the server (service role), never the client.
create policy games_select_member on public.games
  for select to authenticated
  using (public.is_lobby_member(lobby_id));

-- game_secrets --------------------------------------------------------------
-- Intentionally NO policy. RLS enabled + no policy + revoked grants = fully
-- denied to every client role. Reachable only via get_my_word() / service role.

-- game_players --------------------------------------------------------------
-- A client may read ONLY its own row (so it learns its own role). It can never
-- select another player's row, so roles never leak through this table. The
-- masked full roster is served by get_game_roster().
create policy game_players_select_self on public.game_players
  for select to authenticated
  using (player_id = auth.uid());
-- No client writes: role assignment is server-only (service role).

-- rounds --------------------------------------------------------------------
-- Read-only for game members. Phase/timer transitions are server-only.
create policy rounds_select_member on public.rounds
  for select to authenticated
  using (public.is_game_member(game_id));

-- clues ---------------------------------------------------------------------
-- The clue feed is public to game members once submitted. Inserts are made by
-- the server after validating turn/phase/word (never trust the client for
-- timing), so there is deliberately no client INSERT policy.
create policy clues_select_member on public.clues
  for select to authenticated
  using (public.is_round_member(round_id));

-- chat_messages -------------------------------------------------------------
-- Members read all chat in their lobby. Members may post as themselves; the
-- phase/mute rules (clue-phase silence, dead-player mute) are tightened in
-- Gate 2 — this policy is the membership floor.
create policy chat_select_member on public.chat_messages
  for select to authenticated
  using (public.is_lobby_member(lobby_id));

create policy chat_insert_self on public.chat_messages
  for insert to authenticated
  with check (player_id = auth.uid() and public.is_lobby_member(lobby_id));

-- votes ---------------------------------------------------------------------
-- A voter may read only their OWN vote (live tallies stay hidden; the ejection
-- result is delivered via the round reveal). Inserts are server-only after the
-- server validates the vote phase.
create policy votes_select_self on public.votes
  for select to authenticated
  using (voter_id = auth.uid());

-- ledger_events -------------------------------------------------------------
-- Players see verified claims for their own games / themselves. The admin
-- listing (Gate 3) reads via the service role.
create policy ledger_select_member on public.ledger_events
  for select to authenticated
  using (
    player_id = auth.uid()
    or (game_id is not null and public.is_game_member(game_id))
  );

-- ────────────────── CLIENT-FACING SECURITY-DEFINER RPCs ─────────────────────

-- get_my_word: returns the secret word to the caller ONLY if the caller is a
-- CREW member of the game. Imposters and non-members receive NULL. This is the
-- only client path to the word.
create or replace function public.get_my_word(p_game uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select s.word
  from public.game_secrets s
  join public.game_players gp on gp.game_id = s.game_id
  where s.game_id = p_game
    and gp.player_id = auth.uid()
    and gp.role = 'crew';
$$;

-- get_game_roster: the full player list for a game member, with `role` masked.
-- role is revealed ONLY for the caller's own row, or once the game has ended.
-- (Imposter-knows-imposter at deal time is a separate Gate 2 RPC by design —
-- this function deliberately leaks nothing extra.)
create or replace function public.get_game_roster(p_game uuid)
returns table (
  player_id    uuid,
  display_name text,
  alive        boolean,
  turn_order   int,
  role         public.player_role
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_game_member(p_game) then
    raise exception 'not a member of this game';
  end if;

  return query
    select gp.player_id,
           p.display_name,
           gp.alive,
           gp.turn_order,
           case
             when gp.player_id = auth.uid() then gp.role
             when exists (
               select 1 from public.games g
               where g.id = p_game and g.status = 'ended'
             ) then gp.role
             else null
           end as role
    from public.game_players gp
    join public.profiles p on p.id = gp.player_id
    where gp.game_id = p_game
    order by gp.turn_order;
end;
$$;

grant execute on function public.get_my_word(uuid)     to authenticated;
grant execute on function public.get_game_roster(uuid) to authenticated;

-- ───────────────────────────── REALTIME ────────────────────────────────────
-- Add client-observed tables to the realtime publication. Realtime enforces
-- RLS, so game_players streams only the subscriber's own row and game_secrets
-- is never published.
alter publication supabase_realtime add table public.lobbies;
alter publication supabase_realtime add table public.lobby_players;
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_players;
alter publication supabase_realtime add table public.rounds;
alter publication supabase_realtime add table public.clues;
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.ledger_events;

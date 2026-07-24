-- ============================================================================
-- WHO? — Gate 3: XRPL testnet seat-claim schema.
--   * profiles.xrpl_address   — linked Xaman wallet (nullable; set on link)
--   * lobbies.mode            — casual (default) vs on-chain (seat claim gated)
--   * ledger_events.lobby_id  — seat claims are pre-game, so keyed to the lobby
-- ============================================================================

create type public.lobby_mode as enum ('casual', 'onchain');

alter table public.profiles add column if not exists xrpl_address text;

alter table public.lobbies
  add column if not exists mode public.lobby_mode not null default 'casual';

alter table public.ledger_events
  add column if not exists lobby_id uuid references public.lobbies (id) on delete cascade;

create index if not exists idx_ledger_lobby_player
  on public.ledger_events (lobby_id, player_id);

-- Members may also read seat-claim events for their lobby (game_id is null
-- pre-game). Replace the ledger select policy to cover lobby membership.
drop policy if exists ledger_select_member on public.ledger_events;
create policy ledger_select_member on public.ledger_events
  for select to authenticated
  using (
    player_id = auth.uid()
    or (game_id is not null and public.is_game_member(game_id))
    or (lobby_id is not null and public.is_lobby_member(lobby_id))
  );

-- has_verified_seat_claim: does a player hold a verified seat claim for a lobby?
-- Used by the server to gate the start of an on-chain lobby. SECURITY DEFINER so
-- a member can check any starting player's status (no sensitive data exposed).
create or replace function public.has_verified_seat_claim(p_lobby uuid, p_player uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.ledger_events
    where lobby_id = p_lobby
      and player_id = p_player
      and event_type = 'seat_claim'
      and verified = true
  );
$$;

revoke execute on function public.has_verified_seat_claim(uuid, uuid) from public, anon;
grant  execute on function public.has_verified_seat_claim(uuid, uuid) to authenticated, service_role;

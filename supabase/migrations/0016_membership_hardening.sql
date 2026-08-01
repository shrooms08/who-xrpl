-- ============================================================================
-- WHO? — Gate 6: membership hardening (playtest launch-blocker).
--
-- Root cause of tonight's mobile ejections: presence loss led to lobby_players
-- rows being deleted, and is_game_member keyed off lobby_players — so a deleted
-- row 403'd every in-game call and RLS-filtered every refetch to empty.
--
-- Fixes here:
--   1. is_game_member keys off game_players — a player dealt into a game is a
--      game member until game end, regardless of live lobby membership.
--   2. reap_and_migrate_host requires prolonged staleness (60s), migrates the
--      HOST ROLE ONLY (never deletes the stale host's membership), respects a
--      claim/link grace window, and picks a successor other than the absent host.
--   3. grace_until + set_claim_grace: an open wallet-link/seat-claim payload marks
--      the player non-stale for 5 minutes (the flow requires leaving the browser).
-- ============================================================================

-- 1) Game membership is defined by the deal, not by live lobby presence. -------
create or replace function public.is_game_member(p_game uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game and gp.player_id = auth.uid()
  );
$$;

revoke execute on function public.is_game_member(uuid) from public, anon;
grant  execute on function public.is_game_member(uuid) to authenticated, service_role;

-- 2) Claim/link grace window. -------------------------------------------------
alter table public.lobby_players add column if not exists grace_until timestamptz;

create or replace function public.set_claim_grace(p_lobby uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.lobby_players
    set grace_until = now() + interval '5 minutes'
    where lobby_id = p_lobby and player_id = auth.uid();
$$;

revoke execute on function public.set_claim_grace(uuid) from public, anon;
grant  execute on function public.set_claim_grace(uuid) to authenticated, service_role;

-- 3) Non-destructive host migration on PROLONGED host absence. -----------------
create or replace function public.reap_and_migrate_host(p_lobby uuid, p_absent_host uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_host  uuid;
  v_new   uuid;
  v_seen  timestamptz;
  v_grace timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.lobby_players where lobby_id = p_lobby and player_id = v_uid
  ) then
    raise exception 'not_a_member';
  end if;

  select host_id into v_host from public.lobbies where id = p_lobby for update;
  if v_host is null then return null; end if;
  if v_host <> p_absent_host then return v_host; end if; -- host already changed

  select last_seen, grace_until into v_seen, v_grace
    from public.lobby_players
    where lobby_id = p_lobby and player_id = p_absent_host;

  -- Only migrate after PROLONGED staleness (60s), and never during a claim grace.
  if v_seen  is not null and v_seen  > now() - interval '60 seconds' then return v_host; end if;
  if v_grace is not null and v_grace > now() then return v_host; end if;

  -- Migrate the ROLE to the earliest-joined OTHER member. The stale host keeps
  -- its membership row — presence loss must never remove anyone.
  select player_id into v_new
    from public.lobby_players
    where lobby_id = p_lobby and player_id <> p_absent_host
    order by joined_at asc
    limit 1;
  if v_new is null then return v_host; end if; -- nobody else present; leave as-is

  update public.lobbies set host_id = v_new where id = p_lobby;
  return v_new;
end;
$$;

revoke execute on function public.reap_and_migrate_host(uuid, uuid) from public, anon;
grant  execute on function public.reap_and_migrate_host(uuid, uuid) to authenticated, service_role;

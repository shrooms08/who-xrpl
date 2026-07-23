-- ============================================================================
-- WHO? — Gate 1: lobby lifecycle RPCs
--
-- All lobby mutations that need validation or elevated reach go through these
-- SECURITY DEFINER functions (owned by a superuser, so they bypass RLS while
-- still reading auth.uid() from the caller's JWT):
--   * create_lobby  — generate a unique code, insert lobby + host membership
--   * join_lobby    — code lookup + capacity/status checks (the 11th-join guard)
--   * leave_lobby   — self-remove + host migration + empty-lobby cleanup
--   * reap_and_migrate_host — fallback host migration when a host disconnects
--                             without a clean leave (best-effort, member-driven)
--
-- Simple self-leave and host-kick are also expressible as plain DELETEs under
-- the lobby_players RLS policy; host-migration cases must use leave_lobby.
-- ============================================================================

-- Unambiguous 6-char code alphabet (no I/L/O/0/1). Internal helper only.
create or replace function public.gen_lobby_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result   text := '';
  b        bytea := gen_random_bytes(6);
  i        int;
begin
  for i in 0..5 loop
    result := result || substr(alphabet, (get_byte(b, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

-- create_lobby: returns the new lobby's id + code.
create or replace function public.create_lobby(p_max_players int)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  v_id   uuid;
  v_try  int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_max_players < 4 or p_max_players > 10 then
    raise exception 'max_players_out_of_range';
  end if;

  loop
    v_try := v_try + 1;
    v_code := public.gen_lobby_code();
    exit when not exists (select 1 from public.lobbies l where l.code = v_code);
    if v_try > 25 then
      raise exception 'code_generation_failed';
    end if;
  end loop;

  insert into public.lobbies (code, host_id, max_players)
    values (v_code, v_uid, p_max_players)
    returning lobbies.id into v_id;

  insert into public.lobby_players (lobby_id, player_id)
    values (v_id, v_uid);

  return query select v_id, v_code;
end;
$$;

-- join_lobby: idempotent join by code. Raises a typed message on failure.
-- Locks the lobby row (FOR UPDATE) so concurrent joins can't both slip past the
-- capacity check — this is the hard guard behind the "11th join rejected" rule.
create or replace function public.join_lobby(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_lobby public.lobbies%rowtype;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_lobby
    from public.lobbies
    where code = upper(trim(p_code))
    for update;

  if not found then
    raise exception 'lobby_not_found';
  end if;
  if v_lobby.status <> 'waiting' then
    raise exception 'lobby_not_joinable';
  end if;

  -- Already in? Idempotent success.
  if exists (
    select 1 from public.lobby_players
    where lobby_id = v_lobby.id and player_id = v_uid
  ) then
    return v_lobby.id;
  end if;

  select count(*) into v_count
    from public.lobby_players
    where lobby_id = v_lobby.id;

  if v_count >= v_lobby.max_players then
    raise exception 'lobby_full';
  end if;

  insert into public.lobby_players (lobby_id, player_id)
    values (v_lobby.id, v_uid);

  return v_lobby.id;
end;
$$;

-- leave_lobby: remove the caller. If the caller was the host, migrate host to
-- the earliest-joined remaining member; if the lobby is now empty, delete it.
-- Returns the (possibly new) host id, or null if the lobby was removed.
create or replace function public.leave_lobby(p_lobby uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_host uuid;
  v_new  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select host_id into v_host from public.lobbies where id = p_lobby for update;
  if v_host is null then
    return null; -- lobby already gone
  end if;

  delete from public.lobby_players
    where lobby_id = p_lobby and player_id = v_uid;

  if v_host <> v_uid then
    return v_host; -- a non-host left; host unchanged
  end if;

  -- Host left: migrate.
  select player_id into v_new
    from public.lobby_players
    where lobby_id = p_lobby
    order by joined_at asc
    limit 1;

  if v_new is null then
    delete from public.lobbies where id = p_lobby;
    return null;
  end if;

  update public.lobbies set host_id = v_new where id = p_lobby;
  return v_new;
end;
$$;

-- reap_and_migrate_host: member-driven fallback for a host that vanished from
-- presence without calling leave_lobby (e.g. a hard crash). Any current member
-- may remove the named absent host and trigger migration. Best-effort — trusts
-- the caller's claim that p_absent_host is gone (see Gate 1 report / debt).
create or replace function public.reap_and_migrate_host(p_lobby uuid, p_absent_host uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_host uuid;
  v_new  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from public.lobby_players
    where lobby_id = p_lobby and player_id = v_uid
  ) then
    raise exception 'not_a_member';
  end if;

  select host_id into v_host from public.lobbies where id = p_lobby for update;
  if v_host is null then
    return null;
  end if;
  if v_host <> p_absent_host then
    return v_host; -- host already changed; nothing to do
  end if;

  delete from public.lobby_players
    where lobby_id = p_lobby and player_id = p_absent_host;

  select player_id into v_new
    from public.lobby_players
    where lobby_id = p_lobby
    order by joined_at asc
    limit 1;

  if v_new is null then
    delete from public.lobbies where id = p_lobby;
    return null;
  end if;

  update public.lobbies set host_id = v_new where id = p_lobby;
  return v_new;
end;
$$;

-- Realtime: include full OLD row on DELETE so clients can filter lobby_players
-- delete events by lobby_id (default replica identity ships only the PK).
alter table public.lobby_players replica identity full;

-- ── Grants (mirror the 0002/0003 hardening: authenticated + service_role only)
revoke execute on function public.gen_lobby_code()                     from public;
revoke execute on function public.create_lobby(int)                    from public;
revoke execute on function public.join_lobby(text)                     from public;
revoke execute on function public.leave_lobby(uuid)                    from public;
revoke execute on function public.reap_and_migrate_host(uuid, uuid)    from public;

-- gen_lobby_code is internal only (called by create_lobby as definer/owner).
revoke execute on function public.gen_lobby_code() from anon, authenticated;
grant  execute on function public.gen_lobby_code() to service_role;

grant execute on function public.create_lobby(int)                 to authenticated, service_role;
grant execute on function public.join_lobby(text)                  to authenticated, service_role;
grant execute on function public.leave_lobby(uuid)                 to authenticated, service_role;
grant execute on function public.reap_and_migrate_host(uuid, uuid) to authenticated, service_role;

revoke execute on function public.create_lobby(int)                 from anon;
revoke execute on function public.join_lobby(text)                  from anon;
revoke execute on function public.leave_lobby(uuid)                 from anon;
revoke execute on function public.reap_and_migrate_host(uuid, uuid) from anon;

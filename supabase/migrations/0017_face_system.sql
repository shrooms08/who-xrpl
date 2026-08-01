-- ============================================================================
-- WHO? — Gate P2: face system.
--   * profiles.face  jsonb — the player's chosen/assigned face spec.
--   * game_players.face jsonb — the face SNAPSHOT taken at deal (identity is
--     stable during a game; mid-game edits don't change the running game).
--   * every new profile gets a random face (trigger); existing rows backfilled.
--   * get_game_roster returns the snapshot face.
-- ============================================================================

alter table public.profiles      add column if not exists face jsonb;
alter table public.game_players  add column if not exists face jsonb;

-- A random, always-valid face spec (ids mirror components/faces/spec.ts).
create or replace function public.random_face()
returns jsonb
language sql
volatile
set search_path = public
as $$
  select jsonb_build_object(
    'eyes',  'eyes-'  || to_char(1 + floor(random() * 10)::int, 'FM00'),
    'mouth', 'mouth-' || to_char(1 + floor(random() * 10)::int, 'FM00'),
    'mark',  'mark-'  || to_char(    floor(random() * 9)::int,  'FM00'),
    'color', (array['paper','butter','peach','blush','lilac','sky','mint','sand','clay'])
               [1 + floor(random() * 9)::int]
  );
$$;

-- New profiles get a random face if none was supplied (covers onboarding).
create or replace function public.profiles_default_face()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.face is null then new.face := public.random_face(); end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_default_face on public.profiles;
create trigger trg_profiles_default_face
  before insert on public.profiles
  for each row execute function public.profiles_default_face();

-- Backfill: give every existing faceless profile a random face.
update public.profiles set face = public.random_face() where face is null;

-- Snapshot the current profile faces into a game's players (called once at deal).
create or replace function public.snapshot_game_faces(p_game uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.game_players gp
    set face = p.face
    from public.profiles p
    where gp.game_id = p_game and gp.player_id = p.id and gp.face is null;
$$;

revoke execute on function public.snapshot_game_faces(uuid) from public, anon, authenticated;
grant  execute on function public.snapshot_game_faces(uuid) to service_role;

-- get_game_roster now also returns the snapshot face. RETURNS TABLE shape
-- changes, so drop + recreate.
drop function if exists public.get_game_roster(uuid);
create function public.get_game_roster(p_game uuid)
returns table (
  player_id    uuid,
  display_name text,
  face         jsonb,
  alive        boolean,
  turn_order   int,
  role         public.player_role
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_caller_alive boolean;
  v_ended boolean;
begin
  if not public.is_game_member(p_game) then
    raise exception 'not a member of this game';
  end if;

  select gp.alive into v_caller_alive
    from public.game_players gp
    where gp.game_id = p_game and gp.player_id = auth.uid();
  select (g.status = 'ended') into v_ended from public.games g where g.id = p_game;

  return query
    select gp.player_id,
           p.display_name,
           gp.face,
           gp.alive,
           gp.turn_order,
           case
             when gp.player_id = auth.uid() then gp.role
             when v_caller_alive is not true then gp.role
             when v_ended then gp.role
             else null
           end as role
    from public.game_players gp
    join public.profiles p on p.id = gp.player_id
    where gp.game_id = p_game
    order by gp.turn_order;
end;
$$;

revoke execute on function public.get_game_roster(uuid) from public, anon;
grant  execute on function public.get_game_roster(uuid) to authenticated, service_role;

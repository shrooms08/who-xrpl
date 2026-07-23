-- ============================================================================
-- WHO? — Gate 2 fix: get_game_roster referenced `alive` unqualified, which is
-- ambiguous between the RETURNS TABLE output column `alive` and
-- game_players.alive → every call errored ("column reference alive is
-- ambiguous"). Qualify the source column as gp.alive.
-- ============================================================================
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

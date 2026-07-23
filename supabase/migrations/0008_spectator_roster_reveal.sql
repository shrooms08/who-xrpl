-- ============================================================================
-- WHO? — Gate 2: ejected players are spectators and are shown ALL roles
-- (spec §Spectators). get_game_roster now reveals role when the caller is dead,
-- in addition to own-row and game-ended. Living players still see only their
-- own role.
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

  select alive into v_caller_alive
    from public.game_players where game_id = p_game and player_id = auth.uid();
  select (status = 'ended') into v_ended from public.games where id = p_game;

  return query
    select gp.player_id,
           p.display_name,
           gp.alive,
           gp.turn_order,
           case
             when gp.player_id = auth.uid() then gp.role         -- own role
             when v_caller_alive is not true then gp.role        -- dead spectator sees all
             when v_ended then gp.role                           -- everyone at game end
             else null
           end as role
    from public.game_players gp
    join public.profiles p on p.id = gp.player_id
    where gp.game_id = p_game
    order by gp.turn_order;
end;
$$;

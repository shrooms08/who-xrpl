-- ============================================================================
-- WHO? — Gate 2 follow-up (playtest): the vote panel needs a live "X/Y voted"
-- counter. Expose only COUNTS (how many living players have voted, and how many
-- are living) — never targets — so live tallies stay hidden (votes_select_self).
-- ============================================================================
create or replace function public.get_vote_progress(p_game uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_round  uuid;
  v_voted  int;
  v_living int;
begin
  if not public.is_game_member(p_game) then raise exception 'not_a_member'; end if;
  select id into v_round from public.rounds
    where game_id = p_game order by round_number desc limit 1;
  select count(*) into v_voted from public.votes where round_id = v_round;
  select count(*) into v_living from public.game_players
    where game_id = p_game and alive;
  return jsonb_build_object('voted', coalesce(v_voted, 0), 'living', coalesce(v_living, 0));
end;
$$;

revoke execute on function public.get_vote_progress(uuid) from public, anon;
grant  execute on function public.get_vote_progress(uuid) to authenticated, service_role;

-- ============================================================================
-- WHO? — P1 addendum: match history + career counters for /profile.
--
-- Both are SECURITY DEFINER read-models filtered to auth.uid(): the caller sees
-- ONLY their own participation (their role, their payout) plus game-level facts
-- (date, topic, player count, winner). No other player's role is ever returned —
-- player_count is a COUNT, not a role enumeration. No denormalized counters:
-- the career stats are computed live from game_players / games / payouts.
-- Topic = the drawn word's category (game_secrets), readable here because the
-- definer bypasses RLS and the game has ended.
-- ============================================================================

create or replace function public.get_match_history(
  p_limit  int default 20,
  p_offset int default 0
)
returns table (
  game_id      uuid,
  ended_at     timestamptz,
  topic        text,
  player_count int,
  my_role      public.player_role,
  winner       public.player_role,
  won          boolean,
  payout_drops bigint,
  payout_tx    text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    g.id,
    g.ended_at,
    gs.category,
    (select count(*)::int from public.game_players gp2 where gp2.game_id = g.id),
    gp.role,
    g.winner,
    (gp.role = g.winner),
    po.amount_drops,
    po.tx_hash
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  left join public.game_secrets gs on gs.game_id = g.id
  left join public.payouts po
    on po.game_id = g.id and po.player_id = auth.uid() and po.status = 'sent'
  where gp.player_id = auth.uid() and g.status = 'ended'
  order by g.ended_at desc nulls last
  limit  greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

revoke execute on function public.get_match_history(int, int) from public, anon;
grant  execute on function public.get_match_history(int, int) to authenticated, service_role;

create or replace function public.get_career_stats()
returns table (
  games         int,
  wins          int,
  imposter_games int,
  imposter_wins  int,
  earned_drops   bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    (count(*) filter (where g.status = 'ended'))::int,
    (count(*) filter (where g.status = 'ended' and gp.role = g.winner))::int,
    (count(*) filter (where g.status = 'ended' and gp.role = 'imposter'))::int,
    (count(*) filter (where g.status = 'ended' and gp.role = 'imposter'
                        and g.winner = 'imposter'))::int,
    coalesce((
      select sum(po.amount_drops) from public.payouts po
      where po.player_id = auth.uid() and po.status = 'sent'
    ), 0)::bigint
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  where gp.player_id = auth.uid();
$$;

revoke execute on function public.get_career_stats() from public, anon;
grant  execute on function public.get_career_stats() to authenticated, service_role;

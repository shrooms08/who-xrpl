-- ============================================================================
-- WHO? — Gate 5 Part 2: wallet disconnect drops the seat claim.
--
-- Disconnecting a wallet must drop the player's seat claim (they re-claim) WITHOUT
-- destroying the on-chain payment record. We do this additively: a 'seat_unclaim'
-- tombstone row. A verified 'seat_claim' counts ONLY if no 'seat_unclaim' for the
-- same lobby+player is at-or-after it. Existing seat_claim rows are never modified.
-- ============================================================================

create or replace function public.has_verified_seat_claim(p_lobby uuid, p_player uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.ledger_events c
    where c.lobby_id = p_lobby
      and c.player_id = p_player
      and c.event_type = 'seat_claim'
      and c.verified = true
      and not exists (
        select 1 from public.ledger_events u
        where u.lobby_id = p_lobby
          and u.player_id = p_player
          and u.event_type = 'seat_unclaim'
          and u.created_at >= c.created_at
      )
  );
$$;

revoke execute on function public.has_verified_seat_claim(uuid, uuid) from public, anon;
grant  execute on function public.has_verified_seat_claim(uuid, uuid) to authenticated, service_role;

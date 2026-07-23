-- ============================================================================
-- WHO? — Gate 0 follow-up: harden SECURITY DEFINER function grants
--
-- On creation, Postgres grants EXECUTE on functions to PUBLIC, which makes all
-- of our SECURITY DEFINER functions callable by the `anon` (unauthenticated)
-- role via /rest/v1/rpc. Nothing leaks today — every function keys off
-- auth.uid(), which is NULL for anon, so helpers return false and the RPCs
-- return null / raise — but exposing them to anon violates least privilege and
-- trips the Supabase security advisor (lint 0028).
--
-- Verified empirically: an `authenticated` caller MUST retain EXECUTE for the
-- RLS policies that call these helpers to evaluate (revoking it yields
-- "permission denied for function ..."). So we drop the PUBLIC grant and keep
-- EXECUTE for `authenticated` (policies + the two client RPCs) and
-- `service_role` (server orchestration).
--
-- NOTE: Supabase's default privileges also grant EXECUTE to `anon` DIRECTLY
-- (not via PUBLIC), so revoking PUBLIC here does not remove anon access — that
-- direct anon grant is revoked in 0003. (Kept as two migrations because 0002
-- was already applied to the live project before the direct-anon grant was
-- discovered; both are idempotent on a fresh apply.)
-- ============================================================================

revoke execute on function public.is_lobby_member(uuid)   from public;
revoke execute on function public.is_game_member(uuid)    from public;
revoke execute on function public.is_round_member(uuid)   from public;
revoke execute on function public.shares_lobby_with(uuid) from public;
revoke execute on function public.get_my_word(uuid)       from public;
revoke execute on function public.get_game_roster(uuid)   from public;

grant execute on function public.is_lobby_member(uuid)   to authenticated, service_role;
grant execute on function public.is_game_member(uuid)    to authenticated, service_role;
grant execute on function public.is_round_member(uuid)   to authenticated, service_role;
grant execute on function public.shares_lobby_with(uuid) to authenticated, service_role;
grant execute on function public.get_my_word(uuid)       to authenticated, service_role;
grant execute on function public.get_game_roster(uuid)   to authenticated, service_role;

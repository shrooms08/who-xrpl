-- ============================================================================
-- WHO? — Gate 0 follow-up (2/2): revoke the DIRECT anon EXECUTE grant.
--
-- Supabase default privileges grant EXECUTE on new public functions directly to
-- `anon`, `authenticated`, and `service_role` (visible in pg_proc.proacl as
-- `anon=X/postgres`). 0002 only removed the PUBLIC grant, so anon could still
-- call every SECURITY DEFINER function via /rest/v1/rpc. Revoke it here so no
-- unauthenticated role can invoke them (closes advisor lint 0028).
--
-- `authenticated` keeps EXECUTE (required for RLS policy evaluation and the two
-- client RPCs); `service_role` keeps it for server orchestration. The remaining
-- advisor lint 0029 (authenticated can execute) is expected and required for
-- this RLS-helper pattern.
-- ============================================================================

revoke execute on function public.is_lobby_member(uuid)   from anon;
revoke execute on function public.is_game_member(uuid)    from anon;
revoke execute on function public.is_round_member(uuid)   from anon;
revoke execute on function public.shares_lobby_with(uuid) from anon;
revoke execute on function public.get_my_word(uuid)       from anon;
revoke execute on function public.get_game_roster(uuid)   from anon;

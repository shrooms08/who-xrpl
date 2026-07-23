-- ============================================================================
-- WHO? — Gate 1 fix: make gen_lobby_code() independent of pgcrypto's schema.
--
-- 0004's gen_lobby_code used gen_random_bytes() (pgcrypto), which Supabase
-- installs in the `extensions` schema — invisible under our pinned
-- `search_path = public`, so create_lobby() failed with
-- "function gen_random_bytes(integer) does not exist".
--
-- Rewrite using gen_random_uuid() (built into pg_catalog, always in scope):
-- take 12 hex nibbles of a random UUID, fold each byte into the code alphabet.
-- Uniqueness is still guaranteed by the retry loop in create_lobby().
-- ============================================================================

create or replace function public.gen_lobby_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  src      text := replace(gen_random_uuid()::text, '-', ''); -- 32 hex chars
  result   text := '';
  i        int;
begin
  for i in 1..6 loop
    result := result || substr(
      alphabet,
      (('x' || substr(src, i * 2 - 1, 2))::bit(8)::int % length(alphabet)) + 1,
      1
    );
  end loop;
  return result;
end;
$$;

revoke execute on function public.gen_lobby_code() from public, anon, authenticated;
grant  execute on function public.gen_lobby_code() to service_role;

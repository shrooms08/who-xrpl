-- ============================================================================
-- WHO? — Gate 1 follow-up (playtest): lobby codes were ambiguous in the
-- Permanent Marker display font (2/Z, 5/S, plus 0/O, 1/I/L). Restrict the code
-- alphabet to an unambiguous, Crockford-base32-style set:
--   excluded: 0 O 1 I L 2 Z 5 S   →   alphabet: A-Y (minus I,L,O,S,Z) + 3,4,6,7,8,9
-- Applies to NEW lobbies only; existing codes are unchanged.
-- ============================================================================
create or replace function public.gen_lobby_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRTUVWXY346789'; -- 26 unambiguous chars
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

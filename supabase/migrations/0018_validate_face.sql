-- ============================================================================
-- WHO? — Gate P2: server-side face validation. profiles.face must be null or a
-- spec whose ids are all in the known sets (mirrors components/faces/spec.ts).
-- Enforced at the DB so no write path (client update, API, anything) can store
-- an invalid face. Ranges: eyes-01..10, mouth-01..10, mark-00..08, 9 colors.
-- ============================================================================

create or replace function public.validate_face()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.face is null then
    return new;
  end if;
  if jsonb_typeof(new.face) <> 'object'
     or coalesce(new.face->>'eyes','')  !~ '^eyes-(0[1-9]|10)$'
     or coalesce(new.face->>'mouth','') !~ '^mouth-(0[1-9]|10)$'
     or coalesce(new.face->>'mark','')  !~ '^mark-0[0-8]$'
     or coalesce(new.face->>'color','') <> all
          (array['paper','butter','peach','blush','lilac','sky','mint','sand','clay'])
  then
    raise exception 'invalid_face';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_validate_face on public.profiles;
create trigger trg_profiles_validate_face
  before insert or update of face on public.profiles
  for each row execute function public.validate_face();

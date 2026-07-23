-- ============================================================================
-- WHO? — Gate 2: server-authoritative game orchestration.
--
-- The tested TS engine (lib/game) is the authority. Route handlers load state,
-- run the engine, and persist atomically via apply_game_state(): a single
-- transaction that (a) locks the game row FOR UPDATE, (b) compare-and-swaps on
-- a version counter so concurrent advances apply EXACTLY ONCE, (c) materialises
-- the whole current-round state. Only the service role may call it.
-- ============================================================================

-- --- state columns ---------------------------------------------------------
alter table public.games   add column if not exists version int not null default 0;
alter table public.games   add column if not exists winner public.player_role;

alter table public.rounds  add column if not exists turn_order        uuid[];
alter table public.rounds  add column if not exists turn_index        int not null default 0;
alter table public.rounds  add column if not exists ejected_player_id uuid references public.profiles(id);
alter table public.rounds  add column if not exists ejected_role      public.player_role;
alter table public.rounds  add column if not exists awaiting_guess    boolean not null default false;
alter table public.rounds  add column if not exists guess_correct     boolean;

-- heartbeat for presence-based host reaping
alter table public.lobby_players add column if not exists last_seen timestamptz not null default now();

-- --- apply_game_state: atomic, version-CAS'd persister (service role only) --
create or replace function public.apply_game_state(
  p_game uuid,
  p_expected_version int,
  p_state jsonb,
  p_is_deal boolean default false
) returns int
language plpgsql
set search_path = public
as $$
declare
  v_version  int;
  v_round_no int := (p_state->>'round')::int;
  v_round_id uuid;
  v_dur      int := nullif(p_state->>'phaseDurationSeconds', '')::int;
  v_ends     timestamptz;
  v_lobby    uuid;
  rec        jsonb;
begin
  select version into v_version from public.games where id = p_game for update;
  if v_version is null then raise exception 'game_not_found'; end if;
  if v_version <> p_expected_version then
    return -1; -- another advance already won; caller must re-read
  end if;

  v_ends := case when v_dur is null then null else now() + make_interval(secs => v_dur) end;

  if p_is_deal then
    insert into public.game_secrets(game_id, word, category)
      values (p_game, p_state->>'word', p_state->>'category')
      on conflict (game_id) do nothing;
    for rec in select * from jsonb_array_elements(p_state->'players') loop
      insert into public.game_players(game_id, player_id, role, alive, turn_order)
        values (p_game, (rec->>'id')::uuid, (rec->>'role')::public.player_role,
                (rec->>'alive')::boolean, 0)
        on conflict (game_id, player_id) do update
          set role = excluded.role, alive = excluded.alive;
    end loop;
  else
    for rec in select * from jsonb_array_elements(p_state->'players') loop
      update public.game_players set alive = (rec->>'alive')::boolean
        where game_id = p_game and player_id = (rec->>'id')::uuid;
    end loop;
  end if;

  insert into public.rounds(game_id, round_number, phase, phase_ends_at,
      current_turn_player_id, turn_order, turn_index,
      ejected_player_id, ejected_role, awaiting_guess, guess_correct)
    values (p_game, v_round_no, (p_state->>'phase')::public.round_phase, v_ends,
      nullif(p_state->>'currentTurnPlayerId', '')::uuid,
      (select array_agg(value::uuid) from jsonb_array_elements_text(p_state->'order')),
      (p_state->>'turnIndex')::int,
      nullif(p_state->>'ejectedThisRound', '')::uuid,
      nullif(p_state->>'ejectedRole', '')::public.player_role,
      (p_state->>'awaitingGuess')::boolean,
      case when p_state->>'guessWasCorrect' is null then null
           else (p_state->>'guessWasCorrect')::boolean end)
    on conflict (game_id, round_number) do update set
      phase = excluded.phase,
      phase_ends_at = excluded.phase_ends_at,
      current_turn_player_id = excluded.current_turn_player_id,
      turn_order = excluded.turn_order,
      turn_index = excluded.turn_index,
      ejected_player_id = excluded.ejected_player_id,
      ejected_role = excluded.ejected_role,
      awaiting_guess = excluded.awaiting_guess,
      guess_correct = excluded.guess_correct
    returning id into v_round_id;

  -- keep game_players.turn_order aligned with this round's order (for roster)
  update public.game_players gp set turn_order = idx.ord
    from (select value::uuid as pid, (ordinality - 1)::int as ord
          from jsonb_array_elements_text(p_state->'order') with ordinality) idx
    where gp.game_id = p_game and gp.player_id = idx.pid;

  delete from public.clues where round_id = v_round_id;
  insert into public.clues(round_id, player_id, text)
    select v_round_id, (c->>'playerId')::uuid, c->>'text'
    from jsonb_array_elements(p_state->'clues') c;

  delete from public.votes where round_id = v_round_id;
  insert into public.votes(round_id, voter_id, target_id)
    select v_round_id, (v->>'voterId')::uuid, nullif(v->>'targetId', '')::uuid
    from jsonb_array_elements(p_state->'votes') v;

  update public.games set
      version = version + 1,
      current_round = v_round_no,
      winner = nullif(p_state->>'winner', '')::public.player_role,
      status = case when (p_state->>'phase') = 'end'
                    then 'ended'::public.game_status else 'active'::public.game_status end,
      ended_at = case when (p_state->>'phase') = 'end' then now() else null end
    where id = p_game;

  return v_version + 1;
end;
$$;

revoke execute on function public.apply_game_state(uuid, int, jsonb, boolean) from public, anon, authenticated;
grant  execute on function public.apply_game_state(uuid, int, jsonb, boolean) to service_role;

-- --- get_my_role_card: role card. Category is PUBLIC; the secret word only to
--     crew (or once ended); imposters additionally learn their fellow imposters.
create or replace function public.get_my_role_card(p_game uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.player_role;
  v_word text;
  v_cat text;
  v_status public.game_status;
  v_fellows jsonb;
begin
  if not public.is_game_member(p_game) then raise exception 'not_a_member'; end if;
  select role into v_role from public.game_players where game_id = p_game and player_id = v_uid;
  select word, category into v_word, v_cat from public.game_secrets where game_id = p_game;
  select status into v_status from public.games where id = p_game;

  if v_role = 'imposter' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'player_id', gp.player_id, 'display_name', p.display_name)), '[]'::jsonb)
      into v_fellows
      from public.game_players gp
      join public.profiles p on p.id = gp.player_id
      where gp.game_id = p_game and gp.role = 'imposter' and gp.player_id <> v_uid;
  else
    v_fellows := null;
  end if;

  return jsonb_build_object(
    'role', v_role,
    'category', v_cat,
    'word', case when v_role = 'crew' or v_status = 'ended' then v_word else null end,
    'fellow_imposters', v_fellows
  );
end;
$$;

revoke execute on function public.get_my_role_card(uuid) from public, anon;
grant  execute on function public.get_my_role_card(uuid) to authenticated, service_role;

-- --- touch_lobby_presence: heartbeat (drives the reap staleness check) ------
create or replace function public.touch_lobby_presence(p_lobby uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lobby_players set last_seen = now()
    where lobby_id = p_lobby and player_id = auth.uid();
end;
$$;

revoke execute on function public.touch_lobby_presence(uuid) from public, anon;
grant  execute on function public.touch_lobby_presence(uuid) to authenticated, service_role;

-- --- reap_and_migrate_host: now refuses to reap a host seen in the last 20s -
create or replace function public.reap_and_migrate_host(p_lobby uuid, p_absent_host uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_host uuid;
  v_new  uuid;
  v_seen timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.lobby_players where lobby_id = p_lobby and player_id = v_uid) then
    raise exception 'not_a_member';
  end if;
  select host_id into v_host from public.lobbies where id = p_lobby for update;
  if v_host is null then return null; end if;
  if v_host <> p_absent_host then return v_host; end if;

  -- griefing guard: only reap a host who has genuinely gone stale
  select last_seen into v_seen from public.lobby_players
    where lobby_id = p_lobby and player_id = p_absent_host;
  if v_seen is not null and v_seen > now() - interval '20 seconds' then
    return v_host; -- recently alive — refuse
  end if;

  delete from public.lobby_players where lobby_id = p_lobby and player_id = p_absent_host;
  select player_id into v_new from public.lobby_players
    where lobby_id = p_lobby order by joined_at asc limit 1;
  if v_new is null then delete from public.lobbies where id = p_lobby; return null; end if;
  update public.lobbies set host_id = v_new where id = p_lobby;
  return v_new;
end;
$$;

-- --- send_chat: phase-scoped chat. Only living players, only in discussion. --
create or replace function public.send_chat(p_game uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_lobby uuid;
  v_alive boolean;
  v_phase public.round_phase;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_game_member(p_game) then raise exception 'not_a_member'; end if;
  if char_length(coalesce(p_content, '')) < 1 or char_length(p_content) > 500 then
    raise exception 'bad_length';
  end if;
  select alive into v_alive from public.game_players where game_id = p_game and player_id = v_uid;
  if v_alive is distinct from true then raise exception 'muted'; end if; -- dead/spectators muted
  select phase into v_phase from public.rounds where game_id = p_game
    order by round_number desc limit 1;
  if v_phase is distinct from 'discussion' then raise exception 'chat_closed'; end if;
  select lobby_id into v_lobby from public.games where id = p_game;
  insert into public.chat_messages(lobby_id, game_id, player_id, content)
    values (v_lobby, p_game, v_uid, p_content);
end;
$$;

revoke execute on function public.send_chat(uuid, text) from public, anon;
grant  execute on function public.send_chat(uuid, text) to authenticated, service_role;

-- Game chat now flows exclusively through send_chat (phase-scoped). Drop the
-- permissive direct-insert policy so clients cannot bypass the phase rules.
drop policy if exists chat_insert_self on public.chat_messages;

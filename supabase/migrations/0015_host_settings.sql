-- ============================================================================
-- WHO? — Gate 5 Part 3: host lobby settings + per-game config.
--   * lobbies.{discussion_seconds, clue_rounds, topic} — host-set, pre-game,
--     locked at start; persist on the lobby (survive play-again).
--   * games.config jsonb — the settings snapshot the running game reads (so the
--     engine stays deterministic; lobby settings may change for the next game).
--   * clues.pass — which clue pass (0-based) a clue belongs to; with clueRounds=2
--     a player clues twice per round, so the uniqueness must include the pass.
-- ============================================================================

alter table public.lobbies
  add column if not exists discussion_seconds int  not null default 120,
  add column if not exists clue_rounds        int  not null default 1,
  add column if not exists topic              text;

alter table public.lobbies drop constraint if exists lobbies_discussion_seconds_chk;
alter table public.lobbies add  constraint lobbies_discussion_seconds_chk
  check (discussion_seconds in (60, 90, 120, 180));

alter table public.lobbies drop constraint if exists lobbies_clue_rounds_chk;
alter table public.lobbies add  constraint lobbies_clue_rounds_chk
  check (clue_rounds in (1, 2));

alter table public.lobbies drop constraint if exists lobbies_topic_chk;
alter table public.lobbies add  constraint lobbies_topic_chk
  check (topic is null or topic in
    ('food', 'places', 'objects', 'animals', 'occupations', 'football'));

alter table public.games add column if not exists config jsonb not null default '{}'::jsonb;

alter table public.clues add column if not exists pass int not null default 0;
alter table public.clues drop constraint if exists clues_round_id_player_id_key;
alter table public.clues drop constraint if exists clues_round_player_pass_key;
alter table public.clues add  constraint clues_round_player_pass_key
  unique (round_id, player_id, pass);

-- Rebuild apply_game_state so the clues insert carries `pass`. (Identical to
-- 0007 otherwise; config lives on the games row, set at start, untouched here.)
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

  update public.game_players gp set turn_order = idx.ord
    from (select value::uuid as pid, (ordinality - 1)::int as ord
          from jsonb_array_elements_text(p_state->'order') with ordinality) idx
    where gp.game_id = p_game and gp.player_id = idx.pid;

  delete from public.clues where round_id = v_round_id;
  insert into public.clues(round_id, player_id, text, pass)
    select v_round_id, (c->>'playerId')::uuid, c->>'text',
           coalesce((c->>'pass')::int, 0)
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

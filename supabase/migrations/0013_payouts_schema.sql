-- ============================================================================
-- WHO? — Gate 4: payout ledger (the money loop, SEND side).
--
-- One row per winning player per game. The (game_id, player_id) UNIQUE key is
-- the idempotency anchor: a retried / double-invoked game-end creates the row
-- set EXACTLY ONCE (insert is ON CONFLICT DO NOTHING). The runner then claims
-- each row via a status CAS (pending -> sending) so a payout tx is submitted at
-- most once, even under concurrent settlement. No client ever writes this table
-- (service-role only); members may read it for the paid-chip UI.
--
-- status lifecycle:
--   pending  -> row created, tx not yet submitted
--   sending  -> claimed by a runner, submit in flight (in-doubt on crash)
--   sent     -> tx validated; tx_hash set
--   failed   -> submit/validation failed; error set
--   skipped  -> pot too small (payout_skipped_insufficient_pot) or no wallet
-- ============================================================================

create table if not exists public.payouts (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games (id) on delete cascade,
  player_id    uuid not null references public.profiles (id) on delete cascade,
  address      text not null,                 -- destination XRPL address (snapshot)
  amount_drops bigint not null,               -- this winner's share, in drops
  status       text not null default 'pending',
  tx_hash      text,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (game_id, player_id),
  constraint payouts_status_chk
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped'))
);

create index if not exists idx_payouts_game on public.payouts (game_id);

alter table public.payouts enable row level security;
alter table public.payouts force  row level security;

-- Readable by the paid player OR any member of the game. No insert/update/delete
-- policy exists, so authenticated clients can only read — every write goes
-- through the service-role runner (which bypasses RLS by design).
drop policy if exists payouts_select on public.payouts;
create policy payouts_select on public.payouts
  for select to authenticated
  using (player_id = auth.uid() or public.is_game_member(game_id));

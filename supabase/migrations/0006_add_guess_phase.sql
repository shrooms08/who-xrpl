-- ============================================================================
-- WHO? — Gate 2: add the 'guess' phase (ejected imposter's single word guess).
-- Separate migration because a new enum value cannot be USED in the same
-- transaction it is added.
-- ============================================================================
alter type public.round_phase add value if not exists 'guess' after 'reveal';

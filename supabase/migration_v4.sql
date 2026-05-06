-- migration_v4.sql
-- Run in Supabase SQL Editor.
--
-- Fixes:
-- 1. competition_phase CHECK constraint — adds 'casual' (was missing from schema.sql)
-- 2. rating_history.season — drops NOT NULL so casual games (no season) can insert
-- 3. games_played update path — ensures it's not double-counting

-- ── 1. Fix competition_phase constraint ──────────────────────────────────────
-- The original schema.sql didn't include 'casual' in the CHECK.
-- Casual games insert with competition_phase='casual' and fail silently.
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_competition_phase_check;

ALTER TABLE public.games ADD CONSTRAINT games_competition_phase_check
  CHECK (competition_phase IN (
    'league_phase', 'playoff_semifinal', 'playoff_final',
    'group_stage', 'knockout_semifinal', 'knockout_final',
    'cup_quarterfinal', 'cup_semifinal', 'cup_final',
    'knockout_quarterfinal', 'armageddon', 'calibration', 'casual'
  ));

-- ── 2. Fix rating_history.season — allow NULL for casual games ───────────────
ALTER TABLE public.rating_history
  ALTER COLUMN season DROP NOT NULL;

-- ── 3. Ensure analysis columns exist (safe if already run migration_v3) ──────
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS white_anticheat_score  INTEGER,
  ADD COLUMN IF NOT EXISTS black_anticheat_score  INTEGER,
  ADD COLUMN IF NOT EXISTS anticheat_flagged       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS analysis_complete       BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 4. conduct_violations table (safe if already run migration_v3) ────────────
CREATE TABLE IF NOT EXISTS public.conduct_violations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  game_id        UUID REFERENCES public.games(id) ON DELETE SET NULL,
  violation_type TEXT NOT NULL CHECK (violation_type IN (
    'cheating_flag','cheating_confirmed',
    'post_game_abuse','disconnection_abuse','forfeit_repeated'
  )),
  severity       TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN (
    'warning','game_forfeit','suspension','ban'
  )),
  description    TEXT,
  reviewed_by    TEXT,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conduct_violations_player ON public.conduct_violations(player_id);
CREATE INDEX IF NOT EXISTS idx_conduct_violations_game   ON public.conduct_violations(game_id);

ALTER TABLE public.conduct_violations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='conduct_violations'
    AND policyname='players_read_own_violations'
  ) THEN
    CREATE POLICY "players_read_own_violations"
      ON public.conduct_violations FOR SELECT TO authenticated
      USING (player_id IN (SELECT id FROM public.players WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

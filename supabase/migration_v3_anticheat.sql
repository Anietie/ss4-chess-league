-- migration_v3_anticheat.sql
-- Run this in Supabase SQL Editor.
-- Adds the anticheat columns that runAnticheatPipeline writes to.
-- Without these columns every anticheat DB write silently fails.

-- ── Anticheat score columns on games ─────────────────────────────────────────
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS white_anticheat_score  INTEGER,
  ADD COLUMN IF NOT EXISTS black_anticheat_score  INTEGER,
  ADD COLUMN IF NOT EXISTS anticheat_flagged       BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for admin queries: "show me all flagged games"
CREATE INDEX IF NOT EXISTS idx_games_anticheat_flagged
  ON public.games (anticheat_flagged)
  WHERE anticheat_flagged = TRUE;

-- ── conduct_violations table ──────────────────────────────────────────────────
-- Populated when a player is flagged; resolved by admin via /api/admin/resolve-cheat
CREATE TABLE IF NOT EXISTS public.conduct_violations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  game_id        UUID REFERENCES public.games(id) ON DELETE SET NULL,
  violation_type TEXT NOT NULL CHECK (violation_type IN (
    'cheating_flag', 'cheating_confirmed',
    'post_game_abuse', 'disconnection_abuse', 'forfeit_repeated'
  )),
  severity       TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN (
    'warning', 'game_forfeit', 'suspension', 'ban'
  )),
  description    TEXT,
  reviewed_by    TEXT,             -- admin identifier
  resolved_at    TIMESTAMPTZ,      -- NULL = pending review
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conduct_violations_player
  ON public.conduct_violations (player_id);

CREATE INDEX IF NOT EXISTS idx_conduct_violations_game
  ON public.conduct_violations (game_id);

CREATE INDEX IF NOT EXISTS idx_conduct_violations_pending
  ON public.conduct_violations (resolved_at)
  WHERE resolved_at IS NULL;

-- RLS: players can read their own violations; admins can read all
ALTER TABLE public.conduct_violations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conduct_violations'
      AND policyname = 'players_read_own_violations'
  ) THEN
    CREATE POLICY "players_read_own_violations"
    ON public.conduct_violations
    FOR SELECT
    TO authenticated
    USING (
      player_id IN (
        SELECT id
        FROM public.players
        WHERE auth_user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- ── rating_history: allow null season (for casual games) ─────────────────────
-- If this constraint exists, casual game rating history inserts will fail
ALTER TABLE public.rating_history
  ALTER COLUMN season DROP NOT NULL;
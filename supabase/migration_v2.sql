-- =============================================================================
-- SS4 CHESS LEAGUE — v2 MIGRATION
-- Changes:
--   1. Remove tier system from players, standings, season_draft
--   2. Drop league_coefficients table
--   3. Add casual_challenges table
--   4. Add spectator_messages table
--   5. Extend seasons for Champions Cup knockout structure
--   6. Extend standings to track cup qualification
--   7. Add 'casual' and 'champions_cup' to games league/phase enums
--   8. Add notification types for new features
--   9. Fix games constraint for calibration
--  10. Add draft history table for returning players
-- Run this once in Supabase SQL Editor
-- =============================================================================

-- ── 1. Remove tiers from players ─────────────────────────────────────────────
ALTER TABLE players DROP COLUMN IF EXISTS current_tier;

-- ── 2. Update home_league constraint to allow more leagues ───────────────────
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_home_league_check;
ALTER TABLE players ADD CONSTRAINT players_home_league_check
  CHECK (home_league IN (
    'league_1','league_2','league_3','league_4',
    'league_5','league_6','league_7','league_8',
    'unassigned','calibration'
  ));

-- ── 3. Add end-of-season rating snapshot for draft ordering ──────────────────
ALTER TABLE players ADD COLUMN IF NOT EXISTS draft_rating FLOAT;
COMMENT ON COLUMN players.draft_rating IS
  'Rating snapshot used for next season snake draft. Updated at season end.';

-- ── 4. Update standings: remove tier, add cup_qualified ──────────────────────
ALTER TABLE standings DROP COLUMN IF EXISTS tier;
ALTER TABLE standings DROP COLUMN IF EXISTS promoted;
ALTER TABLE standings DROP COLUMN IF EXISTS relegated;
ALTER TABLE standings ADD COLUMN IF NOT EXISTS cup_qualified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE standings DROP CONSTRAINT IF EXISTS standings_season_league_tier_player_id_key;
ALTER TABLE standings ADD CONSTRAINT standings_season_league_player_id_key
  UNIQUE (season, league, player_id);

-- ── 5. Update season_draft: remove tier ──────────────────────────────────────
ALTER TABLE season_draft DROP COLUMN IF EXISTS assigned_tier;

-- ── 6. Drop coefficients (no longer needed) ──────────────────────────────────
DROP TABLE IF EXISTS league_coefficients;

-- ── 7. Extend games: allow casual + champions_cup leagues/phases ─────────────
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_league_check;
ALTER TABLE games ADD CONSTRAINT games_league_check
  CHECK (league IN (
    'league_1','league_2','league_3','league_4',
    'league_5','league_6','league_7','league_8',
    'champions_cup','continental_shield','open_cup',
    'blitz','newcomer_shield','calibration','casual'
  ));

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_competition_phase_check;
ALTER TABLE games ADD CONSTRAINT games_competition_phase_check
  CHECK (competition_phase IN (
    'league_phase','cup_quarterfinal','cup_semifinal','cup_final',
    'group_stage','knockout_quarterfinal','knockout_semifinal',
    'knockout_final','armageddon','calibration','casual'
  ));

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_tier_check;
ALTER TABLE games DROP COLUMN IF EXISTS tier;

-- Fix calibration constraint (allow same player on both sides for bot games)
ALTER TABLE games DROP CONSTRAINT IF EXISTS different_players;
ALTER TABLE games ADD CONSTRAINT different_players
  CHECK (competition_phase = 'calibration' OR white_player_id != black_player_id);

-- Add casual game metadata columns
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_rated BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS casual_challenge_id UUID;

-- ── 8. Extend seasons for Champions Cup ──────────────────────────────────────
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_status_check;
ALTER TABLE seasons ADD CONSTRAINT seasons_status_check
  CHECK (status IN ('registration','draft','active','champions_cup','complete'));

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS cup_start_date DATE;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS cup_end_date   DATE;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS cup_winner_id  UUID REFERENCES players(id);
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS cup_runner_up_id UUID REFERENCES players(id);
-- Keep old CL columns for backward compat but they map to cup now
-- seasons.cl_winner_id = seasons.cup_winner_id

-- ── 9. CASUAL CHALLENGES table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS casual_challenges (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenger_id    UUID NOT NULL REFERENCES players(id),
  challenged_id    UUID REFERENCES players(id),     -- NULL = open challenge (link-based)
  time_control     TEXT NOT NULL DEFAULT '600+0',
  is_rated         BOOLEAN NOT NULL DEFAULT FALSE,
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','expired','cancelled')),
  game_id          UUID REFERENCES games(id),        -- set when accepted
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE casual_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read challenges" ON casual_challenges FOR SELECT USING (TRUE);

CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON casual_challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenged ON casual_challenges(challenged_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status     ON casual_challenges(status);

-- ── 10. SPECTATOR MESSAGES table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spectator_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id    UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id),
  message    TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE spectator_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read spectator messages" ON spectator_messages FOR SELECT USING (TRUE);
CREATE POLICY "Auth users insert spectator messages" ON spectator_messages
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE auth_user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_spec_messages_game ON spectator_messages(game_id, created_at);

-- ── 11. Extend notifications for new types ───────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'fixture_scheduled','round_start','deadline_reminder',
    'result_recorded','cl_qualified','cup_qualified',
    'badge_awarded','suspension','rating_update',
    'casual_challenge','casual_accepted','casual_declined',
    'draft_result','admin_action'
  ));

-- ── 12. Realtime enable for live features ────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE spectator_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE casual_challenges;

-- ── 13. Draft history for returning players ───────────────────────────────────
-- season_draft already exists; just add rating snapshot column
ALTER TABLE season_draft ADD COLUMN IF NOT EXISTS seed_rating_at_draft FLOAT;
ALTER TABLE season_draft ADD COLUMN IF NOT EXISTS is_returning BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE season_draft ADD COLUMN IF NOT EXISTS previous_league TEXT;
COMMENT ON COLUMN season_draft.is_returning IS
  'TRUE if player participated in at least one previous season';

-- ── 14. Performance indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_games_casual   ON games(league) WHERE league = 'casual';
CREATE INDEX IF NOT EXISTS idx_games_cup      ON games(league) WHERE league = 'champions_cup';
CREATE INDEX IF NOT EXISTS idx_games_rated    ON games(is_rated);
-- =============================================================================
-- SS4 CHESS LEAGUE — COMPLETE DATABASE SCHEMA v1.6
-- PostgreSQL / Supabase
-- Paste this into Supabase SQL Editor and run in one shot.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- SEASONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seasons (
  id                                INTEGER PRIMARY KEY,
  name                              TEXT NOT NULL,
  start_date                        DATE NOT NULL,
  end_date                          DATE,
  status                            TEXT NOT NULL DEFAULT 'registration'
    CHECK (status IN ('registration','draft','active','playoffs','champions_league','complete')),
  domestic_end_date                 DATE,
  playoffs_end_date                 DATE,
  cl_start_date                     DATE,
  cl_end_date                       DATE,
  league_1_premier_champion_id      UUID,
  league_2_premier_champion_id      UUID,
  cl_winner_id                      UUID,
  cl_runner_up_id                   UUID,
  open_cup_winner_id                UUID,
  continental_shield_winner_id      UUID,
  blitz_invitational_winner_id      UUID,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- PLAYERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name                 TEXT NOT NULL,
  email                     TEXT UNIQUE NOT NULL,
  phone_number              TEXT,
  chess_com_username        TEXT,
  lichess_username          TEXT,
  whatsapp_number           TEXT,
  year_started_chess        INTEGER,
  joining_season            INTEGER NOT NULL DEFAULT 1 REFERENCES seasons(id),
  home_league               TEXT NOT NULL CHECK (home_league IN ('league_1','league_2','league_3','league_4','league_5','league_6')),
  current_tier              TEXT NOT NULL DEFAULT 'unassigned'
    CHECK (current_tier IN ('premier','development','reserve','unassigned')),
  -- Authentication
  auth_method               TEXT NOT NULL DEFAULT 'email' CHECK (auth_method IN ('sms','email','both')),
  verification_code         VARCHAR(6),
  is_verified               BOOLEAN NOT NULL DEFAULT FALSE,
  -- Glicko-2 fields
  ss4_rating                FLOAT NOT NULL DEFAULT 1000,
  rating_deviation          FLOAT NOT NULL DEFAULT 200,
  volatility                FLOAT NOT NULL DEFAULT 0.06,
  games_played              INTEGER NOT NULL DEFAULT 0,
  is_provisional            BOOLEAN GENERATED ALWAYS AS (rating_deviation > 100) STORED,
  -- Seeding
  seed_rating               FLOAT,
  seed_source               TEXT CHECK (seed_source IN ('chess_com_api','lichess_api','bot_calibration','manual','default')),
  -- Bot calibration
  calibration_games_played  INTEGER DEFAULT 0,
  calibration_complete      BOOLEAN DEFAULT FALSE,
  -- Forfeits (reset each season)
  season_forfeit_count      INTEGER NOT NULL DEFAULT 0,
  -- Status
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  is_suspended              BOOLEAN NOT NULL DEFAULT FALSE,
  suspension_reason         TEXT,
  auth_user_id              UUID UNIQUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- GAMES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS games (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season                INTEGER NOT NULL REFERENCES seasons(id),
  round                 INTEGER,
  league                TEXT NOT NULL CHECK (league IN (
    'league_1','league_2','league_3','league_4',
    'champions_league','continental_shield','open_cup',
    'blitz','newcomer_shield','calibration'
  )),
  tier                  TEXT CHECK (tier IN ('premier','development','n_a')),
  competition_phase     TEXT NOT NULL CHECK (competition_phase IN (
    'league_phase','playoff_semifinal','playoff_final',
    'group_stage','knockout_semifinal','knockout_final','armageddon','calibration'
  )),
  white_player_id       UUID NOT NULL REFERENCES players(id),
  black_player_id       UUID NOT NULL REFERENCES players(id),
  scheduled_date        DATE,
  deadline_date         DATE,
  result                TEXT NOT NULL DEFAULT '*'
    CHECK (result IN ('1-0','0-1','0.5-0.5','forfeit_white','forfeit_both','*')),
  white_rating_before   FLOAT,
  black_rating_before   FLOAT,
  white_rd_before       FLOAT,
  black_rd_before       FLOAT,
  white_rating_after    FLOAT,
  black_rating_after    FLOAT,
  white_rd_after        FLOAT,
  black_rd_after        FLOAT,
  pgn                   TEXT,
  moves_json            JSONB,
  time_control          TEXT NOT NULL DEFAULT '600+5',
  game_state_fen        TEXT,
  white_time_remaining  INTEGER,
  black_time_remaining  INTEGER,
  is_live               BOOLEAN NOT NULL DEFAULT FALSE,
  room_id               TEXT UNIQUE,
  analysis_json         JSONB,
  analysis_complete     BOOLEAN NOT NULL DEFAULT FALSE,
  played_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT different_players CHECK (white_player_id != black_player_id)
);

-- ─────────────────────────────────────────────────────────────
-- STANDINGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS standings (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season                   INTEGER NOT NULL REFERENCES seasons(id),
  league                   TEXT NOT NULL,
  tier                     TEXT NOT NULL,
  player_id                UUID NOT NULL REFERENCES players(id),
  points                   FLOAT NOT NULL DEFAULT 0,
  wins                     INTEGER NOT NULL DEFAULT 0,
  draws                    INTEGER NOT NULL DEFAULT 0,
  losses                   INTEGER NOT NULL DEFAULT 0,
  forfeits_given           INTEGER NOT NULL DEFAULT 0,
  games_played             INTEGER NOT NULL DEFAULT 0,
  sonneborn_berger         FLOAT NOT NULL DEFAULT 0,
  buchholz                 FLOAT NOT NULL DEFAULT 0,
  position                 INTEGER,
  cl_qualified             BOOLEAN NOT NULL DEFAULT FALSE,
  promoted                 BOOLEAN NOT NULL DEFAULT FALSE,
  relegated                BOOLEAN NOT NULL DEFAULT FALSE,
  rating_at_season_start   FLOAT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season, league, tier, player_id)
);

-- ─────────────────────────────────────────────────────────────
-- RATING HISTORY
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rating_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id     UUID NOT NULL REFERENCES players(id),
  game_id       UUID REFERENCES games(id),
  season        INTEGER NOT NULL REFERENCES seasons(id),
  rating        FLOAT NOT NULL,
  rating_deviation FLOAT NOT NULL,
  volatility    FLOAT NOT NULL,
  change        FLOAT NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- PLAYER BADGES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_badges (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id     UUID NOT NULL REFERENCES players(id),
  badge_type    TEXT NOT NULL CHECK (badge_type IN (
    'pioneer_s1','league_champion','cl_winner','cl_runner_up',
    'group_top_scorer','giant_killer','unbeaten_season',
    'comeback_king','top_earner','century_club',
    'newcomer_shield_winner','open_cup_winner',
    'continental_shield_winner','blitz_invitational_winner','best_league_rep'
  )),
  season        INTEGER REFERENCES seasons(id),
  description   TEXT,
  awarded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, badge_type, season)
);

-- ─────────────────────────────────────────────────────────────
-- CHAMPIONS LEAGUE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS champions_league (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season                    INTEGER NOT NULL REFERENCES seasons(id),
  player_id                 UUID NOT NULL REFERENCES players(id),
  from_league               TEXT NOT NULL,
  seeding_pot               INTEGER NOT NULL DEFAULT 2 CHECK (seeding_pot IN (1,2,3)),
  cl_group                  TEXT CHECK (cl_group IN ('A','B','C','D')),
  domestic_finish           INTEGER NOT NULL,
  group_points              FLOAT NOT NULL DEFAULT 0,
  group_wins                INTEGER NOT NULL DEFAULT 0,
  group_draws               INTEGER NOT NULL DEFAULT 0,
  group_losses              INTEGER NOT NULL DEFAULT 0,
  group_position            INTEGER,
  advanced_from_group       BOOLEAN NOT NULL DEFAULT FALSE,
  reached_semifinal         BOOLEAN NOT NULL DEFAULT FALSE,
  reached_final             BOOLEAN NOT NULL DEFAULT FALSE,
  won_cl                    BOOLEAN NOT NULL DEFAULT FALSE,
  coefficient_contribution  FLOAT NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season, player_id)
);

-- ─────────────────────────────────────────────────────────────
-- LEAGUE COEFFICIENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_coefficients (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league                  TEXT NOT NULL,
  season                  INTEGER NOT NULL REFERENCES seasons(id),
  cl_qualifiers_count     INTEGER NOT NULL DEFAULT 0,
  qualifiers_points       FLOAT NOT NULL DEFAULT 0,
  group_stage_points      FLOAT NOT NULL DEFAULT 0,
  semifinal_points        FLOAT NOT NULL DEFAULT 0,
  final_points            FLOAT NOT NULL DEFAULT 0,
  winner_bonus            FLOAT NOT NULL DEFAULT 0,
  coefficient_score       FLOAT NOT NULL DEFAULT 0,
  cumulative_coefficient  FLOAT NOT NULL DEFAULT 0,
  cl_pot_next_season      INTEGER NOT NULL DEFAULT 2,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(league, season)
);

-- ─────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id     UUID NOT NULL REFERENCES players(id),
  type          TEXT NOT NULL CHECK (type IN (
    'fixture_scheduled','round_start','deadline_reminder',
    'result_recorded','promotion','relegation',
    'cl_qualified','badge_awarded','suspension','rating_update'
  )),
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  game_id       UUID REFERENCES games(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- SEASON DRAFT
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS season_draft (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season          INTEGER NOT NULL REFERENCES seasons(id),
  player_id       UUID NOT NULL REFERENCES players(id),
  draft_position  INTEGER NOT NULL,
  seed_rating     FLOAT NOT NULL,
  assigned_league TEXT NOT NULL,
  assigned_tier   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season, player_id)
);

-- ─────────────────────────────────────────────────────────────
-- CONDUCT VIOLATIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conduct_violations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id       UUID NOT NULL REFERENCES players(id),
  season          INTEGER REFERENCES seasons(id),
  violation_type  TEXT NOT NULL CHECK (violation_type IN (
    'post_game_abuse','disconnection_abuse','cheating_flag','cheating_confirmed','forfeit_repeated'
  )),
  severity        TEXT NOT NULL CHECK (severity IN ('warning','game_forfeit','season_ban','lifetime_ban')),
  description     TEXT,
  game_id         UUID REFERENCES games(id),
  reviewed_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_games_season     ON games(season);
CREATE INDEX IF NOT EXISTS idx_games_white      ON games(white_player_id);
CREATE INDEX IF NOT EXISTS idx_games_black      ON games(black_player_id);
CREATE INDEX IF NOT EXISTS idx_games_league     ON games(league);
CREATE INDEX IF NOT EXISTS idx_games_live       ON games(is_live) WHERE is_live = TRUE;
CREATE INDEX IF NOT EXISTS idx_standings_season ON standings(season, league, tier);
CREATE INDEX IF NOT EXISTS idx_standings_player ON standings(player_id);
CREATE INDEX IF NOT EXISTS idx_rating_history   ON rating_history(player_id);
CREATE INDEX IF NOT EXISTS idx_notifs_player    ON notifications(player_id, is_read);
CREATE INDEX IF NOT EXISTS idx_players_league   ON players(home_league);
CREATE INDEX IF NOT EXISTS idx_players_tier     ON players(current_tier);

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
ALTER TABLE players          ENABLE ROW LEVEL SECURITY;
ALTER TABLE games            ENABLE ROW LEVEL SECURITY;
ALTER TABLE standings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_badges    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_history   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read players'
      AND tablename = 'players'
  ) THEN
    CREATE POLICY "Public read players" ON players FOR SELECT USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read games'
      AND tablename = 'games'
  ) THEN
    CREATE POLICY "Public read games" ON games FOR SELECT USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read standings'
      AND tablename = 'standings'
  ) THEN
    CREATE POLICY "Public read standings" ON standings FOR SELECT USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read badges'
      AND tablename = 'player_badges'
  ) THEN
    CREATE POLICY "Public read badges" ON player_badges FOR SELECT USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read rating_history'
      AND tablename = 'rating_history'
  ) THEN
    CREATE POLICY "Public read rating_history" ON rating_history FOR SELECT USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read seasons'
      AND tablename = 'seasons'
  ) THEN
    CREATE POLICY "Public read seasons" ON seasons FOR SELECT USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read coefficients'
      AND tablename = 'league_coefficients'
  ) THEN
    CREATE POLICY "Public read coefficients" ON league_coefficients FOR SELECT USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read cl'
      AND tablename = 'champions_league'
  ) THEN
    CREATE POLICY "Public read cl" ON champions_league FOR SELECT USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read draft'
      AND tablename = 'season_draft'
  ) THEN
    CREATE POLICY "Public read draft" ON season_draft FOR SELECT USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users read own notifications'
      AND tablename = 'notifications'
  ) THEN
    CREATE POLICY "Users read own notifications" ON notifications
      FOR SELECT USING (player_id IN (
        SELECT id FROM players WHERE auth_user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users update own notifications'
      AND tablename = 'notifications'
  ) THEN
    CREATE POLICY "Users update own notifications" ON notifications
      FOR UPDATE USING (player_id IN (
        SELECT id FROM players WHERE auth_user_id = auth.uid()
      ));
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'players_updated_at'
      AND tgrelid = 'players'::regclass
  ) THEN
    CREATE TRIGGER players_updated_at BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'games_updated_at'
      AND tgrelid = 'games'::regclass
  ) THEN
    CREATE TRIGGER games_updated_at BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'standings_updated_at'
      AND tgrelid = 'standings'::regclass
  ) THEN
    CREATE TRIGGER standings_updated_at BEFORE UPDATE ON standings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────
-- SEED DATA
-- ─────────────────────────────────────────────────────────────
INSERT INTO seasons (id, name, start_date, status)
VALUES (1, 'Season 1 (Apr–Jul 2026)', '2026-04-01', 'registration')
ON CONFLICT (id) DO NOTHING;

INSERT INTO league_coefficients (league, season, coefficient_score, cumulative_coefficient)
VALUES ('league_1', 1, 0, 0), ('league_2', 1, 0, 0)
ON CONFLICT (league, season) DO NOTHING;

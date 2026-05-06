-- migration_v5_play_windows.sql
-- Run in Supabase SQL Editor

-- ── Round Windows ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS round_windows (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season          INTEGER NOT NULL REFERENCES seasons(id),
  competition     TEXT NOT NULL CHECK (competition IN ('league', 'scel', 'champions_league', 'continental_shield', 'blitz', 'newcomer_shield')),
  round           INTEGER NOT NULL,
  league          TEXT, -- NULL for non-league competitions
  window_start    TIMESTAMPTZ NOT NULL,
  window_end      TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'open', 'closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season, competition, round, league)
);

CREATE INDEX IF NOT EXISTS idx_round_windows_status ON round_windows(status, window_start);

-- ── No-Show Claims ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS no_show_claims (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id         UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  claimed_by      UUID NOT NULL REFERENCES players(id),
  claimed_against UUID NOT NULL REFERENCES players(id),
  claimed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  grace_ends_at   TIMESTAMPTZ NOT NULL,
  resolved_at     TIMESTAMPTZ,
  resolution      TEXT CHECK (resolution IN ('auto_forfeit', 'opponent_joined', 'cancelled', 'manual')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_no_show_claims_game ON no_show_claims(game_id);
CREATE INDEX IF NOT EXISTS idx_no_show_claims_pending ON no_show_claims(resolved_at) WHERE resolved_at IS NULL;

-- ── WhatsApp Notifications Log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id       UUID REFERENCES players(id),
  phone_number    TEXT NOT NULL,
  template_name   TEXT NOT NULL,
  message_body    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'read')),
  meta_message_id TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_player ON whatsapp_logs(player_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status ON whatsapp_logs(status);

-- ── Extend notifications table for nudge ──────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'fixture_scheduled','round_start','deadline_reminder',
    'result_recorded','cl_qualified','cup_qualified',
    'badge_awarded','suspension','rating_update',
    'casual_challenge','casual_accepted','casual_declined',
    'draft_result','admin_action','nudge',
    'no_show_claimed','no_show_resolved','round_starting_soon',
    'window_open','window_closed','season_starting'
  ));

-- ── Ensure whatsapp_number is NOT NULL for active players ─────────────────
-- (We'll enforce this in the registration API, but add a partial index for queries)
CREATE INDEX IF NOT EXISTS idx_players_whatsapp ON players(whatsapp_number) 
  WHERE is_active = TRUE AND whatsapp_number IS NOT NULL;

-- ── Real-time enable the new tables ───────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE round_windows;
ALTER PUBLICATION supabase_realtime ADD TABLE no_show_claims;

-- Add to migration_v5_play_windows.sql or run separately
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, endpoint)
);
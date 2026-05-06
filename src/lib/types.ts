// SS4 Chess League — Complete TypeScript Types

export type League = 'league_1'|'league_2'|'league_3'|'league_4'|'league_5'|'league_6'|'league_7'|'league_8';
export type GameResult = '1-0'|'0-1'|'0.5-0.5'|'forfeit_white'|'forfeit_both'|'*';
export type SeasonStatus = 'registration'|'draft'|'active'|'champions_league'|'complete';
export type CompetitionLeague = League|'champions_league'|'scel'|'continental_shield'|'blitz'|'newcomer_shield'|'calibration'|'casual';
export type CompetitionPhase = 
  // League
  | 'league_phase'
  // SCEL
  | 'scel_round_128' | 'scel_round_64' | 'scel_round_32' | 'scel_round_16'
  | 'scel_quarterfinal' | 'scel_semifinal' | 'scel_final'
  // Champions League
  | 'cl_group_stage' | 'cl_round_of_32' | 'cl_round_of_16'
  | 'cl_quarterfinal' | 'cl_semifinal' | 'cl_final'
  // Other
  | 'armageddon' | 'calibration' | 'casual';

export type BadgeType = 
  | 'pioneer_s1' | 'league_champion' | 'cl_winner' | 'cl_runner_up'
  | 'group_top_scorer' | 'giant_killer' | 'unbeaten_season'
  | 'century_club' | 'scel_winner' | 'continental_shield_winner'
  | 'blitz_invitational_winner' | 'newcomer_shield_winner';

export type NotificationType = 
  | 'fixture_scheduled' | 'round_start' | 'deadline_reminder'
  | 'result_recorded' | 'cl_qualified' | 'badge_awarded'
  | 'suspension' | 'rating_update' | 'draft_result'
  | 'casual_challenge' | 'casual_accepted' | 'casual_declined'
  | 'admin_action' | 'season_complete' | 'welcome';

export interface Player {
  id: string; full_name: string; email: string;
  chess_com_username?: string; lichess_username?: string; whatsapp_number?: string;
  year_started_chess?: number; joining_season: number;
  home_league: string;
  ss4_rating: number; rating_deviation: number; volatility: number;
  is_provisional: boolean; games_played: number;
  seed_rating?: number; seed_source?: string;
  calibration_games_played: number; calibration_complete: boolean;
  season_forfeit_count: number; is_active: boolean; is_suspended: boolean;
  suspension_reason?: string; is_admin?: boolean;
  auth_user_id?: string; draft_rating?: number;
  created_at: string; updated_at: string;
}

export interface Game {
  id: string; season: number; round?: number;
  league: CompetitionLeague;
  competition_phase: CompetitionPhase;
  white_player_id: string; black_player_id: string;
  scheduled_date?: string; deadline_date?: string;
  result: GameResult;
  white_rating_before?: number; black_rating_before?: number;
  white_rd_before?: number; black_rd_before?: number;
  white_rating_after?: number; black_rating_after?: number;
  white_rd_after?: number; black_rd_after?: number;
  pgn?: string; moves_json?: any[]; time_control: string;
  game_state_fen?: string; white_time_remaining?: number; black_time_remaining?: number;
  is_live: boolean; room_id?: string; is_rated: boolean;
  analysis_json?: any; analysis_complete: boolean;
  white_anticheat_score?: number; black_anticheat_score?: number;
  anticheat_flagged?: boolean;
  is_game_of_round?: boolean;
  casual_challenge_id?: string;
  played_at?: string; created_at: string; updated_at: string;
  white_player?: Player; black_player?: Player;
}

export interface Standing {
  id: string; season: number; league: string; player_id: string;
  points: number; wins: number; draws: number; losses: number;
  forfeits_given: number; games_played: number;
  sonneborn_berger: number; buchholz: number; position?: number;
  cup_qualified: boolean;
  rating_at_season_start?: number;
  player?: Player;
}

export interface Season {
  id: number; name: string;
  start_date: string; end_date?: string;
  registration_start?: string | null;
  registration_end?: string | null;
  status: SeasonStatus;
  league_1_champion_id?: string; league_2_champion_id?: string;
  league_3_champion_id?: string; league_4_champion_id?: string;
  cl_winner_id?: string; cl_runner_up_id?: string;
  scel_winner_id?: string;
  continental_shield_winner_id?: string;
  blitz_invitational_winner_id?: string;
  cup_start_date?: string; cup_end_date?: string;
  created_at: string;
}

export interface LeagueCoefficient {
  id: string; league: string; season: number;
  coefficient_score: number; cumulative_coefficient: number;
  cl_spots_next_season: number;
}

export interface PlayerBadge {
  id: string; player_id: string; badge_type: BadgeType;
  season?: number; description?: string; awarded_at: string;
  player?: Player;
}

export interface RatingHistory {
  id: string; player_id: string; game_id?: string; season?: number;
  rating: number; rating_deviation: number; volatility: number;
  change: number; recorded_at: string;
}

export interface ChampionsLeagueEntry {
  id: string; season: number; player_id: string; from_league: string;
  seeding_pot: number; cl_group?: string; domestic_finish: number;
  group_points: number; group_wins: number; group_draws: number; group_losses: number;
  group_position?: number; advanced_from_group: boolean;
  reached_semifinal: boolean; reached_final: boolean; won_cl: boolean;
  coefficient_contribution: number;
  player?: Player;
}

export interface Notification {
  id: string; player_id: string; type: NotificationType;
  title: string; message: string; is_read: boolean;
  game_id?: string; created_at: string;
}

export interface SeasonDraft {
  id: string; season: number; player_id: string;
  draft_position: number; assigned_league: string;
  seed_rating_at_draft?: number; is_returning?: boolean;
  previous_league?: string;
  created_at: string;
  player?: Player;
}

export interface CasualChallenge {
  id: string;
  challenger_id: string; challenged_id?: string;
  time_control: string; is_rated: boolean;
  color_preference?: 'white' | 'black' | 'random';
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  game_id?: string;
  expires_at: string; created_at: string;
  challenger?: Player; challenged?: Player;
}

// ── UI Metadata ─────────────────────────────────────────────────────────────

export const BADGE_META: Record<BadgeType, { label: string; icon: string; description: string; color: string }> = {
  pioneer_s1:                  { label: 'Season 1 Pioneer',        icon: '⭐', description: 'Registered in the founding season',       color: '#ffd700' },
  league_champion:             { label: 'League Champion',          icon: '🏆', description: 'Won your league',                          color: '#d4a843' },
  cl_winner:                   { label: 'CL Champion',              icon: '👑', description: 'Won the SS4 Champions League',            color: '#ffd700' },
  cl_runner_up:                { label: 'CL Runner-Up',             icon: '🥈', description: 'Finalist in the Champions League',       color: '#c0c0c0' },
  group_top_scorer:            { label: 'Group Top Scorer',         icon: '🎯', description: 'Most CL group stage points',              color: '#60a5fa' },
  giant_killer:                { label: 'Giant Killer',             icon: '⚡', description: 'Defeated a player rated 300+ above',     color: '#a78bfa' },
  unbeaten_season:             { label: 'Unbeaten Season',          icon: '🛡️', description: 'Undefeated through league phase',       color: '#34d399' },
  century_club:                { label: 'Century Club',             icon: '💯', description: 'Played 100 league games',                color: '#e879f9' },
  scel_winner:                 { label: 'SCEL Champion',            icon: '⚔️', description: 'Won the SS4 Chess Elimination League',  color: '#facc15' },
  newcomer_shield_winner:      { label: 'Newcomer Shield',          icon: '🆕', description: 'Won the Newcomer Shield',                color: '#4ade80' },
  continental_shield_winner:   { label: 'Continental Shield',       icon: '🌍', description: 'Won the Continental Shield',            color: '#38bdf8' },
  blitz_invitational_winner:   { label: 'Blitz King',               icon: '⚡', description: 'Won the Blitz Invitational',            color: '#facc15' },
};

export const LEAGUE_IDENTITY: Record<string, { name: string; tagline: string; accent: string; bg: string }> = {
  league_1: { name: 'League 1', tagline: 'Aggressive · Tactical · Uncompromising', accent: '#d4a843', bg: '#0d1b2a' },
  league_2: { name: 'League 2', tagline: 'Dynamic · Strategic · Relentless',       accent: '#b0b8c1', bg: '#6b1a1a' },
  league_3: { name: 'League 3', tagline: 'Calculated · Precise · Unyielding',      accent: '#60a5fa', bg: '#1e3a5f' },
  league_4: { name: 'League 4', tagline: 'Bold · Creative · Fearless',             accent: '#34d399', bg: '#0d3320' },
  champions_league: { name: 'Champions League', tagline: 'Only the Best. Only the Brave.', accent: '#f5c842', bg: '#050810' },
  scel: { name: 'SCEL', tagline: 'Every Game is Life or Death',                     accent: '#facc15', bg: '#1a1a0a' },
};
// SS4 Chess League — Complete TypeScript Types

export type League = 'league_1'|'league_2'|'league_3'|'league_4'|'league_5'|'league_6';
export type Tier = 'premier'|'development'|'reserve'|'unassigned';
export type GameResult = '1-0'|'0-1'|'0.5-0.5'|'forfeit_white'|'forfeit_both'|'*';
export type SeasonStatus = 'registration'|'draft'|'active'|'playoffs'|'champions_league'|'complete';
export type CompetitionPhase = 'league_phase'|'playoff_semifinal'|'playoff_final'|'group_stage'|'knockout_semifinal'|'knockout_final'|'armageddon'|'calibration';
export type CompetitionLeague = League|'champions_league'|'continental_shield'|'open_cup'|'blitz'|'newcomer_shield'|'calibration';
export type BadgeType = 'pioneer_s1'|'league_champion'|'cl_winner'|'cl_runner_up'|'group_top_scorer'|'giant_killer'|'unbeaten_season'|'comeback_king'|'top_earner'|'century_club'|'newcomer_shield_winner'|'open_cup_winner'|'continental_shield_winner'|'blitz_invitational_winner'|'best_league_rep';
export type NotificationType = 'fixture_scheduled'|'round_start'|'deadline_reminder'|'result_recorded'|'promotion'|'relegation'|'cl_qualified'|'badge_awarded'|'suspension'|'rating_update';

export interface Player {
  id: string; full_name: string; email: string;
  chess_com_username?: string; lichess_username?: string; whatsapp_number?: string;
  year_started_chess?: number; joining_season: number;
  home_league: League;
  ss4_rating: number; rating_deviation: number; volatility: number;
  is_provisional: boolean; games_played: number;
  seed_rating?: number; seed_source?: string;
  calibration_games_played: number; calibration_complete: boolean;
  season_forfeit_count: number; is_active: boolean; is_suspended: boolean;
  suspension_reason?: string; auth_user_id?: string;
  created_at: string; updated_at: string;
}

export interface Game {
  id: string; season: number; round?: number;
  league: CompetitionLeague; tier?: Tier|'n_a';
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
  is_live: boolean; room_id?: string;
  analysis_json?: AnalysisData; analysis_complete: boolean;
  played_at?: string; created_at: string; updated_at: string;
  white_player?: Player; black_player?: Player;
}

export interface AnalysisData {
  accuracy_white: number; accuracy_black: number;
  centipawn_loss_white: number; centipawn_loss_black: number;
  blunders_white: number; blunders_black: number;
  mistakes_white: number; mistakes_black: number;
  inaccuracies_white: number; inaccuracies_black: number;
  engine_correlation_white: number; engine_correlation_black: number;
  critical_moments: { move_number: number; fen: string; best_move: string; played_move: string; evaluation_before: number; evaluation_after: number }[];
}

export interface Standing {
  id: string; season: number; league: League; tier: Tier; player_id: string;
  points: number; wins: number; draws: number; losses: number;
  forfeits_given: number; games_played: number;
  sonneborn_berger: number; buchholz: number; position?: number;
  cl_qualified: boolean; promoted: boolean; relegated: boolean;
  rating_at_season_start?: number; player?: Player;
}

export interface Season {
  id: number; name: string; start_date: string; end_date?: string; status: SeasonStatus;
  domestic_end_date?: string; playoffs_end_date?: string; cl_start_date?: string; cl_end_date?: string;
  league_1_premier_champion_id?: string; league_2_premier_champion_id?: string;
  cl_winner_id?: string; cl_runner_up_id?: string;
  open_cup_winner_id?: string; continental_shield_winner_id?: string; blitz_invitational_winner_id?: string;
}

export interface LeagueCoefficient {
  id: string; league: League; season: number;
  cl_qualifiers_count: number; qualifiers_points: number; group_stage_points: number;
  semifinal_points: number; final_points: number; winner_bonus: number;
  coefficient_score: number; cumulative_coefficient: number; cl_pot_next_season: number;
}

export interface PlayerBadge {
  id: string; player_id: string; badge_type: BadgeType;
  season?: number; description?: string; awarded_at: string;
  player?: Player;
}

export interface RatingHistory {
  id: string; player_id: string; game_id?: string; season: number;
  rating: number; rating_deviation: number; volatility: number;
  change: number; recorded_at: string;
}

export interface ChampionsLeagueEntry {
  id: string; season: number; player_id: string; from_league: League;
  seeding_pot: 1|2|3; cl_group?: 'A'|'B'|'C'|'D'; domestic_finish: number;
  group_points: number; group_wins: number; group_draws: number; group_losses: number;
  group_position?: number; advanced_from_group: boolean;
  reached_semifinal: boolean; reached_final: boolean; won_cl: boolean;
  coefficient_contribution: number; player?: Player;
}

export interface Notification {
  id: string; player_id: string; type: NotificationType;
  title: string; message: string; is_read: boolean;
  game_id?: string; created_at: string;
}

// ── UI metadata ─────────────────────────────────────────────────────────────
export const BADGE_META: Record<BadgeType, { label: string; icon: string; description: string; color: string }> = {
  pioneer_s1:                  { label: 'Season 1 Pioneer',        icon: '⭐', description: 'Registered in the founding season',       color: '#ffd700' },
  league_champion:             { label: 'League Champion',          icon: '🏆', description: 'Won the Premier Tier',                    color: '#d4a843' },
  cl_winner:                   { label: 'CL Winner',                icon: '👑', description: 'Won the SS4 Champions League',            color: '#ffd700' },
  cl_runner_up:                { label: 'CL Runner-Up',             icon: '🥈', description: 'Finalist in the Champions League',       color: '#c0c0c0' },
  group_top_scorer:            { label: 'Group Top Scorer',         icon: '🎯', description: 'Most CL group stage points',              color: '#60a5fa' },
  giant_killer:                { label: 'Giant Killer',             icon: '⚡', description: 'Defeated a player rated 300+ above',     color: '#a78bfa' },
  unbeaten_season:             { label: 'Unbeaten Season',          icon: '🛡️', description: 'Undefeated through Phase 1',             color: '#34d399' },
  comeback_king:               { label: 'Comeback King',            icon: '🔥', description: 'Promoted after relegation',              color: '#f97316' },
  top_earner:                  { label: 'Top Earner',               icon: '📈', description: 'Best coefficient contributor',           color: '#22d3ee' },
  century_club:                { label: 'Century Club',             icon: '💯', description: 'Played 100 league games',                color: '#e879f9' },
  newcomer_shield_winner:      { label: 'Newcomer Shield',          icon: '🆕', description: 'Won the Newcomer Shield',                color: '#4ade80' },
  open_cup_winner:             { label: 'Open Cup Winner',          icon: '🏅', description: 'Won the SS4 Open Cup',                  color: '#fb923c' },
  continental_shield_winner:   { label: 'Continental Shield',       icon: '🌍', description: 'Won the Continental Shield',            color: '#38bdf8' },
  blitz_invitational_winner:   { label: 'Blitz King',               icon: '⚡', description: 'Won the Blitz Invitational',            color: '#facc15' },
  best_league_rep:             { label: 'League Standard-Bearer',   icon: '🏳️', description: 'Best league rep in CL',               color: '#a3e635' },
};

export const LEAGUE_IDENTITY = {
  league_1: { name: 'League 1', tagline: 'Aggressive · Tactical · Uncompromising', accent: '#d4a843', bg: '#0d1b2a' },
  league_2: { name: 'League 2', tagline: 'Dynamic · Strategic · Relentless',       accent: '#b0b8c1', bg: '#6b1a1a' },
  champions_league: { name: 'Champions League', tagline: 'Only the Best. Only the Brave.', accent: '#f5c842', bg: '#050810' },
};
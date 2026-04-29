/**
 * SS4 Chess League — Snake Draft v2
 *
 * Rules:
 *  - Target league size: LEAGUE_TARGET_SIZE (7)
 *  - Acceptable range: 6–8 players per league
 *  - No tiers — one flat league table per league
 *  - Snake pattern distributes players of similar rating evenly
 *  - Returning players use their end-of-season draft_rating
 *  - New players use seed_rating from calibration
 *  - Draft order for next season: sorted by current season's final standing position,
 *    then by ss4_rating ascending (worst performers pick first = fairer competition)
 */

export const LEAGUE_TARGET_SIZE = 7;
export const LEAGUE_MIN_SIZE    = 6;
export const LEAGUE_MAX_SIZE    = 8;

export const CUP_QUALIFIERS_PER_LEAGUE = 2; // top-2 from each league → Champions Cup

export interface PlayerSeed {
  id: string;
  full_name: string;
  /** For draft sorting: use draft_rating (end-of-season) for returning players,
   *  seed_rating for new players */
  ss4_rating: number;
  rating_deviation: number;
  is_returning?: boolean;
  previous_league?: string;
  previous_position?: number; // league finish last season (for draft order tiebreak)
}

export interface DraftAssignment {
  player_id: string;
  full_name: string;
  seed_rating: number;
  draft_position: number;
  assigned_league: string;
  is_returning: boolean;
  previous_league: string | null;
}

export interface DraftResult {
  assignments: DraftAssignment[];
  leagues: Record<string, DraftAssignment[]>;
  stats: LeagueStat[];
  league_count: number;
}

export interface LeagueStat {
  league: string;
  player_count: number;
  avg_rating: number;
  min_rating: number;
  max_rating: number;
  rating_spread: number;
}

export function leagueName(i: number): string { return `league_${i + 1}`; }

export function leagueDisplayName(key: string): string {
  const map: Record<string, string> = {
    league_1: 'League 1', league_2: 'League 2', league_3: 'League 3',
    league_4: 'League 4', league_5: 'League 5', league_6: 'League 6',
    league_7: 'League 7', league_8: 'League 8',
    champions_cup: 'Champions Cup',
    continental_shield: 'Continental Shield',
    open_cup: 'Open Cup',
    blitz: 'Blitz Invitational',
    newcomer_shield: 'Newcomer Shield',
    casual: 'Casual',
  };
  return map[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Compute optimal league count for n players.
 * Tries to find a count where every league has 6–8 players,
 * as close to 7 as possible.
 */
export function getLeagueCount(n: number): number {
  if (n < LEAGUE_MIN_SIZE) throw new Error(`Need at least ${LEAGUE_MIN_SIZE} players to run a draft`);

  // Try counts from ceil(n/8) to floor(n/6)
  const minLeagues = Math.ceil(n / LEAGUE_MAX_SIZE);
  const maxLeagues = Math.floor(n / LEAGUE_MIN_SIZE);

  let bestCount = minLeagues;
  let bestDeviation = Infinity;

  for (let k = minLeagues; k <= maxLeagues; k++) {
    // With k leagues, sizes will be floor(n/k) or ceil(n/k)
    const base = Math.floor(n / k);
    const remainder = n % k;
    // remainder leagues get (base+1), rest get base
    const maxSize = remainder > 0 ? base + 1 : base;
    const deviation = Math.abs(maxSize - LEAGUE_TARGET_SIZE) +
                      Math.abs(base - LEAGUE_TARGET_SIZE);
    if (deviation < bestDeviation) {
      bestDeviation = deviation;
      bestCount = k;
    }
  }

  return bestCount;
}

/**
 * Main snake draft function.
 *
 * Sort order: best-to-worst rating (highest rated gets first pick position,
 * which means they go into League 1 — the most competitive league).
 * Snake reverses direction each pass so every league gets a balanced spread.
 */
export function runSnakeDraft(players: PlayerSeed[]): DraftResult {
  if (players.length < LEAGUE_MIN_SIZE) {
    throw new Error(`Need at least ${LEAGUE_MIN_SIZE} players to draft`);
  }

  const leagueCount = getLeagueCount(players.length);

  // Sort best → worst rating for draft order
  const sorted = [...players].sort((a, b) => {
    // Primary: rating descending
    const ratingDiff = b.ss4_rating - a.ss4_rating;
    if (Math.abs(ratingDiff) > 1) return ratingDiff;
    // Tiebreak: returning players with better previous finish pick first
    const ap = a.previous_position ?? 999;
    const bp = b.previous_position ?? 999;
    return ap - bp;
  });

  // Snake fill: forward pass then reverse, alternating
  const buckets: PlayerSeed[][] = Array.from({ length: leagueCount }, () => []);
  let direction = 1;
  let li = 0;

  for (const player of sorted) {
    buckets[li].push(player);
    const atEnd = direction === 1 ? li === leagueCount - 1 : li === 0;
    if (atEnd) {
      direction *= -1;
    } else {
      li += direction;
    }
  }

  // Build assignments
  const assignments: DraftAssignment[] = [];
  for (let i = 0; i < leagueCount; i++) {
    const key = leagueName(i);
    for (const p of buckets[i]) {
      const draftPos = sorted.findIndex(x => x.id === p.id) + 1;
      assignments.push({
        player_id:       p.id,
        full_name:       p.full_name,
        seed_rating:     p.ss4_rating,
        draft_position:  draftPos,
        assigned_league: key,
        is_returning:    p.is_returning ?? false,
        previous_league: p.previous_league ?? null,
      });
    }
  }

  assignments.sort((a, b) => a.draft_position - b.draft_position);

  // Build per-league map
  const leagues: DraftResult['leagues'] = {};
  for (let i = 0; i < leagueCount; i++) {
    const key = leagueName(i);
    leagues[key] = assignments.filter(a => a.assigned_league === key);
  }

  // Compute stats
  const stats: LeagueStat[] = Array.from({ length: leagueCount }, (_, i) => {
    const key = leagueName(i);
    const group = leagues[key];
    const ratings = group.map(a => a.seed_rating);
    const avg = Math.round(ratings.reduce((s, r) => s + r, 0) / ratings.length);
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    return {
      league:        key,
      player_count:  group.length,
      avg_rating:    avg,
      min_rating:    Math.round(min),
      max_rating:    Math.round(max),
      rating_spread: Math.round(max - min),
    };
  });

  return { assignments, leagues, stats, league_count: leagueCount };
}

/**
 * Verify that no two leagues have avg ratings more than 150 apart.
 * A tighter threshold than before since we have no tiers as buffer.
 */
export function checkLeagueBalance(stats: LeagueStat[]): {
  balanced: boolean;
  worst_gap: number;
  details: string;
} {
  let worstGap = 0;
  let worstPair = '';

  for (let i = 0; i < stats.length; i++) {
    for (let j = i + 1; j < stats.length; j++) {
      const gap = Math.abs(stats[i].avg_rating - stats[j].avg_rating);
      if (gap > worstGap) {
        worstGap = gap;
        worstPair = `${stats[i].league} vs ${stats[j].league}`;
      }
    }
  }

  return {
    balanced:  worstGap <= 150,
    worst_gap: Math.round(worstGap),
    details:   worstGap <= 150
      ? `All leagues balanced (max gap: ${Math.round(worstGap)} pts)`
      : `⚠ ${worstPair} gap: ${Math.round(worstGap)} pts — consider manual review`,
  };
}

/**
 * Generate round-robin fixture pairs for a league.
 * Uses Berger tables (circle method) for an even schedule.
 * Returns rounds array, each round containing [white_id, black_id] pairs.
 */
export function generateRoundRobin(playerIds: string[]): [string, string][][] {
  const n = playerIds.length;
  const ids = [...playerIds];

  // If odd number, add a bye placeholder
  if (n % 2 !== 0) ids.push('BYE');

  const rounds: [string, string][][] = [];
  const half = ids.length / 2;

  for (let round = 0; round < ids.length - 1; round++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < half; i++) {
      const white = ids[i];
      const black = ids[ids.length - 1 - i];
      if (white !== 'BYE' && black !== 'BYE') {
        // Alternate colors by round to balance white/black assignments
        if (round % 2 === 0) pairs.push([white, black]);
        else                 pairs.push([black, white]);
      }
    }
    rounds.push(pairs);

    // Rotate: fix position 0, rotate rest clockwise
    const last = ids.pop()!;
    ids.splice(1, 0, last);
  }

  return rounds;
}
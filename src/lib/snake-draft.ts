/**
 * SS4 Chess League — Snake Draft & League Assignment
 *
 * Snake pattern for 2 leagues:
 *  1→L1, 2→L2, 3→L2, 4→L1, 5→L1, 6→L2 …
 * This ensures every league has a nearly equal rating distribution.
 */

export interface PlayerSeed {
  id: string;
  full_name: string;
  ss4_rating: number;
  rating_deviation: number;
}
export interface DraftAssignment {
  player_id: string;
  full_name: string;
  seed_rating: number;
  draft_position: number;
  assigned_league: string;
  assigned_tier: string;
}
export interface DraftResult {
  assignments: DraftAssignment[];
  leagues: Record<string, { premier: DraftAssignment[]; development: DraftAssignment[] }>;
  stats: { league: string; premier_avg_rating: number; development_avg_rating: number; overall_avg_rating: number; player_count: number }[];
}

export function getLeagueCount(n: number) {
  if (n <= 30) return 2; if (n <= 45) return 3; if (n <= 65) return 4; if (n <= 90) return 5; return 6;
}
export function leagueName(i: number) { return `league_${i + 1}`; }
export function leagueDisplayName(key: string) {
  const map: Record<string, string> = {
    league_1: 'League 1', league_2: 'League 2', league_3: 'League 3',
    league_4: 'League 4', league_5: 'League 5', league_6: 'League 6',
    champions_league: 'Champions League', continental_shield: 'Continental Shield',
    open_cup: 'Open Cup', blitz: 'Blitz Invitational', newcomer_shield: 'Newcomer Shield',
  };
  return map[key] || key;
}

export function runSnakeDraft(players: PlayerSeed[]): DraftResult {
  if (players.length < 2) throw new Error('Need at least 2 players');
  const leagueCount = getLeagueCount(players.length);
  const playersPerLeague = Math.ceil(players.length / leagueCount);
  const premierSize = Math.ceil(playersPerLeague / 2);
  const sorted = [...players].sort((a, b) => b.ss4_rating - a.ss4_rating);

  const buckets: PlayerSeed[][] = Array.from({ length: leagueCount }, () => []);
  let dir = 1, li = 0;

  for (const player of sorted) {
    buckets[li].push(player);
    if (dir === 1) { li === leagueCount - 1 ? (dir = -1) : li++; }
    else           { li === 0             ? (dir =  1) : li--; }
  }

  const assignments: DraftAssignment[] = [];
  for (let i = 0; i < leagueCount; i++) {
    const key = leagueName(i);
    buckets[i].forEach((p, pi) => {
      assignments.push({
        player_id: p.id,
        full_name: p.full_name,
        seed_rating: p.ss4_rating,
        draft_position: sorted.findIndex(x => x.id === p.id) + 1,
        assigned_league: key,
        assigned_tier: pi < premierSize ? 'premier' : 'development',
      });
    });
  }

  assignments.sort((a, b) => a.draft_position - b.draft_position);

  const leagues: DraftResult['leagues'] = {};
  for (let i = 0; i < leagueCount; i++) {
    const key = leagueName(i);
    leagues[key] = {
      premier: assignments.filter(a => a.assigned_league === key && a.assigned_tier === 'premier'),
      development: assignments.filter(a => a.assigned_league === key && a.assigned_tier === 'development'),
    };
  }

  const avg = (arr: DraftAssignment[]) =>
    arr.length ? Math.round(arr.reduce((s, a) => s + a.seed_rating, 0) / arr.length) : 0;

  const stats = Array.from({ length: leagueCount }, (_, i) => {
    const key = leagueName(i);
    const all = assignments.filter(a => a.assigned_league === key);
    return {
      league: key,
      premier_avg_rating: avg(all.filter(a => a.assigned_tier === 'premier')),
      development_avg_rating: avg(all.filter(a => a.assigned_tier === 'development')),
      overall_avg_rating: avg(all),
      player_count: all.length,
    };
  });

  return { assignments, leagues, stats };
}

export function checkLeagueImbalance(stats: DraftResult['stats']) {
  for (let i = 0; i < stats.length; i++) {
    for (let j = i + 1; j < stats.length; j++) {
      const diff = Math.abs(stats[i].premier_avg_rating - stats[j].premier_avg_rating);
      if (diff > 200) {
        return { imbalanced: true, details: `${stats[i].league} vs ${stats[j].league}: ${diff} pts apart` };
      }
    }
  }
  return { imbalanced: false, details: 'Balanced' };
}

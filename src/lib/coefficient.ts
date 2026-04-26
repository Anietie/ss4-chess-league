export interface CLPlayerResult {
  player_id: string; from_league: string;
  qualified: boolean; advanced_from_group: boolean;
  reached_semifinal: boolean; reached_final: boolean; won_cl: boolean;
}

export interface LeagueCoefficientUpdate {
  league: string;
  qualifiers_points: number; group_stage_points: number;
  semifinal_points: number; final_points: number; winner_bonus: number;
  coefficient_score: number;
}

const POINTS = { qualifier: 1, group_advance: 2, semifinal: 3, final: 4, winner: 5 };

export function calculateLeagueCoefficients(results: CLPlayerResult[]): LeagueCoefficientUpdate[] {
  const map = new Map<string, LeagueCoefficientUpdate>();

  for (const r of results) {
    if (!map.has(r.from_league)) {
      map.set(r.from_league, { league: r.from_league, qualifiers_points: 0, group_stage_points: 0, semifinal_points: 0, final_points: 0, winner_bonus: 0, coefficient_score: 0 });
    }
    const lc = map.get(r.from_league)!;
    if (r.qualified)            lc.qualifiers_points  += POINTS.qualifier;
    if (r.advanced_from_group)  lc.group_stage_points += POINTS.group_advance;
    if (r.reached_semifinal)    lc.semifinal_points   += POINTS.semifinal;
    if (r.reached_final)        lc.final_points       += POINTS.final;
    if (r.won_cl)               lc.winner_bonus       += POINTS.winner;
  }

  for (const [, lc] of map) {
    lc.coefficient_score = lc.qualifiers_points + lc.group_stage_points + lc.semifinal_points + lc.final_points + lc.winner_bonus;
  }

  return [...map.values()].sort((a, b) => b.coefficient_score - a.coefficient_score);
}

export function processPromotionRelegation(
  premier: { player_id: string; position: number }[],
  development: { player_id: string; position: number }[],
  league: string,
  playoffWinnerId?: string
) {
  const ps = [...premier].sort((a, b) => a.position - b.position);
  const ds = [...development].sort((a, b) => a.position - b.position);

  const relegated = ps.slice(-2)
    .filter(p => p.player_id !== playoffWinnerId)
    .map(p => ({ player_id: p.player_id, from_tier: 'premier', to_tier: 'development', league }));

  const promoted = ds.slice(0, 2)
    .map(p => ({ player_id: p.player_id, from_tier: 'development', to_tier: 'premier', league }));

  return { promoted, relegated };
}
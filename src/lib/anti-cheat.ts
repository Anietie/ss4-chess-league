export interface AntiCheatResult {
  player_id: string;
  game_id: string;
  move_count: number;
  top1_matches: number;     // moves matching Stockfish #1 best
  top3_matches: number;     // moves in Stockfish top 3
  avg_centipawn_loss: number;
  correlation_score: number; // 0-100; higher = more engine-like
  flag: boolean;             // true if score >= THRESHOLD
  verdict: string;
}
 
const THRESHOLD = 75; // flag if correlation >= 75
 
/**
 * Computes engine correlation score from analysis_json.
 * analysis_json structure expected: array of { ply, score, bestMove, top3: string[] }
 * actualMoves: array of UCI moves in order
 */
export function computeCorrelationScore(
  actualMoves: string[],
  analysisJson: { ply: number; bestMove: string; top3?: string[]; score: number }[],
  playingSide: 'white' | 'black',
  player_id: string,
  game_id: string,
): AntiCheatResult {
  // Filter to only the plies where this player moved
  const playerPlies = analysisJson.filter(a => {
    const isWhiteMove = a.ply % 2 === 1;
    return playingSide === 'white' ? isWhiteMove : !isWhiteMove;
  });
 
  if (!playerPlies.length) {
    return { player_id, game_id, move_count: 0, top1_matches: 0, top3_matches: 0, avg_centipawn_loss: 0, correlation_score: 0, flag: false, verdict: 'insufficient_data' };
  }
 
  let top1 = 0, top3 = 0, totalCPL = 0;
 
  for (const entry of playerPlies) {
    const moveIndex = Math.floor((entry.ply - 1) / 2);
    const actualMove = actualMoves[moveIndex];
    if (!actualMove) continue;
 
    if (actualMove === entry.bestMove) top1++;
    if (entry.top3?.includes(actualMove)) top3++;
 
    // Centipawn loss: score before minus score after (from player's perspective)
    // Simplified: compare against next entry
    const nextEntry = analysisJson.find(a => a.ply === entry.ply + 2);
    if (nextEntry) {
      const cpl = Math.abs(entry.score - nextEntry.score);
      totalCPL += Math.min(cpl, 300); // cap at 300cp to reduce outlier noise
    }
  }
 
  const n = playerPlies.length;
  const top1Pct = (top1 / n) * 100;
  const top3Pct = (top3 / n) * 100;
  const avgCPL  = n > 0 ? totalCPL / n : 999;
 
  // Weighted score: top1 match rate most important, CPL inversely
  const cplScore = Math.max(0, 100 - avgCPL / 2);
  const correlation_score = Math.round(top1Pct * 0.5 + top3Pct * 0.25 + cplScore * 0.25);
 
  const flag = correlation_score >= THRESHOLD && n >= 10; // need at least 10 moves
 
  let verdict = 'clean';
  if (flag) verdict = correlation_score >= 90 ? 'strong_suspicion' : 'elevated_correlation';
  else if (n < 10) verdict = 'insufficient_moves';
 
  return { player_id, game_id, move_count: n, top1_matches: top1, top3_matches: top3, avg_centipawn_loss: Math.round(avgCPL), correlation_score, flag, verdict };
}
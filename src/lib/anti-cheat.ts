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
  // Build a ply → entry map for O(1) lookup
  const byPly = new Map(analysisJson.map(a => [a.ply, a]));

  // Filter to only the plies where this player moved.
  // White moves on odd plies (1, 3, 5…), Black on even plies (2, 4, 6…).
  const playerEntries = analysisJson.filter(a => {
    if (a.ply === 0) return false; // ply 0 is the start position, no move made yet
    const isWhiteMove = a.ply % 2 === 1;
    return playingSide === 'white' ? isWhiteMove : !isWhiteMove;
  });

  if (!playerEntries.length) {
    return {
      player_id, game_id, move_count: 0, top1_matches: 0, top3_matches: 0,
      avg_centipawn_loss: 0, correlation_score: 0, flag: false,
      verdict: 'insufficient_data',
    };
  }

  let top1 = 0, top3 = 0, totalCPL = 0, cplCount = 0;

  for (const entry of playerEntries) {
    // The actual move index in the UCI move list:
    // White's 1st move = actualMoves[0], Black's 1st = actualMoves[1], etc.
    const moveIndex = entry.ply - 1;
    const actualMove = actualMoves[moveIndex];
    if (!actualMove) continue;

    if (actualMove === entry.bestMove) top1++;
    if (entry.top3?.includes(actualMove)) top3++;

    // Centipawn loss = (engine's best eval before the move) – (actual eval after the move)
    // "before" is at ply-1 (the position before the player moved)
    // "after" is at ply (the position after the player moved)
    //
    // Both scores are from White's perspective, so we adjust sign per side:
    //   White wants score to INCREASE → CPL = score[ply-1] – score[ply]
    //   Black wants score to DECREASE → CPL = score[ply] – score[ply-1]
    const before = byPly.get(entry.ply - 1);
    if (before !== undefined) {
      const rawCPL = playingSide === 'white'
        ? before.score - entry.score       // white wants positive → high score
        : entry.score - before.score;      // black wants negative → low score
      const cpl = Math.max(0, Math.min(rawCPL, 500)); // cap outliers at 500cp
      totalCPL += cpl;
      cplCount++;
    }
  }

  const n = playerEntries.length;
  const top1Pct   = (top1 / n) * 100;
  const top3Pct   = (top3 / n) * 100;
  const avgCPL    = cplCount > 0 ? totalCPL / cplCount : 999;

  // Weighted correlation score:
  //   50% — top-1 match rate (strongest cheat signal)
  //   25% — top-3 match rate (catches engines with slight randomisation)
  //   25% — inverse CPL (cheaters have near-zero CPL)
  const cplScore = Math.max(0, 100 - avgCPL / 3);  // 0cp → 100, 300cp → 0
  const correlation_score = Math.round(top1Pct * 0.5 + top3Pct * 0.25 + cplScore * 0.25);

  // Require at least 10 moves to avoid false positives on very short games
  const flag = correlation_score >= THRESHOLD && n >= 10;

  let verdict = 'clean';
  if (n < 10)   verdict = 'insufficient_moves';
  else if (flag) verdict = correlation_score >= 90 ? 'strong_suspicion' : 'elevated_correlation';

  return {
    player_id, game_id, move_count: n,
    top1_matches: top1, top3_matches: top3,
    avg_centipawn_loss: Math.round(avgCPL),
    correlation_score, flag, verdict,
  };
}
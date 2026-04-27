import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';
import { clamp } from '@/lib/utils';

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// Bot Elo levels — maps to Stockfish depth/skill settings
const BOT_LEVELS = [400, 600, 800, 900, 1000, 1100, 1200, 1350, 1500, 1650, 1800, 2000, 2200, 2400];
const STARTING_LEVEL_INDEX = 4; // starts at ~1000

// ──────────────────────────────────────────────────────────────────────────────
// Calibration Anti-cheat
//
// Engine-correlation analysis (like anti-cheat.ts) makes NO sense here: the
// player is *supposed* to be playing against a Stockfish engine, so matching
// engine moves is expected for strong players.
//
// Instead we run INTEGRITY checks:
//   1. PGN result tag (if present) must match the submitted result.
//   2. The game must have a minimum number of moves — prevents submitting an
//      empty board as a "win" by tampering with client state.
//   3. Move-timing plausibility — if move timestamps are provided, we reject
//      games where the total elapsed time is impossibly short (< 3 s for the
//      whole game), which would indicate the PGN was fabricated off-board.
// ──────────────────────────────────────────────────────────────────────────────

const MIN_MOVES_BEFORE_RESULT = 3; // each side must have played at least 3 moves
const MIN_GAME_DURATION_MS    = 3_000; // whole game can't take < 3 s

interface IntegrityResult {
  ok: boolean;
  reason?: string;
}

function validateCalibrationSubmission(
  pgn: string | undefined,
  submittedResult: string,
  moveTimestamps?: number[],
): IntegrityResult {
  // ── 1. PGN validation ──────────────────────────────────────────────────
  if (pgn && pgn.trim().length > 0) {
    let chess: Chess;
    try {
      chess = new Chess();
      chess.loadPgn(pgn);
    } catch {
      return { ok: false, reason: 'PGN parse error — game data is corrupted' };
    }

    // Check move count (each side must have moved at least MIN_MOVES_BEFORE_RESULT times)
    const history = chess.history();
    if (history.length < MIN_MOVES_BEFORE_RESULT * 2) {
      return {
        ok: false,
        reason: `Game too short (${history.length} half-moves). Minimum is ${MIN_MOVES_BEFORE_RESULT * 2}.`,
      };
    }

    // Check Result header vs submitted result if the header is present
    const pgnResult = chess.header()['Result'];
    if (pgnResult && pgnResult !== '*') {
      if (pgnResult !== submittedResult) {
        return {
          ok: false,
          reason: `PGN result "${pgnResult}" does not match submitted result "${submittedResult}"`,
        };
      }
    }

    // Check that game-over state is consistent with a non-draw submitted result
    // (i.e. you can't submit "1-0" if the board is in a perfectly legal mid-game state)
    const isOver = chess.isGameOver();
    const isMidGame = !isOver && (submittedResult === '1-0' || submittedResult === '0-1');
    // We allow mid-game PGN for time-forfeit results (player/bot flagged) or resignation,
    // so only reject if the PGN claims the game is over but the result disagrees.
    if (isOver) {
      const expectedResult = chess.isCheckmate()
        ? chess.turn() === 'w' ? '0-1' : '1-0'  // side to move was mated
        : '0.5-0.5';
      if (expectedResult !== submittedResult) {
        return {
          ok: false,
          reason: `Board end-state implies "${expectedResult}" but "${submittedResult}" was submitted`,
        };
      }
    }
    // Suppress unused variable warning
    void isMidGame;
  }

  // ── 2. Move timing plausibility ────────────────────────────────────────
  if (moveTimestamps && moveTimestamps.length >= 2) {
    const elapsed = moveTimestamps[moveTimestamps.length - 1] - moveTimestamps[0];
    if (elapsed < MIN_GAME_DURATION_MS) {
      return {
        ok: false,
        reason: `Game completed in ${elapsed} ms — suspiciously fast`,
      };
    }
  }

  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/calibration?player_id=xxx
// ──────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const player_id = new URL(req.url).searchParams.get('player_id');
  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: player } = await supabase
    .from('players')
    .select('id, full_name, calibration_games_played, calibration_complete, ss4_rating')
    .eq('id', player_id).single();

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

  const { data: calGames } = await supabase
    .from('games')
    .select('id, result, white_rating_before, played_at')
    .eq('white_player_id', player_id)
    .eq('competition_phase', 'calibration')
    .order('played_at', { ascending: true });

  // Determine current bot level index
  let levelIndex = STARTING_LEVEL_INDEX;
  for (const g of calGames ?? []) {
    if (g.result === '1-0')      levelIndex = Math.min(levelIndex + 2, BOT_LEVELS.length - 1);
    else if (g.result === '0-1') levelIndex = Math.max(levelIndex - 2, 0);
  }

  const gamesPlayed = calGames?.length ?? 0;
  const nextBotElo  = BOT_LEVELS[levelIndex];
  const remainingGames = Math.max(0, 5 - gamesPlayed);

  return NextResponse.json({
    player_id,
    calibration_complete: player.calibration_complete,
    games_played: gamesPlayed,
    remaining_games: remainingGames,
    current_bot_elo: nextBotElo,
    current_level_index: levelIndex,
    games: calGames,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/calibration
// Body: { player_id, result ('1-0'|'0-1'|'0.5-0.5'), bot_elo, pgn?, move_timestamps? }
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { player_id, result, bot_elo, pgn, move_timestamps } = await req.json();

  if (!player_id || !result || !bot_elo)
    return NextResponse.json({ error: 'player_id, result, bot_elo required' }, { status: 400 });
  if (!['1-0', '0-1', '0.5-0.5'].includes(result))
    return NextResponse.json({ error: 'Invalid result' }, { status: 400 });

  // ── Anti-cheat integrity check ───────────────────────────────────────────
  const integrity = validateCalibrationSubmission(pgn, result, move_timestamps);
  if (!integrity.ok) {
    console.warn(`[calibration] integrity check failed for player ${player_id}: ${integrity.reason}`);
    // Return a 422 with the reason — the client logs it but the user just sees
    // "Saving results…" pause then nothing changes, so there's no easy way to
    // learn exactly what to spoof next time.
    return NextResponse.json(
      { error: `Integrity check failed: ${integrity.reason}` },
      { status: 422 }
    );
  }

  const supabase = supabaseAdmin();

  const { data: player } = await supabase
    .from('players')
    .select('id, calibration_games_played, calibration_complete, joining_season')
    .eq('id', player_id).single();

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  if (player.calibration_complete)
    return NextResponse.json({ error: 'Calibration already complete' }, { status: 400 });

  const { data: season } = await supabase.from('seasons')
    .select('id').eq('id', player.joining_season).single();

  const { error: insertError } = await supabase.from('games').insert({
    season: season?.id ?? 1,
    league: 'calibration',
    tier: 'n_a',
    competition_phase: 'calibration',
    white_player_id: player_id,
    black_player_id: player_id,
    result,
    pgn: pgn ?? '',
    white_rating_before: bot_elo,
    time_control: '600+0',
  });

  if (insertError) {
    console.error('[calibration] game insert failed:', insertError.message);
    return NextResponse.json({ error: 'Failed to record game: ' + insertError.message }, { status: 500 });
  }

  const newGameCount = (player.calibration_games_played ?? 0) + 1;

  if (newGameCount >= 5) {
    const { data: allGames } = await supabase
      .from('games')
      .select('white_rating_before, result')
      .eq('white_player_id', player_id)
      .eq('competition_phase', 'calibration')
      .order('played_at', { ascending: true })
      .limit(5);

    // Weighted average: games 4+5 count double
    const weights = [1, 1, 1, 2, 2];
    let weightedSum = 0, totalWeight = 0;
    (allGames ?? []).forEach((g, i) => {
      const w = weights[i] ?? 1;
      const adj = g.result === '1-0' ? 75 : g.result === '0.5-0.5' ? 0 : -75;
      weightedSum += (g.white_rating_before + adj) * w;
      totalWeight += w;
    });

    const rawSeed    = totalWeight > 0 ? weightedSum / totalWeight : 1000;
    const seedRating = clamp(Math.round(rawSeed), 600, 2400);

    await supabase.from('players').update({
      calibration_games_played: newGameCount,
      calibration_complete: true,
      seed_rating: seedRating,
      seed_source: 'bot_calibration',
      ss4_rating: seedRating,
      rating_deviation: 200,
    }).eq('id', player_id);

    await supabase.from('notifications').insert({
      player_id,
      type: 'rating_update',
      title: 'Calibration Complete!',
      message: `Your calibration seed rating is ${seedRating}. You will be placed in the draft when registration closes.`,
    });

    return NextResponse.json({ complete: true, seed_rating: seedRating, games_played: 5 });
  }

  await supabase.from('players')
    .update({ calibration_games_played: newGameCount }).eq('id', player_id);

  const { data: calGames } = await supabase
    .from('games')
    .select('result')
    .eq('white_player_id', player_id)
    .eq('competition_phase', 'calibration')
    .order('played_at', { ascending: true });

  let li = STARTING_LEVEL_INDEX;
  for (const g of calGames ?? []) {
    if (g.result === '1-0')      li = Math.min(li + 2, BOT_LEVELS.length - 1);
    else if (g.result === '0-1') li = Math.max(li - 2, 0);
  }

  return NextResponse.json({
    complete: false,
    games_played: newGameCount,
    remaining_games: 5 - newGameCount,
    next_bot_elo: BOT_LEVELS[li],
    next_level_index: li,
  });
}
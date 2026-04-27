import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';
import { computeCorrelationScore } from '@/lib/anti-cheat';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/games/[id]/anticheat
//
// Called by the play page immediately after a game ends.
// Body: { analysis_json: AnalysisEntry[] }
//   where AnalysisEntry = { ply, score, bestMove, top3: string[] }
//
// Saves analysis_json to the games table, then immediately runs the
// engine-correlation check so results are ready for admin review.
//
// No admin secret required — any authenticated player can submit analysis
// for a game they participated in (the DB row is checked for that).
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { analysis_json } = await req.json();

  if (!Array.isArray(analysis_json) || analysis_json.length === 0)
    return NextResponse.json(
      { error: 'analysis_json must be a non-empty array' },
      { status: 400 },
    );

  // Basic structure check — each entry must have ply, score, bestMove
  const valid = analysis_json.every(
    (e: any) =>
      typeof e.ply === 'number' &&
      typeof e.score === 'number' &&
      typeof e.bestMove === 'string',
  );
  if (!valid)
    return NextResponse.json(
      { error: 'Malformed analysis_json entries' },
      { status: 400 },
    );

  const supabase = adminSupabase();

  const { data: game } = await supabase
    .from('games')
    .select('id, pgn, result, white_player_id, black_player_id, competition_phase')
    .eq('id', id)
    .single();

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  if (!game.pgn) return NextResponse.json({ error: 'No PGN recorded' }, { status: 400 });

  // Calibration games are excluded from engine-correlation anti-cheat
  // (players are *supposed* to match Stockfish in calibration).
  if (game.competition_phase === 'calibration') {
    return NextResponse.json({
      skipped: true,
      reason: 'Calibration games are excluded from engine-correlation analysis',
    });
  }

  // Persist the analysis
  await supabase
    .from('games')
    .update({ analysis_json, analysis_complete: true })
    .eq('id', id);

  // ── Run correlation check immediately ──────────────────────────────────────
  const chess = new Chess();
  chess.loadPgn(game.pgn);
  const moves = chess
    .history({ verbose: true })
    .map((m) => m.from + m.to + (m.promotion ?? ''));

  const whiteResult = computeCorrelationScore(
    moves,
    analysis_json,
    'white',
    game.white_player_id,
    game.id,
  );
  const blackResult = computeCorrelationScore(
    moves,
    analysis_json,
    'black',
    game.black_player_id,
    game.id,
  );

  await supabase
    .from('games')
    .update({
      white_anticheat_score: whiteResult.correlation_score,
      black_anticheat_score: blackResult.correlation_score,
      anticheat_flagged: whiteResult.flag || blackResult.flag,
    })
    .eq('id', id);

  if (whiteResult.flag || blackResult.flag) {
    const flaggedId = whiteResult.flag
      ? game.white_player_id
      : game.black_player_id;
    await supabase.from('notifications').insert({
      player_id: flaggedId,
      type: 'admin_action',
      title: 'Game Under Review',
      message:
        'Your recent game has been flagged for manual review by the League Officer. No action has been taken yet.',
    });
  }

  return NextResponse.json({
    saved: true,
    white: whiteResult,
    black: blackResult,
    flagged: whiteResult.flag || blackResult.flag,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/games/[id]/anticheat
//
// Admin-only endpoint.
// Re-runs the correlation check against already-stored analysis_json.
// Useful for re-scoring after threshold tweaks or manual re-analysis.
// ──────────────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = adminSupabase();

  const { data: game } = await supabase
    .from('games')
    .select('id, pgn, result, analysis_json, white_player_id, black_player_id')
    .eq('id', id)
    .single();

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  if (!game.pgn)          return NextResponse.json({ error: 'No PGN recorded' }, { status: 400 });
  if (!game.analysis_json)
    return NextResponse.json(
      { error: 'No analysis data — analysis has not been submitted for this game yet' },
      { status: 400 },
    );

  const chess = new Chess();
  chess.loadPgn(game.pgn);
  const moves = chess
    .history({ verbose: true })
    .map((m) => m.from + m.to + (m.promotion ?? ''));

  const whiteResult = computeCorrelationScore(
    moves,
    game.analysis_json,
    'white',
    game.white_player_id,
    game.id,
  );
  const blackResult = computeCorrelationScore(
    moves,
    game.analysis_json,
    'black',
    game.black_player_id,
    game.id,
  );

  // Persist refreshed scores
  await supabase
    .from('games')
    .update({
      white_anticheat_score: whiteResult.correlation_score,
      black_anticheat_score: blackResult.correlation_score,
      anticheat_flagged: whiteResult.flag || blackResult.flag,
    })
    .eq('id', id);

  if (whiteResult.flag || blackResult.flag) {
    const flaggedId = whiteResult.flag
      ? game.white_player_id
      : game.black_player_id;
    await supabase.from('notifications').insert({
      player_id: flaggedId,
      type: 'admin_action',
      title: 'Game Under Review',
      message:
        'Your recent game has been flagged for manual review by the League Officer. No action has been taken yet.',
    });
  }

  return NextResponse.json({ white: whiteResult, black: blackResult });
}
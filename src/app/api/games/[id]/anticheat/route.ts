import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';
import { computeCorrelationScore } from '@/lib/anti-cheat';

const adminSupabase = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// 1. Updated type definition for params to use Promise
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Await the params to safely extract the id
  const { id } = await params;

  const supabase = adminSupabase();
  const { data: game } = await supabase.from('games')
    // 3. Use the extracted 'id' here
    .select('id, pgn, result, analysis_json, white_player_id, black_player_id').eq('id', id).single();

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  if (!game.pgn) return NextResponse.json({ error: 'No PGN recorded' }, { status: 400 });
  if (!game.analysis_json) return NextResponse.json({ error: 'No analysis data — run Stockfish analysis first' }, { status: 400 });

  const chess = new Chess();
  chess.loadPgn(game.pgn);
  const moves = chess.history({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? ''));

  const whiteResult = computeCorrelationScore(moves, game.analysis_json, 'white', game.white_player_id, game.id);
  const blackResult = computeCorrelationScore(moves, game.analysis_json, 'black', game.black_player_id, game.id);

  // Store results
  await supabase.from('games').update({
    white_anticheat_score: whiteResult.correlation_score,
    black_anticheat_score: blackResult.correlation_score,
    anticheat_flagged: whiteResult.flag || blackResult.flag,
  }).eq('id', id); // 4. Use the extracted 'id' here as well

  if (whiteResult.flag || blackResult.flag) {
    const flaggedId = whiteResult.flag ? game.white_player_id : game.black_player_id;
    await supabase.from('notifications').insert({
      player_id: flaggedId, type: 'admin_action', title: 'Game Under Review',
      message: 'Your recent game has been flagged for manual review by the League Officer. No action has been taken yet.',
    });
  }

  return NextResponse.json({ white: whiteResult, black: blackResult });
}
import { Chess } from 'chess.js';
 
export interface OpeningEntry {
  eco?: string;
  name: string;
  moves: string;     // first 10 half-moves in SAN
  count: number;
  wins: number;
  draws: number;
  losses: number;
  win_rate: number;
}
 
// ECO code lookup table (abbreviated — extend with full ECO list as needed)
const ECO_NAMES: Record<string, string> = {
  'e2e4': 'King\'s Pawn',
  'e2e4 e7e5': 'Open Game',
  'e2e4 e7e5 g1f3 b8c6 f1c4': 'Italian Game',
  'e2e4 e7e5 g1f3 b8c6 f1b5': 'Ruy Lopez',
  'e2e4 c7c5': 'Sicilian Defence',
  'e2e4 e7e6': 'French Defence',
  'e2e4 c7c6': 'Caro-Kann',
  'd2d4': 'Queen\'s Pawn',
  'd2d4 d7d5 c2c4': 'Queen\'s Gambit',
  'd2d4 g8f6 c2c4 g7g6': 'King\'s Indian Defence',
  'd2d4 g8f6 c2c4 e7e6': 'Nimzo/QID complex',
  'g1f3': 'Reti Opening',
  'c2c4': 'English Opening',
};
 
function identifyOpening(uciMoves: string[]): { name: string; moves: string } {
  const key = uciMoves.slice(0, 5).join(' ');
  for (let len = 5; len > 0; len--) {
    const partial = uciMoves.slice(0, len).join(' ');
    if (ECO_NAMES[partial]) return { name: ECO_NAMES[partial], moves: partial };
  }
  return { name: 'Unknown Opening', moves: uciMoves.slice(0, 3).join(' ') };
}
 
export function buildRepertoire(games: { pgn: string; result: string; white_player_id: string }[], player_id: string): OpeningEntry[] {
  const map: Record<string, OpeningEntry> = {};
 
  for (const game of games) {
    if (!game.pgn) continue;
    try {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      const verboseMoves = chess.history({ verbose: true });
      const uciMoves = verboseMoves.map(m => m.from + m.to);
      const isWhite = game.white_player_id === player_id;
 
      // Take player's side moves for first 10 half-moves
      const playerMoves = uciMoves.filter((_, i) => isWhite ? i % 2 === 0 : i % 2 === 1).slice(0, 5);
      const { name, moves } = identifyOpening(isWhite ? uciMoves.slice(0, 6) : ['...', ...uciMoves.slice(0, 6)]);
 
      const key = moves;
      if (!map[key]) map[key] = { name, moves, count: 0, wins: 0, draws: 0, losses: 0, win_rate: 0 };
 
      const entry = map[key];
      entry.count++;
 
      const won  = (game.result === '1-0' && isWhite) || (game.result === '0-1' && !isWhite);
      const drew = game.result === '0.5-0.5';
      if (won) entry.wins++;
      else if (drew) entry.draws++;
      else entry.losses++;
    } catch { /* skip malformed PGN */ }
  }
 
  return Object.values(map)
    .map(e => ({ ...e, win_rate: Math.round((e.wins / e.count) * 100) }))
    .sort((a, b) => b.count - a.count);
}
 
// ─── API route ────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
 
const db84 = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
 
export async function GET_OpeningRepertoire(req: NextRequest) {
  const player_id = new URL(req.url).searchParams.get('player_id');
  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 });
 
  const supabase = db84();
  const { data: games } = await supabase.from('games')
    .select('pgn, result, white_player_id')
    .or(`white_player_id.eq.${player_id},black_player_id.eq.${player_id}`)
    .neq('result', '*').neq('league', 'calibration');
 
  if (!games?.length) return NextResponse.json({ repertoire: [] });
 
  const repertoire = buildRepertoire(games.map(g => ({ pgn: g.pgn ?? '', result: g.result, white_player_id: g.white_player_id })), player_id);
  return NextResponse.json({ repertoire });
}
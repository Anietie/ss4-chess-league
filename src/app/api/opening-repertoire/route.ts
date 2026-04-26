import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';

const adminSupabase = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const player_id = req.nextUrl.searchParams.get('player_id');
  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 });

  const supabase = adminSupabase();
  
  // Fetch all valid games for this player
  const { data: games } = await supabase.from('games')
    .select('pgn, result, white_player_id, black_player_id')
    .or(`white_player_id.eq.${player_id},black_player_id.eq.${player_id}`)
    .neq('result', '*')
    .neq('league', 'calibration')
    .not('pgn', 'is', null);

  if (!games?.length) return NextResponse.json({ repertoire: { white: [], black: [] } });

  // Build separate repertoires for when the player was White vs Black
  const repertoireAsWhite = buildRepertoire(games, player_id, 'white');
  const repertoireAsBlack = buildRepertoire(games, player_id, 'black');

  return NextResponse.json({ 
    repertoire: {
      white: repertoireAsWhite,
      black: repertoireAsBlack
    }
  });
}

// ─── HELPER FUNCTION ─────────────────────────────────────────────────────────

function buildRepertoire(games: any[], playerId: string, color: 'white' | 'black') {
  const openings: Record<string, { count: number, wins: number, draws: number, losses: number }> = {};

  // Filter games down to only the ones where the player played the requested color
  const colorGames = games.filter(g => 
    color === 'white' ? g.white_player_id === playerId : g.black_player_id === playerId
  );

  for (const game of colorGames) {
    if (!game.pgn) continue;
    
    try {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      
      // Extract the first 4 plies (2 full moves, e.g., "e4 c5 Nf3 d6") to define the opening
      const history = chess.history();
      if (history.length === 0) continue;
      const openingMoves = history.slice(0, 4).join(' ');

      // Initialize the stats object if we haven't seen this opening before
      if (!openings[openingMoves]) {
        openings[openingMoves] = { count: 0, wins: 0, draws: 0, losses: 0 };
      }

      openings[openingMoves].count++;

      // Calculate W/D/L strictly from this player's perspective
      if (game.result === '1/2-1/2') {
        openings[openingMoves].draws++;
      } else if ((color === 'white' && game.result === '1-0') || (color === 'black' && game.result === '0-1')) {
        openings[openingMoves].wins++;
      } else {
        openings[openingMoves].losses++;
      }
    } catch (e) {
      // Silently skip any games with corrupted PGN data
      continue;
    }
  }

  // Convert the dictionary to an array, sort by most frequently played, and return the top 10
  return Object.entries(openings)
    .map(([moves, stats]) => ({ moves, ...stats }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// 1. Updated type definition for params to use Promise
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 2. Await the params to safely extract the id
  const { id } = await params;

  const supabase = createServerClient();
  const [{ data: player }, { data: standings }, { data: recentGames }, { data: ratingHistory }] = await Promise.all([
    // 3. Replaced all instances of params.id with the extracted 'id'
    supabase.from('players').select('*').eq('id', id).single(),
    supabase.from('standings').select('*, season:seasons(id, name)').eq('player_id', id).order('season', { ascending: false }),
    supabase.from('games').select(`
      id, result, league, tier, played_at, white_player_id, time_control, is_rated,
      white_rating_before, black_rating_before, white_rating_after, black_rating_after, white_rd_before, black_rd_before,
      white_player:players!games_white_player_id_fkey(id, full_name),
      black_player:players!games_black_player_id_fkey(id, full_name)
    `).or(`white_player_id.eq.${id},black_player_id.eq.${id}`)
      .neq('result', '*')
      .or('league.neq.calibration,league.is.null')
      .order('played_at', { ascending: false })
      .limit(50),
    supabase.from('rating_history').select('rating, rating_deviation, change, recorded_at, season').eq('player_id', id).order('recorded_at', { ascending: true }).limit(100),
  ]);

  if (!player) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ player, standings, recentGames, ratingHistory });
}
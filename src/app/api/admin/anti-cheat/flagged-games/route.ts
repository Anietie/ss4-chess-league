import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function GET(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminSupabase();

  const { data: flaggedGames } = await supabase
    .from('games')
    .select(`
      id, result, played_at, competition_phase, league,
      white_anticheat_score, black_anticheat_score,
      white_player:players!games_white_player_id_fkey(id, full_name),
      black_player:players!games_black_player_id_fkey(id, full_name)
    `)
    .eq('anticheat_flagged', true)
    .order('played_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ flagged_games: flaggedGames ?? [] });
}
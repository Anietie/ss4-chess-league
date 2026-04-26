import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSingleElimination } from '@/lib/fixture-generator';
 
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
 
export async function GET(req: NextRequest) {
  const season = new URL(req.url).searchParams.get('season') ?? '1';
  const supabase = db();
  const { data: games } = await supabase.from('games')
    .select(`id, round, result, competition_phase,
      white_player:players!games_white_player_id_fkey(id, full_name, ss4_rating),
      black_player:players!games_black_player_id_fkey(id, full_name, ss4_rating)`)
    .eq('season', Number(season)).eq('league', 'continental_shield').order('round');
  return NextResponse.json({ games });
}
 
export async function POST(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 
  const { season, action } = await req.json();
  const supabase = db();
 
  if (action === 'seed_bracket') {
    // Participants: bottom 2 from every Premier tier in previous season
    const { data: relegated } = await supabase.from('standings')
      .select('player_id, points, league, players(full_name, ss4_rating)')
      .eq('season', season - 1).eq('tier', 'premier')
      .order('points', { ascending: true })
      .limit(2); // bottom 2 per league — extend this with multiple leagues
 
    if (!relegated?.length) return NextResponse.json({ error: 'No relegated players found' }, { status: 400 });
 
    const players = relegated.map(r => ({ id: r.player_id, full_name: (r.players as any)?.full_name, ss4_rating: (r.players as any)?.ss4_rating ?? 1200 }));
    const bracket = generateSingleElimination(players);
 
    const rows = bracket.map(f => ({
      season, round: f.round, league: 'continental_shield', tier: 'n_a',
      competition_phase: `shield_round_${f.round}`,
      white_player_id: f.white_player_id, black_player_id: f.black_player_id,
      time_control: '600+5', result: '*',
    }));
    await supabase.from('games').insert(rows);
    return NextResponse.json({ success: true, fixtures: rows.length });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
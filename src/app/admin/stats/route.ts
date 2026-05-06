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

  // Fetch season first — it's needed for the other queries
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, status')
    .in('status', ['registration', 'draft', 'active', 'champions_league'])
    .order('id', { ascending: false })
    .limit(1)
    .single();

  const currentSeasonId = season?.id ?? 1;

  // Now fetch everything else using the resolved season ID
  const [
    { count: totalPlayers },
    { count: activePlayers },
    { count: newPlayers },
    { count: returningPlayers },
    { count: calibrating },
    { count: pendingGames },
    { count: completedGames },
    { data: leagueData },
  ] = await Promise.all([
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('players').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('players').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('joining_season', currentSeasonId),
    supabase.from('players').select('*', { count: 'exact', head: true }).eq('is_active', true).lt('joining_season', currentSeasonId),
    supabase.from('players').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('calibration_complete', false),
    supabase.from('games').select('*', { count: 'exact', head: true }).eq('result', '*').neq('league', 'calibration'),
    supabase.from('games').select('*', { count: 'exact', head: true }).neq('result', '*').neq('league', 'calibration'),
    supabase.from('players').select('home_league').eq('is_active', true).neq('home_league', 'unassigned').neq('home_league', 'calibration'),
  ]);

  // Group players by league
  const leagueMap = new Map<string, number>();
  for (const p of leagueData ?? []) {
    leagueMap.set(p.home_league, (leagueMap.get(p.home_league) ?? 0) + 1);
  }
  const leagues = Array.from(leagueMap.entries())
    .map(([league, count]) => ({ league, count }))
    .sort((a, b) => a.league.localeCompare(b.league));

  return NextResponse.json({
    season,
    totalPlayers: totalPlayers ?? 0,
    activePlayers: activePlayers ?? 0,
    newPlayersThisSeason: newPlayers ?? 0,
    returningPlayers: returningPlayers ?? 0,
    calibratingPlayers: calibrating ?? 0,
    pendingGames: pendingGames ?? 0,
    completedGames: completedGames ?? 0,
    leagues,
  });
}
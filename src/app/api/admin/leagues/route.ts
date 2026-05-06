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
  const season = new URL(req.url).searchParams.get('season') ?? '1';

  // Get players grouped by league
  const { data: players } = await supabase
    .from('players')
    .select('home_league')
    .eq('is_active', true)
    .neq('home_league', 'unassigned')
    .neq('home_league', 'calibration');

  const leagueMap = new Map<string, number>();
  for (const p of players ?? []) {
    leagueMap.set(p.home_league, (leagueMap.get(p.home_league) ?? 0) + 1);
  }

  // Check which leagues already have fixtures
  const { data: games } = await supabase
    .from('games')
    .select('league')
    .eq('season', Number(season))
    .eq('competition_phase', 'league_phase');

  const leaguesWithFixtures = new Set((games ?? []).map(g => g.league));

  const leagues = Array.from(leagueMap.entries())
    .filter(([league]) => /^league_\d+$/.test(league))
    .map(([league, count]) => ({
      league,
      playerCount: count,
      hasFixtures: leaguesWithFixtures.has(league),
    }))
    .sort((a, b) => a.league.localeCompare(b.league));

  return NextResponse.json({ leagues });
}
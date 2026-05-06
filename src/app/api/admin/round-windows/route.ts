// src/app/api/admin/round-windows/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
  const season = new URL(req.url).searchParams.get('season') || '1';

  const { data, error } = await supabase
    .from('round_windows')
    .select('*')
    .eq('season', Number(season))
    .order('round');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ windows: data });
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { season, round, date, start_time, end_time, competition } = await req.json();
  
  if (!season || !round || !date || !start_time || !end_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = adminSupabase();

  // Build timestamps in WAT (UTC+1)
  const windowStart = new Date(`${date}T${start_time}:00+01:00`);
  const windowEnd = new Date(`${date}T${end_time}:00+01:00`);

  if (windowEnd <= windowStart) {
    return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
  }

  // Get all active leagues for this season
  const { data: leagues } = await supabase
    .from('players')
    .select('home_league')
    .eq('is_active', true)
    .neq('home_league', 'unassigned')
    .neq('home_league', 'calibration');

  const uniqueLeagues = [...new Set((leagues ?? []).map(l => l.home_league).filter(l => /^league_\d+$/.test(l)))];

  const windows = uniqueLeagues.map(league => ({
    season,
    competition: competition || 'league',
    round,
    league,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    status: 'scheduled',
  }));

  if (windows.length === 0) {
    return NextResponse.json({ error: 'No active leagues found' }, { status: 400 });
  }

  const { error } = await supabase
    .from('round_windows')
    .upsert(windows, { onConflict: 'season,competition,round,league' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, leagues_updated: windows.length });
}
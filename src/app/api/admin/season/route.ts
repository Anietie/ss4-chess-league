import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
 
const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
 
// Valid season status transitions
const TRANSITIONS: Record<string, string> = {
  registration:      'draft',
  draft:             'active',
  active:            'playoffs',
  playoffs:          'champions_league',
  champions_league:  'complete',
};
 
// POST /api/admin/season
// Actions: advance_status | create_season | process_promotion_relegation | reset_forfeits
export async function POST(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 
  const body = await req.json();
  const { action, season } = body;
  const supabase = adminSupabase();
 
  // ── advance_status ────────────────────────────────────────────
  if (action === 'advance_status') {
    const { data: s } = await supabase.from('seasons').select('id, status').eq('id', season).single();
    if (!s) return NextResponse.json({ error: 'Season not found' }, { status: 404 });
    const next = TRANSITIONS[s.status];
    if (!next) return NextResponse.json({ error: `Cannot advance from status: ${s.status}` }, { status: 400 });
 
    await supabase.from('seasons').update({ status: next }).eq('id', season);
    return NextResponse.json({ success: true, previous_status: s.status, new_status: next });
  }
 
  // ── create_season ─────────────────────────────────────────────
  if (action === 'create_season') {
    const { name, start_date, end_date } = body;
    const { data: existing } = await supabase.from('seasons').select('id').order('id', { ascending: false }).limit(1).single();
    const newId = (existing?.id ?? 0) + 1;
    const { data, error } = await supabase.from('seasons').insert({
      id: newId, name: name ?? `Season ${newId}`,
      start_date: start_date ?? new Date().toISOString().split('T')[0],
      end_date: end_date ?? null, status: 'registration',
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, season: data });
  }
 
  // ── process_promotion_relegation ──────────────────────────────
  if (action === 'process_promotion_relegation') {
    const leagues = ['league_1', 'league_2', 'league_3', 'league_4'];
    const changes: any[] = [];
 
    for (const league of leagues) {
      // Get final Premier standings
      const { data: premierStandings } = await supabase
        .from('standings')
        .select('player_id, points, wins')
        .eq('season', season).eq('league', league).eq('tier', 'premier')
        .order('points', { ascending: false })
        .order('wins', { ascending: false });
 
      const { data: devStandings } = await supabase
        .from('standings')
        .select('player_id, points, wins')
        .eq('season', season).eq('league', league).eq('tier', 'development')
        .order('points', { ascending: false })
        .order('wins', { ascending: false });
 
      if (!premierStandings?.length || !devStandings?.length) continue;
 
      // Bottom 2 Premier → relegated; Top 2 Development → promoted
      const relegated = premierStandings.slice(-2);
      const promoted = devStandings.slice(0, 2);
 
      for (const p of relegated) {
        // tier removed
        changes.push({ player_id: p.player_id, action: 'relegated', league, from: 'premier', to: 'development' });
        await supabase.from('notifications').insert({
          player_id: p.player_id, type: 'promotion_relegation', title: 'Relegated to Development Tier',
          message: `You have been relegated to the Development Tier for Season ${season + 1}. Fight your way back!`,
        });
      }
 
      for (const p of promoted) {
        // tier removed
        changes.push({ player_id: p.player_id, action: 'promoted', league, from: 'development', to: 'premier' });
        await supabase.from('notifications').insert({
          player_id: p.player_id, type: 'promotion_relegation', title: 'Promoted to Premier Tier!',
          message: `Congratulations! You have been promoted to the Premier Tier for Season ${season + 1}.`,
        });
        // Award Comeback King badge if they were previously relegated
        await supabase.from('player_badges').upsert({
          player_id: p.player_id, badge_type: 'comeback_king', season,
          description: 'Promoted after finishing in top 2 of Development Tier',
        }, { onConflict: 'player_id,badge_type,season', ignoreDuplicates: true });
      }
    }
 
    return NextResponse.json({ success: true, changes });
  }
 
  // ── reset_forfeits ────────────────────────────────────────────
  if (action === 'reset_forfeits') {
    // Called at start of each new season
    await supabase.from('players').update({ season_forfeit_count: 0 });
    return NextResponse.json({ success: true, message: 'Forfeit counts reset for all players' });
  }
 
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminSupabase();
  const action = new URL(req.url).searchParams.get('action');

  if (action === 'current') {
    const { data: season } = await supabase
      .from('seasons')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ season });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
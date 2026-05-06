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
  active:            'champions_league',
  champions_league:  'complete',
};
 
// POST /api/admin/season
// Actions: advance_status | create_season | update_dates | reset_forfeits
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
    
    // Notify all players about status change
    const { data: players } = await supabase.from('players').select('id').eq('is_active', true);
    if (players) {
      const notifications = players.map(p => ({
        player_id: p.id,
        type: 'admin_action',
        title: `Season ${season} — ${next.replace(/_/g, ' ').toUpperCase()}`,
        message: `The season has advanced to: ${next.replace(/_/g, ' ')}. Check your dashboard for updates.`,
      }));
      await supabase.from('notifications').insert(notifications);
    }
    
    return NextResponse.json({ success: true, previous_status: s.status, new_status: next });
  }
 
  // ── create_season ─────────────────────────────────────────────
  if (action === 'create_season') {
    const { name, start_date, end_date } = body;
    const { data: existing } = await supabase.from('seasons').select('id').order('id', { ascending: false }).limit(1).single();
    const newId = (existing?.id ?? 0) + 1;
    const { data, error } = await supabase.from('seasons').insert({
      id: newId,
      name: name ?? `Season ${newId}`,
      start_date: start_date ?? new Date().toISOString().split('T')[0],
      end_date: end_date ?? null,
      status: 'registration',
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, season: data });
  }

  // ── update_dates ──────────────────────────────────────────────
  if (action === 'update_dates') {
    const { registration_start, registration_end, season_start } = body;
    
    const updates: any = {};
    if (registration_start !== undefined) updates.registration_start = registration_start || null;
    if (registration_end !== undefined) updates.registration_end = registration_end || null;
    if (season_start !== undefined) updates.start_date = season_start || null;
    
    const { error } = await supabase
      .from('seasons')
      .update(updates)
      .eq('id', season);
    
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: updates });
  }
 
  // ── reset_forfeits ────────────────────────────────────────────
  if (action === 'reset_forfeits') {
    await supabase.from('players').update({ season_forfeit_count: 0 });
    return NextResponse.json({ success: true, message: 'Forfeit counts reset for all players' });
  }
 
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// GET /api/admin/season
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
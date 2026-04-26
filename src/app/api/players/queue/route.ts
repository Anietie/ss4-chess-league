import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const adminSupabase78 = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(_req: NextRequest) {
  const supabase = adminSupabase78();
  const { data: queued } = await supabase.from('players')
    .select('id, full_name, email, ss4_rating, joining_season, created_at')
    .eq('home_league', 'unassigned')
    .eq('is_active', true)
    .order('created_at');

  const canCreateLeague = (queued?.length ?? 0) >= 12;
  return NextResponse.json({ queued: queued ?? [], count: queued?.length ?? 0, canCreateLeague });
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await req.json();
  const supabase = adminSupabase78();

  if (action === 'create_new_league') {
    // Find next available league ID
    const { data: leagues } = await supabase.from('players')
      .select('home_league').neq('home_league', 'unassigned').neq('home_league', 'calibration');
    const existing = new Set(leagues?.map(l => l.home_league) ?? []);
    let newLeague = 'league_1';
    for (let i = 1; i <= 10; i++) {
      const candidate = `league_${i}`;
      if (!existing.has(candidate)) { newLeague = candidate; break; }
    }

    // Take first 12 from queue, assign to new league
    const { data: queued } = await supabase.from('players')
      .select('id, ss4_rating').eq('home_league', 'unassigned').eq('is_active', true)
      .order('created_at').limit(12);

    if (!queued?.length) return NextResponse.json({ error: 'No queued players' }, { status: 400 });

    // Sort by rating: top 6 = premier, bottom 6 = development
    const sorted = [...queued].sort((a, b) => b.ss4_rating - a.ss4_rating);
    for (let i = 0; i < sorted.length; i++) {
      const tier = i < 6 ? 'premier' : 'development';
      await supabase.from('players').update({ home_league: newLeague, current_tier: tier }).eq('id', sorted[i].id);
      await supabase.from('notifications').insert({
        player_id: sorted[i].id, type: 'draft_result', title: `${newLeague.replace('_', ' ').toUpperCase()} Created`,
        message: `A new league has been formed! You've been assigned to ${newLeague.replace('_', ' ')} ${tier} tier.`,
      });
    }
    return NextResponse.json({ success: true, new_league: newLeague, players_assigned: sorted.length });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
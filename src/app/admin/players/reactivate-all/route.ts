import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function POST(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminSupabase();

  // Get current season
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .in('status', ['registration', 'draft', 'active', 'champions_league'])
    .order('id', { ascending: false })
    .limit(1)
    .single();

  if (!season) {
    return NextResponse.json({ error: 'No active season found' }, { status: 400 });
  }

  // Reactivate all players who are currently inactive but have played before
  const { data: inactiveReturning } = await supabase
    .from('players')
    .select('id')
    .eq('is_active', false)
    .gt('games_played', 0)
    .lt('joining_season', season.id);

  if (inactiveReturning?.length) {
    await supabase
      .from('players')
      .update({ is_active: true })
      .in('id', inactiveReturning.map(p => p.id));
  }

  return NextResponse.json({
    reactivated: inactiveReturning?.length ?? 0,
    season: season.id,
  });
}
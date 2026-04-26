import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
 
const adminSupabase = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
 
const MIN_TIER_SIZE = 6;
const MAX_TIER_SIZE = 10;
 
export async function GET(_req: NextRequest) {
  const supabase = adminSupabase();
  const leagues = ['league_1', 'league_2', 'league_3', 'league_4'];
  const tiers   = ['premier', 'development'];
  const violations: any[] = [];
 
  for (const league of leagues) {
    for (const tier of tiers) {
      const { count } = await supabase.from('players')
        .select('id', { count: 'exact', head: true })
        .eq('home_league', league).eq('current_tier', tier).eq('is_active', true);
      if (count === null) continue;
      if (count < MIN_TIER_SIZE) violations.push({ league, tier, count, issue: `undersized (min ${MIN_TIER_SIZE})` });
      if (count > MAX_TIER_SIZE) violations.push({ league, tier, count, issue: `oversized (max ${MAX_TIER_SIZE})` });
    }
  }
 
  return NextResponse.json({ violations, healthy: violations.length === 0 });
}
 
export async function POST(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 
  const { action, from_league, from_tier, to_league, to_tier, player_ids } = await req.json();
  const supabase = adminSupabase();
 
  if (action === 'merge_tiers') {
    // Move specified players from one tier to another
    if (!player_ids?.length) return NextResponse.json({ error: 'player_ids required' }, { status: 400 });
    const { error } = await supabase.from('players')
      .update({ home_league: to_league, current_tier: to_tier })
      .in('id', player_ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 
    // Notify moved players
    for (const id of player_ids) {
      await supabase.from('notifications').insert({
        player_id: id, type: 'admin_action', title: 'Tier Assignment Updated',
        message: `Your tier has been updated to ${to_league.replace('_', ' ')} / ${to_tier} due to league restructuring.`,
      });
    }
    return NextResponse.json({ success: true, moved: player_ids.length });
  }
 
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
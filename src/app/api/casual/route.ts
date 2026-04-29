import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

/**
 * POST /api/casual
 * Body: { challenger_id, challenged_id?, time_control, is_rated }
 * Creates a casual challenge. challenged_id is optional (open challenge = share link).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { challenger_id, challenged_id, time_control = '600+0', is_rated = false } = body;

  if (!challenger_id) {
    return NextResponse.json({ error: 'challenger_id required' }, { status: 400 });
  }

  const supabase = adminSupabase();

  // Verify challenger exists
  const { data: challenger } = await supabase
    .from('players')
    .select('id, full_name, ss4_rating, is_active, is_suspended')
    .eq('id', challenger_id)
    .single();

  if (!challenger) {
    return NextResponse.json({ error: 'Challenger not found' }, { status: 404 });
  }
  if (challenger.is_suspended) {
    return NextResponse.json({ error: 'Suspended players cannot issue challenges' }, { status: 403 });
  }

  // Validate time control format
  const tcRegex = /^\d+\+\d+$/;
  if (!tcRegex.test(time_control)) {
    return NextResponse.json({ error: 'Invalid time control format (e.g. 600+0, 180+2)' }, { status: 400 });
  }

  // Cancel any existing pending challenges from this player
  await supabase
    .from('casual_challenges')
    .update({ status: 'cancelled' })
    .eq('challenger_id', challenger_id)
    .eq('status', 'pending');

  // Create new challenge
  const { data: challenge, error } = await supabase
    .from('casual_challenges')
    .insert({
      challenger_id,
      challenged_id: challenged_id ?? null,
      time_control,
      is_rated,
      status: 'pending',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send notification to specific player (if targeted)
  if (challenged_id) {
    const [tcBase] = time_control.split('+');
    const minutes = Math.floor(Number(tcBase) / 60);
    await supabase.from('notifications').insert({
      player_id: challenged_id,
      type: 'casual_challenge',
      title: `${challenger.full_name} challenges you!`,
      message: `${challenger.full_name} (${Math.round(challenger.ss4_rating)}) has sent you a ${minutes}-minute ${is_rated ? 'rated' : 'unrated'} casual game challenge.`,
      game_id: null,
    });
  }

  return NextResponse.json({ challenge }, { status: 201 });
}

/**
 * GET /api/casual?player_id=xxx
 * Returns pending open challenges (excluding own) and incoming challenges for the player.
 */
export async function GET(req: NextRequest) {
  const url       = new URL(req.url);
  const player_id = url.searchParams.get('player_id');

  const supabase = adminSupabase();

  const query = supabase
    .from('casual_challenges')
    .select(`
      *,
      challenger:players!casual_challenges_challenger_id_fkey(
        id, full_name, ss4_rating, rating_deviation
      ),
      challenged:players!casual_challenges_challenged_id_fkey(
        id, full_name, ss4_rating, rating_deviation
      )
    `)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Split into open (no challenged_id) and direct (targeted at this player)
  const open   = (data ?? []).filter(c => !c.challenged_id && c.challenger_id !== player_id);
  const direct = (data ?? []).filter(c => c.challenged_id === player_id);

  return NextResponse.json({ open, direct });
}
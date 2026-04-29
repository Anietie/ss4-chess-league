import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = adminSupabase();

  const { data, error } = await supabase
    .from('casual_challenges')
    .select(`
      *,
      challenger:players!casual_challenges_challenger_id_fkey(
        id, full_name, ss4_rating, rating_deviation
      ),
      challenged:players!casual_challenges_challenged_id_fkey(
        id, full_name, ss4_rating, rating_deviation
      ),
      game:games(id, result, is_live)
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }

  return NextResponse.json({ challenge: data });
}

/**
 * PATCH /api/casual/[id]
 * Body: { action: 'accept' | 'decline', acceptor_id }
 *
 * On accept: creates a game record, assigns room_id, returns game_id.
 * Both players should be redirected to /play/[game_id] by the client.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { action, acceptor_id } = await req.json();

  if (!action || !acceptor_id) {
    return NextResponse.json({ error: 'action and acceptor_id required' }, { status: 400 });
  }

  const supabase = adminSupabase();

  // Fetch challenge
  const { data: challenge } = await supabase
    .from('casual_challenges')
    .select('*, challenger:players!casual_challenges_challenger_id_fkey(id, full_name, ss4_rating, rating_deviation)')
    .eq('id', id)
    .single();

  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }
  if (challenge.status !== 'pending') {
    return NextResponse.json({ error: `Challenge is already ${challenge.status}` }, { status: 409 });
  }
  if (new Date(challenge.expires_at) < new Date()) {
    await supabase.from('casual_challenges').update({ status: 'expired' }).eq('id', id);
    return NextResponse.json({ error: 'Challenge has expired' }, { status: 410 });
  }
  if (acceptor_id === challenge.challenger_id) {
    return NextResponse.json({ error: 'Cannot accept your own challenge' }, { status: 400 });
  }

  if (action === 'decline') {
    await supabase.from('casual_challenges').update({ status: 'declined' }).eq('id', id);
    // Notify challenger
    await supabase.from('notifications').insert({
      player_id: challenge.challenger_id,
      type: 'casual_declined',
      title: 'Challenge Declined',
      message: 'Your casual game challenge was declined.',
    });
    return NextResponse.json({ success: true });
  }

  if (action !== 'accept') {
    return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400 });
  }

  // Fetch both players for rating snapshot
  const { data: acceptor } = await supabase
    .from('players')
    .select('id, full_name, ss4_rating, rating_deviation')
    .eq('id', acceptor_id)
    .single();

  if (!acceptor) {
    return NextResponse.json({ error: 'Acceptor not found' }, { status: 404 });
  }

  // Randomly assign colors
  const [white, black] = Math.random() < 0.5
    ? [challenge.challenger, acceptor]
    : [acceptor, challenge.challenger];

  // Fetch current active season
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .in('status', ['registration', 'active', 'draft'])
    .order('id', { ascending: false })
    .limit(1)
    .single();

  const roomId = `casual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Create game record
  const { data: game, error: gErr } = await supabase
    .from('games')
    .insert({
      season:           season?.id ?? 1,
      league:           'casual',
      competition_phase: 'casual',
      white_player_id:  white.id,
      black_player_id:  black.id,
      time_control:     challenge.time_control,
      result:           '*',
      is_rated:         challenge.is_rated,
      is_live:          false,
      room_id:          roomId,
      white_rating_before: white.ss4_rating,
      black_rating_before: black.ss4_rating,
      white_rd_before:     white.rating_deviation,
      black_rd_before:     black.rating_deviation,
      casual_challenge_id: id,
    })
    .select('id')
    .single();

  if (gErr || !game) {
    return NextResponse.json({ error: gErr?.message ?? 'Failed to create game' }, { status: 500 });
  }

  // Update challenge status
  await supabase
    .from('casual_challenges')
    .update({ status: 'accepted', game_id: game.id })
    .eq('id', id);

  // Notify challenger
  const [tcBase] = challenge.time_control.split('+');
  const minutes = Math.floor(Number(tcBase) / 60);
  await supabase.from('notifications').insert({
    player_id: challenge.challenger_id,
    type: 'casual_accepted',
    title: 'Challenge Accepted!',
    message: `${acceptor.full_name} accepted your ${minutes}-minute ${challenge.is_rated ? 'rated' : 'unrated'} challenge. Game starting now.`,
    game_id: game.id,
  });

  return NextResponse.json({ success: true, game_id: game.id, room_id: roomId });
}
// src/app/api/games/[id]/claim-no-show/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params;
  const { player_id } = await req.json();

  if (!player_id) {
    return NextResponse.json({ error: 'player_id required' }, { status: 400 });
  }

  const supabase = adminSupabase();

  // Fetch game
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, white_player_id, black_player_id, round, league, season, result')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  if (game.result !== '*') {
    return NextResponse.json({ error: 'Game already has a result' }, { status: 400 });
  }

  // Verify player is in this game
  if (player_id !== game.white_player_id && player_id !== game.black_player_id) {
    return NextResponse.json({ error: 'Not your game' }, { status: 403 });
  }

  const opponentId = player_id === game.white_player_id ? game.black_player_id : game.white_player_id;

  // Check for existing claim
  const { data: existingClaim } = await supabase
    .from('no_show_claims')
    .select('id')
    .eq('game_id', gameId)
    .is('resolved_at', null)
    .single();

  if (existingClaim) {
    return NextResponse.json({ error: 'A no-show claim is already pending' }, { status: 409 });
  }

  // Find the round window
  const { data: roundWindow } = await supabase
    .from('round_windows')
    .select('window_start, window_end')
    .eq('season', game.season)
    .eq('round', game.round)
    .eq('league', game.league)
    .single();

  if (!roundWindow) {
    return NextResponse.json({ error: 'No round window found for this game' }, { status: 404 });
  }

  const now = new Date();
  const windowEnd = new Date(roundWindow.window_end);

  // Calculate grace period
  const maxGraceMs = 15 * 60 * 1000; // 15 minutes
  const remainingWindowMs = windowEnd.getTime() - now.getTime();
  const gracePeriodMs = Math.min(maxGraceMs, Math.max(60 * 1000, remainingWindowMs));
  const graceEndsAt = new Date(now.getTime() + gracePeriodMs);
  const graceMinutes = Math.ceil(gracePeriodMs / (60 * 1000));

  // Create claim
  const { data: claim, error: claimError } = await supabase
    .from('no_show_claims')
    .insert({
      game_id: gameId,
      claimed_by: player_id,
      claimed_against: opponentId,
      claimed_at: now.toISOString(),
      grace_ends_at: graceEndsAt.toISOString(),
    })
    .select('id')
    .single();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  // Notify opponent
  await supabase.from('notifications').insert({
    player_id: opponentId,
    type: 'no_show_claimed',
    title: '⚠️ No-Show Claimed Against You',
    message: `Your opponent has claimed you as a no-show. You have ${graceMinutes} minutes to join the game before automatic forfeit.`,
    game_id: gameId,
  });

  // Send push notification
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    await fetch(`${appUrl}/api/push/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({
        player_ids: [opponentId],
        title: '⚠️ No-Show Claimed',
        body: `Your opponent claimed you as a no-show. Join within ${graceMinutes} minutes.`,
        url: `/play/${gameId}`,
        tag: `no-show-${gameId}`,
      }),
    });
  } catch {}

  return NextResponse.json({
    success: true,
    claim_id: claim.id,
    grace_ends_at: graceEndsAt.toISOString(),
    grace_minutes: graceMinutes,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params;
  const supabase = adminSupabase();

  const { data: claim } = await supabase
    .from('no_show_claims')
    .select('id, claimed_against')
    .eq('game_id', gameId)
    .is('resolved_at', null)
    .single();

  if (claim) {
    await supabase
      .from('no_show_claims')
      .update({ resolved_at: new Date().toISOString(), resolution: 'opponent_joined' })
      .eq('id', claim.id);

    // Notify the claimed-against player that the claim is resolved
    await supabase.from('notifications').insert({
      player_id: claim.claimed_against,
      type: 'no_show_resolved',
      title: '✅ No-Show Claim Resolved',
      message: 'The no-show claim against you has been cancelled because you joined the game.',
      game_id: gameId,
    });
  }

  return NextResponse.json({ success: true });
}
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

/**
 * GET /api/spectate/[gameId]/chat?after=<iso_timestamp>
 * Returns spectator messages for a game.
 * During live games, only reveals messages to non-participants.
 * After game ends, all messages are accessible to everyone.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  const after      = new URL(req.url).searchParams.get('after');
  const supabase   = adminSupabase();

  // Check game exists + get status
  const { data: game } = await supabase
    .from('games')
    .select('id, result, is_live, white_player_id, black_player_id')
    .eq('id', gameId)
    .single();

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  const query = supabase
    .from('spectator_messages')
    .select(`
      id, message, created_at,
      player:players(id, full_name)
    `)
    .eq('game_id', gameId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (after) {
    query.gt('created_at', after);
  }

  const { data: messages, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const gameEnded = game.result !== '*';

  return NextResponse.json({
    messages: messages ?? [],
    game_ended: gameEnded,
    is_live:    game.is_live,
  });
}

/**
 * POST /api/spectate/[gameId]/chat
 * Body: { player_id, message }
 * Players cannot chat in their own game while it's live.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId }         = await params;
  const { player_id, message } = await req.json();

  if (!player_id || !message?.trim()) {
    return NextResponse.json({ error: 'player_id and message required' }, { status: 400 });
  }

  const trimmed = message.trim().slice(0, 280);
  const supabase = adminSupabase();

  // Check game
  const { data: game } = await supabase
    .from('games')
    .select('id, result, is_live, white_player_id, black_player_id')
    .eq('id', gameId)
    .single();

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  // Block players from chatting in their own live game
  const isParticipant =
    game.white_player_id === player_id ||
    game.black_player_id === player_id;
  const isLive = game.is_live || game.result === '*';

  if (isParticipant && isLive) {
    return NextResponse.json(
      { error: 'Players cannot spectate-chat in their own live game' },
      { status: 403 },
    );
  }

  const { data: msg, error } = await supabase
    .from('spectator_messages')
    .insert({ game_id: gameId, player_id, message: trimmed })
    .select('id, message, created_at, player:players(id, full_name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: msg }, { status: 201 });
}
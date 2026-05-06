// ═══════════════════════════════════════════════════════════════
// src/app/api/games/[id]/route.ts
// ═══════════════════════════════════════════════════════════════
// Paste into: src/app/api/games/[id]/route.ts
// GET  → fetch single game with players + analysis
// POST → manually record result (forfeit, admin override)

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const { data: game, error } = await supabase
    .from('games')
    .select(`
      *,
      white_player:players!games_white_player_id_fkey(id, full_name, ss4_rating, rating_deviation, home_league, is_provisional),
      black_player:players!games_black_player_id_fkey(id, full_name, ss4_rating, rating_deviation, home_league, is_provisional)
    `)
    .eq('id', params.id)
    .single();

  if (error || !game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  return NextResponse.json({ game });
}

// POST → record forfeit
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const adminSecret = req.headers.get('x-admin-secret');
  if (adminSecret !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { forfeit_player_id, reason } = await req.json();
  const supabase = createServerClient();

  const { data: game } = await supabase.from('games').select('*').eq('id', params.id).single();
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  if (game.result !== '*') return NextResponse.json({ error: 'Game already has a result' }, { status: 400 });

  const result = forfeit_player_id === game.white_player_id ? '0-1' : '1-0';

  // Increment forfeit counter
  await supabase.from('players').update({
    season_forfeit_count: supabase.rpc('increment', { x: 1 }),
  }).eq('id', forfeit_player_id);

  // Call rating update
  const ratingRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ratings/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET || '' },
    body: JSON.stringify({ game_id: params.id, result, pgn: '' }),
  });

  const winnerId = result === '1-0' ? game.black_player_id : game.white_player_id;

  await supabase.from('notifications').insert([
    { player_id: forfeit_player_id, type: 'result_recorded', title: 'Game Forfeited', message: `Your game has been recorded as a forfeit. Reason: ${reason || 'No-show / deadline missed'}.` },
    { player_id: winnerId, type: 'result_recorded', title: 'Opponent Forfeited', message: 'Your opponent forfeited. You have been awarded the win.' },
  ]);

  // Check for suspension (3 forfeits = suspended)
  const { data: player } = await supabase.from('players').select('season_forfeit_count, full_name').eq('id', forfeit_player_id).single();
  if ((player?.season_forfeit_count || 0) >= 3) {
    await supabase.from('players').update({ is_suspended: true, suspension_reason: '3 forfeits in Season 1' }).eq('id', forfeit_player_id);
    await supabase.from('notifications').insert({
      player_id: forfeit_player_id,
      type: 'suspension',
      title: 'Account Suspended',
      message: 'You have accumulated 3 forfeits this season. Your account has been suspended pending review by the League Officer.',
    });
  }

  return NextResponse.json({ success: true, result, forfeit_processed: true });
}


// ═══════════════════════════════════════════════════════════════
// src/app/api/notifications/route.ts
// ═══════════════════════════════════════════════════════════════
// Paste into: src/app/api/notifications/route.ts

export const NOTIFICATIONS_ROUTE = `
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const player_id = searchParams.get('player_id');
  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('player_id', player_id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data, unread: data?.filter(n => !n.is_read).length || 0 });
}
`;

// ═══════════════════════════════════════════════════════════════
// src/app/api/notifications/[id]/route.ts
// ═══════════════════════════════════════════════════════════════
// Paste into: src/app/api/notifications/[id]/route.ts

export const NOTIFICATION_ID_ROUTE = `
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { is_read } = await req.json();
  const supabase = createServerClient();
  const { error } = await supabase.from('notifications').update({ is_read }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
`;

// ═══════════════════════════════════════════════════════════════
// src/app/api/players/[id]/route.ts
// ═══════════════════════════════════════════════════════════════
// Paste into: src/app/api/players/[id]/route.ts

export const PLAYER_ID_ROUTE = `
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const [{ data: player }, { data: standings }, { data: recentGames }, { data: ratingHistory }] = await Promise.all([
    supabase.from('players').select('*').eq('id', params.id).single(),
    supabase.from('standings').select('*, season:seasons(id, name)').eq('player_id', params.id).order('season', { ascending: false }),
    supabase.from('games').select(\`
      id, result, league, played_at, white_player_id, time_control,
      white_rating_before, black_rating_before, white_rating_after, black_rating_after, white_rd_before, black_rd_before,
      white_player:players!games_white_player_id_fkey(id, full_name),
      black_player:players!games_black_player_id_fkey(id, full_name)
    \`).or(\`white_player_id.eq.\${params.id},black_player_id.eq.\${params.id}\`).neq('result', '*').neq('league', 'calibration').order('played_at', { ascending: false }).limit(30),
    supabase.from('rating_history').select('rating, rating_deviation, change, recorded_at, season').eq('player_id', params.id).order('recorded_at', { ascending: true }).limit(100),
  ]);

  if (!player) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ player, standings, recentGames, ratingHistory });
}
`;
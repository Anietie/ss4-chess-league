import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function POST(req: NextRequest) {
  if (req.headers.get('x-internal-secret') !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { player_id, type, title, message, game_id } = await req.json();

  if (!player_id || !title || !message) {
    return NextResponse.json({ error: 'player_id, title, and message required' }, { status: 400 });
  }

  const supabase = adminSupabase();

  const { error } = await supabase.from('notifications').insert({
    player_id,
    type: type || 'admin_action',
    title,
    message,
    game_id: game_id || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
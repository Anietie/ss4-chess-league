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
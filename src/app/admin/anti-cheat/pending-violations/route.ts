import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function GET(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminSupabase();

  const { data: violations } = await supabase
    .from('conduct_violations')
    .select(`
      id, player_id, game_id, violation_type, severity, description,
      resolved_at, created_at,
      player:players(id, full_name)
    `)
    .is('resolved_at', null)
    .order('created_at', { ascending: false });

  return NextResponse.json({ violations: violations ?? [] });
}
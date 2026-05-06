// src/app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function POST(req: NextRequest) {
  const { player_id, endpoint, p256dh, auth } = await req.json();

  if (!player_id || !endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = adminSupabase();

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { player_id, endpoint, p256dh, auth },
      { onConflict: 'player_id,endpoint' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

interface PushSubscriptionRow {
  id: string;
  player_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-internal-secret') !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { player_ids, title, body, url, tag } = await req.json();

  if (!player_ids?.length || !title || !body || !url) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = adminSupabase();

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('player_id', player_ids);

  if (error || !subscriptions?.length) {
    return NextResponse.json({ sent: 0, error: 'No subscriptions found' });
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions as PushSubscriptionRow[]) {
    try {
      const response = await fetch(sub.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          data: { url },
          tag: tag || 'ss4-notification',
          requireInteraction: true,
        }),
      });

      if (response.ok || response.status === 201) {
        sent++;
      } else {
        failed++;
        if (response.status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, total: subscriptions.length });
}
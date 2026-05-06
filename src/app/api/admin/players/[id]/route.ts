import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { is_active } = await req.json();
  const supabase = adminSupabase();

  const { error } = await supabase
    .from('players')
    .update({ is_active })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
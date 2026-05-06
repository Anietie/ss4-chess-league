import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminDb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function GET(_req: NextRequest) {
  const supabase = adminDb();

  // Get the most recent season that isn't complete
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, status, registration_start, registration_end')
    .neq('status', 'complete')
    .order('id', { ascending: false })
    .limit(1)
    .single();

  if (!season) {
    return NextResponse.json({
      registration_open: false,
      state: 'closed',
      message: 'No active season. Check back soon!',
      season_id: null,
      season_name: null,
      registration_start: null,
      registration_end: null,
      status: null,
    });
  }

  const now = new Date();
  const start = season.registration_start ? new Date(season.registration_start) : null;
  const end = season.registration_end ? new Date(season.registration_end) : null;

  // Determine registration state
  let state: 'open' | 'upcoming' | 'closed' | 'always_open';
  let message: string;

  if (!start && !end) {
    // No dates set — registration is open during registration/draft status
    if (season.status === 'registration' || season.status === 'draft') {
      state = 'open';
      message = 'Registration is open!';
    } else {
      state = 'closed';
      message = 'Registration is currently closed.';
    }
  } else if (start && start > now) {
    // Registration hasn't started yet
    state = 'upcoming';
    const dateStr = start.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    message = `Registration opens ${dateStr}`;
  } else if (end && end < now) {
    // Registration has ended
    state = 'closed';
    message = 'Registration for this season has closed.';
  } else {
    // Registration is currently open
    state = 'open';
    if (end) {
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 1) {
        const hoursLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60));
        message = `Registration closes in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`;
      } else {
        message = `Registration closes in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
      }
    } else {
      message = 'Registration is open!';
    }
  }

  return NextResponse.json({
    registration_open: state === 'open',
    state,
    message,
    season_id: season.id,
    season_name: season.name,
    registration_start: season.registration_start,
    registration_end: season.registration_end,
    status: season.status,
  });
}
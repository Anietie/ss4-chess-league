/**
 * FILE: src/app/api/players/route.ts
 *
 * Auth: Email + password only.
 * Verification: Supabase sends confirmation email via Resend SMTP (3,000/month free).
 * No SMS, no custom OTP, no third-party auth complexity.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchChessComRating, fetchLichessRating } from '@/lib/chess-com-api';

const adminDb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// ─── POST /api/players — Register ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    full_name,
    email,
    password,
    chess_com_username,
    lichess_username,
    whatsapp_number,
    year_started_chess,
  } = body;

  // Validation
  if (!full_name?.trim() || !email?.trim() || !password)
    return NextResponse.json({ error: 'Name, email, and password are required.' }, { status: 400 });

  if (password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });

  const supabase = adminDb();

  // Duplicate check
  const { data: existing } = await supabase
    .from('players').select('id').eq('email', email.toLowerCase().trim()).single();
  if (existing)
    return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 });

  // Open season check
  const { data: season } = await supabase
    .from('seasons').select('id, name')
    .in('status', ['registration', 'draft'])
    .order('id', { ascending: false }).limit(1).single();
  if (!season)
    return NextResponse.json({ error: 'Registration is not currently open.' }, { status: 400 });

  // Seed rating
  let seedRating = 1000, seedSource = 'default';
  if (chess_com_username?.trim()) {
    const r = await fetchChessComRating(chess_com_username.trim());
    if (r.success && r.rapid_rating) { seedRating = r.rapid_rating; seedSource = 'chess_com_api'; }
  } else if (lichess_username?.trim()) {
    const r = await fetchLichessRating(lichess_username.trim());
    if (r.success && r.rapid_rating) { seedRating = r.rapid_rating; seedSource = 'lichess_api'; }
  }
  const needsCalibration = seedSource === 'default';

  // Create Supabase Auth user
  // email_confirm: false → Supabase sends confirmation email via Resend SMTP automatically
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: false,
    user_metadata: { full_name: full_name.trim() },
  });

  if (authError) {
    if (authError.message.includes('already been registered'))
      return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 });
    return NextResponse.json({ error: `Account creation failed: ${authError.message}` }, { status: 400 });
  }

  // Insert player record
  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({
      full_name:            full_name.trim(),
      email:                email.toLowerCase().trim(),
      chess_com_username:   chess_com_username?.trim() || null,
      lichess_username:     lichess_username?.trim() || null,
      whatsapp_number:      whatsapp_number?.trim() || null,
      year_started_chess:   year_started_chess ? Number(year_started_chess) : null,
      joining_season:       season.id,
      home_league:          'unassigned',
      ss4_rating:           needsCalibration ? 1000 : seedRating,
      rating_deviation:     200,
      volatility:           0.06,
      seed_rating:          needsCalibration ? null : seedRating,
      seed_source:          seedSource,
      calibration_complete: !needsCalibration,
      auth_user_id:         authData.user?.id ?? null,
      is_active:            true,
      is_verified:          false, // flipped to true when they click confirmation email
    })
    .select('id').single();

  if (playerError) {
    // Roll back auth user
    await supabase.auth.admin.deleteUser(authData.user!.id);
    return NextResponse.json({ error: playerError.message }, { status: 500 });
  }

  // Pioneer badge for founding season
  if (season.id === 1) {
    await supabase.from('player_badges').insert({
      player_id:   player.id,
      badge_type:  'pioneer_s1',
      season:      1,
      description: 'Founding member of the SS4 Chess League',
    });
  }

  // Welcome notification
  await supabase.from('notifications').insert({
    player_id: player.id,
    type:      'welcome',
    title:     'Welcome to SS4 Chess League!',
    message:   needsCalibration
      ? `Check your email to verify your account, then complete 5 bot calibration games before the draft.`
      : `Check your email to verify your account. Your seed rating is ${seedRating} (${seedSource === 'chess_com_api' ? 'Chess.com' : 'Lichess'} rapid).`,
  });

  return NextResponse.json({
    success:           true,
    player_id:         player.id,
    needs_calibration: needsCalibration,
    seed_rating:       needsCalibration ? null : seedRating,
    seed_source:       seedSource,
    message:           `Account created! Check ${email} for a confirmation link before signing in.`,
  });
}

// ─── GET /api/players — List active players ───────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = adminDb();
  const { searchParams } = new URL(req.url);
  const league = searchParams.get('league');
  const tier   = searchParams.get('tier');
  const search = searchParams.get('q');

  let query = supabase
    .from('players')
    .select('id, full_name, home_league, ss4_rating, rating_deviation, is_provisional, joining_season, games_played, chess_com_username, calibration_complete')
    .eq('is_active', true)
    .order('ss4_rating', { ascending: false });

  if (league) query = query.eq('home_league', league);
  // tier filter removed — tiers no longer exist
  if (search) query = query.ilike('full_name', `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ players: data });
}
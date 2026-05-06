/**
 * FILE: src/app/api/players/route.ts
 *
 * Auth: Email + password only.
 * Verification: Supabase sends confirmation email automatically via Resend SMTP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchChessComRating, fetchLichessRating } from '@/lib/chess-com-api';
import { ALL_INSTITUTIONS } from '@/lib/schools-data';

const adminDb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// ─── POST /api/players — Register (NEW PLAYERS ONLY) ─────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    full_name, email, password,
    school, department,
    chess_com_username, lichess_username,
    whatsapp_number, year_started_chess,
  } = body;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!full_name?.trim())
    return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
  
  if (!email?.trim())
    return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
  
  if (!password || password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });

  if (!school?.trim())
    return NextResponse.json({ error: 'School/Institution is required.' }, { status: 400 });
  
  if (!department?.trim())
    return NextResponse.json({ error: 'Department is required.' }, { status: 400 });

  if (!whatsapp_number?.trim())
    return NextResponse.json({ error: 'WhatsApp number is required.' }, { status: 400 });
  
  if (!/^(\+234|234|0)[7-9]\d{9}$/.test(whatsapp_number.replace(/[\s\-\(\)]/g, ''))) {
    return NextResponse.json({ error: 'A valid Nigerian WhatsApp number is required (+234, 234, or 0 prefix).' }, { status: 400 });
  }

  const supabase = adminDb();

  // ── Check if email already registered ─────────────────────────────────────
  const { data: existingPlayer } = await supabase
    .from('players')
    .select('id, full_name, is_active')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (existingPlayer) {
    return NextResponse.json({
      error: existingPlayer.is_active
        ? 'You are already registered. Sign in to continue.'
        : 'You already have an account. Sign in to reactivate for the new season.',
      is_returning: true,
    }, { status: 409 });
  }

  // ── Open season check ─────────────────────────────────────────────────────
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, status')
    .in('status', ['registration', 'draft'])
    .order('id', { ascending: false })
    .limit(1)
    .single();

  if (!season)
    return NextResponse.json({ error: 'Registration is not currently open.' }, { status: 400 });

  // ── Seed rating ───────────────────────────────────────────────────────────
  let seedRating = 1000, seedSource = 'default';
  if (chess_com_username?.trim()) {
    const r = await fetchChessComRating(chess_com_username.trim());
    if (r.success && r.rapid_rating) { seedRating = r.rapid_rating; seedSource = 'chess_com_api'; }
  } else if (lichess_username?.trim()) {
    const r = await fetchLichessRating(lichess_username.trim());
    if (r.success && r.rapid_rating) { seedRating = r.rapid_rating; seedSource = 'lichess_api'; }
  }
  const needsCalibration = seedSource === 'default';

  // ── Find institution category ─────────────────────────────────────────────
  const institution = ALL_INSTITUTIONS.find(
    i => i.name.toLowerCase() === school.trim().toLowerCase() ||
         i.acronym.toLowerCase() === school.trim().toLowerCase()
  );

  // ── Normalize school/department ──────────────────────────────────────────
  const normalizedSchool = institution?.name ?? school.trim();
  const normalizedDepartment = department.trim();

  // ── Create Supabase Auth user ─────────────────────────────────────────────
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
    user_metadata: { 
      full_name: full_name.trim(), 
      school: normalizedSchool, 
      department: normalizedDepartment 
    },
  });

  if (authError) {
    if (authError.message.includes('already been registered'))
      return NextResponse.json({ error: 'This email is already registered. Sign in or reset your password.' }, { status: 409 });
    console.error('[register] Auth creation failed:', authError.message);
    return NextResponse.json({ error: `Account creation failed: ${authError.message}` }, { status: 400 });
  }

  if (!authData.user?.id) {
    return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
  }

  // ── Insert player record ──────────────────────────────────────────────────
  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({
      full_name:            full_name.trim(),
      email:                email.toLowerCase().trim(),
      school:               normalizedSchool,
      department:           normalizedDepartment,
      institution_category:  institution?.category ?? null,
      chess_com_username:   chess_com_username?.trim() || null,
      lichess_username:     lichess_username?.trim() || null,
      whatsapp_number:      whatsapp_number.trim(),
      year_started_chess:   year_started_chess ? Number(year_started_chess) : null,
      joining_season:       season.id,
      home_league:          'unassigned',
      ss4_rating:           needsCalibration ? 1000 : seedRating,
      rating_deviation:     200,
      volatility:           0.06,
      seed_rating:          needsCalibration ? null : seedRating,
      seed_source:          seedSource,
      calibration_complete: !needsCalibration,
      auth_user_id:         authData.user.id,
      is_active:            true,
      is_verified:          false,
    })
    .select('id, full_name')
    .single();

  if (playerError) {
    console.error('[register] Player insert failed:', playerError.message);
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: `Failed to create player record: ${playerError.message}` }, { status: 500 });
  }

  // ── Pioneer badge ─────────────────────────────────────────────────────────
  if (season.id === 1) {
    await supabase.from('player_badges').insert({
      player_id: player.id,
      badge_type: 'pioneer_s1',
      season: 1,
      description: 'Founding member of the SS4 Chess League',
    });
  }

  // ── Welcome notification ──────────────────────────────────────────────────
  const platformName = seedSource === 'chess_com_api' ? 'Chess.com' : seedSource === 'lichess_api' ? 'Lichess' : null;

  await supabase.from('notifications').insert({
    player_id: player.id,
    type: 'welcome',
    title: 'Welcome to SS4 Chess League! 🎉',
    message: needsCalibration
      ? `Welcome ${player.full_name}! Check your email (${email}) to verify your account, then complete 5 bot calibration games to determine your rating before the draft.`
      : `Welcome ${player.full_name}! Check your email (${email}) to verify your account. Your seed rating is ${seedRating} (from ${platformName} rapid). You'll be placed in the draft when registration closes.`,
  });

  return NextResponse.json({
    success: true,
    player_id: player.id,
    is_returning: false,
    needs_calibration: needsCalibration,
    seed_rating: needsCalibration ? null : seedRating,
    seed_source: seedSource,
    message: `Account created! We've sent a confirmation email to ${email}. Click the link in the email to verify your account, then sign in.`,
  });
}

// ─── GET /api/players — List active players ───────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = adminDb();
  const { searchParams } = new URL(req.url);
  const league = searchParams.get('league');
  const search = searchParams.get('q');
  const school = searchParams.get('school');
  const department = searchParams.get('department');
  const category = searchParams.get('category');
  const limit = Number(searchParams.get('limit') ?? 50);

  let query = supabase
    .from('players')
    .select('id, full_name, home_league, school, department, institution_category, ss4_rating, rating_deviation, is_provisional, joining_season, games_played, chess_com_username, calibration_complete')
    .eq('is_active', true)
    .order('ss4_rating', { ascending: false })
    .limit(limit);

  if (league) query = query.eq('home_league', league);
  if (search) query = query.ilike('full_name', `%${search}%`);
  if (school) query = query.ilike('school', `%${school}%`);
  if (department) query = query.ilike('department', `%${department}%`);
  if (category) query = query.eq('institution_category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ players: data ?? [] });
}
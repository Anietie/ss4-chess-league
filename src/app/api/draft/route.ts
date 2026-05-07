import { checkLeagueBalance, CUP_QUALIFIERS_PER_LEAGUE, generateRoundRobin, runSnakeDraft } from '@/lib/snake-draft';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

/**
 * POST /api/draft
 * Headers: x-admin-secret
 * Body: { season }
 *
 * Runs the snake draft for a season. Handles both new and returning players.
 * Returning players are sorted by their end-of-season draft_rating.
 * New players (calibration_complete) are sorted by seed_rating.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { season } = await req.json();
  if (!season) return NextResponse.json({ error: 'season required' }, { status: 400 });

  const supabase = adminSupabase();

  const { data: seasonData } = await supabase
    .from('seasons')
    .select('id, status')
    .eq('id', season)
    .single();

  if (!seasonData) return NextResponse.json({ error: 'Season not found' }, { status: 404 });

  // ── Fetch all eligible players ──────────────────────────────────────────────
  const { data: players, error: pErr } = await supabase
    .from('players')
    .select('id, full_name, ss4_rating, rating_deviation, draft_rating, calibration_complete, is_active, is_suspended, joining_season')
    .eq('is_active', true)
    .eq('is_admin', false) 
    .eq('is_suspended', false)
    .eq('calibration_complete', true);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!players?.length) {
    return NextResponse.json({ error: 'No eligible players for draft' }, { status: 400 });
  }

  // ── Determine returning vs new ─────────────────────────────────────────────
  // Fetch previous season standings to get final positions (for draft order tiebreak)
  const prevSeason = season - 1;
  const { data: prevStandings } = await supabase
    .from('standings')
    .select('player_id, league, position')
    .eq('season', prevSeason);

  const prevStandingMap = new Map(
    (prevStandings ?? []).map(s => [s.player_id, { league: s.league, position: s.position }]),
  );

  const playerSeeds = players.map(p => {
    const isReturning = p.joining_season < season;
    const prev        = prevStandingMap.get(p.id);
    // Returning players: use draft_rating (set at season end), fallback to ss4_rating
    // New players: use ss4_rating (set from calibration seed)
    const effectiveRating = isReturning
      ? (p.draft_rating ?? p.ss4_rating)
      : p.ss4_rating;

    return {
      id:               p.id,
      full_name:        p.full_name,
      ss4_rating:       effectiveRating,
      rating_deviation: p.rating_deviation,
      is_returning:     isReturning,
      previous_league:  prev?.league ?? null,
      previous_position: prev?.position ?? 999,
    };
  });

  // ── Run snake draft ─────────────────────────────────────────────────────────
  let result;
  try {
    result = runSnakeDraft(playerSeeds);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const balance = checkLeagueBalance(result.stats);

  // ── Persist draft assignments ───────────────────────────────────────────────
  const draftRows = result.assignments.map(a => ({
      season,
      player_id:           a.player_id,
      draft_position:      a.draft_position,
      assigned_league:     a.assigned_league,
      seed_rating:         a.seed_rating || 1000,  // Required by schema
      seed_rating_at_draft: a.seed_rating || 1000,  // Added by migration_v2
      is_returning:        a.is_returning ?? false,
      previous_league:     a.previous_league ?? null,
  }));

  const { error: dErr } = await supabase
    .from('season_draft')
    .upsert(draftRows, { onConflict: 'season,player_id' });

  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  // ── Update players' home_league ─────────────────────────────────────────────
  for (const a of result.assignments) {
    await supabase
      .from('players')
      .update({ home_league: a.assigned_league })
      .eq('id', a.player_id);
  }

  // ── Initialise standings rows ───────────────────────────────────────────────
  const standingRows = result.assignments.map(a => ({
    season,
    league:                 a.assigned_league,
    player_id:              a.player_id,
    points:                 0,
    wins:                   0,
    draws:                  0,
    losses:                 0,
    forfeits_given:         0,
    games_played:           0,
    sonneborn_berger:       0,
    buchholz:               0,
    cup_qualified:          false,
    rating_at_season_start: a.seed_rating,
  }));

  await supabase
    .from('standings')
    .upsert(standingRows, { onConflict: 'season,league,player_id' });

  // ── Generate round-robin fixtures per league ────────────────────────────────
  let fixturesCreated = 0;
  for (const [leagueKey, leaguePlayers] of Object.entries(result.leagues)) {
    const ids    = leaguePlayers.map(p => p.player_id);
    const rounds = generateRoundRobin(ids);

    for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
      const pairs = rounds[roundIndex];
      const gameRows = pairs.map(([white, black]) => ({
        season,
        round:             roundIndex + 1,
        league:            leagueKey,
        competition_phase: 'league_phase',
        white_player_id:   white,
        black_player_id:   black,
        result:            '*',
        time_control:      '600+0',
        is_rated:          true,
      }));

      if (gameRows.length > 0) {
        const { error: gErr } = await supabase.from('games').insert(gameRows);
        if (!gErr) fixturesCreated += gameRows.length;
      }
    }
  }

  // ── Advance season status ───────────────────────────────────────────────────
  await supabase.from('seasons').update({ status: 'active' }).eq('id', season);

  // ── Notify all players ─────────────────────────────────────────────────────
  const notifications = result.assignments.map(a => ({
    player_id: a.player_id,
    type:      'draft_result',
    title:     'Season Draft Complete',
    message:   a.is_returning
      ? `Welcome back! You've been drafted into ${a.assigned_league.replace('_', ' ').toUpperCase()} for Season ${season} (Draft pick #${a.draft_position}). Good luck!`
      : `You've been assigned to ${a.assigned_league.replace('_', ' ').toUpperCase()} for Season ${season} (Draft pick #${a.draft_position}). Your journey begins!`,
  }));

  await supabase.from('notifications').insert(notifications);

  return NextResponse.json({
    success:           true,
    season,
    total_players:     players.length,
    league_count:      result.league_count,
    fixtures_created:  fixturesCreated,
    cup_qualifiers_per_league: CUP_QUALIFIERS_PER_LEAGUE,
    assignments:       result.assignments,
    stats:             result.stats,
    balance:           balance,
    balance_warning:   !balance.balanced ? balance.details : null,
  });
}

/**
 * GET /api/draft?season=1
 */
export async function GET(req: NextRequest) {
  const season   = new URL(req.url).searchParams.get('season') ?? '1';
  const supabase = adminSupabase();

  const { data, error } = await supabase
    .from('season_draft')
    .select('*, player:players(id, full_name, ss4_rating)')
    .eq('season', Number(season))
    .order('draft_position');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draft: data });
}
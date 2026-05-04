import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processGameResult, formatRating } from '@/lib/glicko2';

// ── Use service-role key directly ─────────────────────────────────────────────
// createServerClient() from @/lib/supabase may use the anon key (for SSR/RLS),
// which causes player UPDATE operations to be silently blocked by row-level
// security. The ratings route runs server-side with a validated internal secret,
// so it must use the service role key to bypass RLS.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: NextRequest) {
  if (req.headers.get('x-internal-secret') !== process.env.INTERNAL_API_SECRET) {
    console.error('[ratings/update] Unauthorized — check INTERNAL_API_SECRET matches on Railway and Vercel');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { game_id, result, pgn } = await req.json();
  if (!['1-0','0-1','0.5-0.5'].includes(result))
    return NextResponse.json({ error: 'Invalid result' }, { status: 400 });

  // ── Fetch game ───────────────────────────────────────────────────────────────
  const { data: game, error: gameErr } = await supabase
    .from('games')
    .select('white_player_id, black_player_id, season, league, tier')
    .eq('id', game_id)
    .single();

  if (gameErr || !game) {
    console.error('[ratings/update] Game fetch failed:', gameErr?.message);
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  // ── Fetch players ─────────────────────────────────────────────────────────────
  const { data: players, error: playersErr } = await supabase
    .from('players')
    .select('id, ss4_rating, rating_deviation, volatility, games_played')
    .in('id', [game.white_player_id, game.black_player_id]);

  if (playersErr || !players?.length) {
    console.error('[ratings/update] Players fetch failed:', playersErr?.message);
    return NextResponse.json({ error: 'Players not found' }, { status: 404 });
  }

  const white = players.find(p => p.id === game.white_player_id);
  const black = players.find(p => p.id === game.black_player_id);
  if (!white || !black) {
    console.error('[ratings/update] Could not match players to white/black ids');
    return NextResponse.json({ error: 'Player ID mismatch' }, { status: 404 });
  }

  // ── Compute new ratings ───────────────────────────────────────────────────────
  const updates = processGameResult(
    { rating: white.ss4_rating, rd: white.rating_deviation, volatility: white.volatility },
    { rating: black.ss4_rating, rd: black.rating_deviation, volatility: black.volatility },
    result
  );

  const now = new Date().toISOString();

  // ── Save rating context to game row ──────────────────────────────────────────
  // NOTE: result, pgn, is_live, played_at are already saved by the socket server
  // before calling this endpoint. We add the before/after rating columns here.
  const { error: gameUpdateErr } = await supabase.from('games').update({
    white_rating_before: white.ss4_rating,
    black_rating_before: black.ss4_rating,
    white_rd_before:     white.rating_deviation,
    black_rd_before:     black.rating_deviation,
    white_rating_after:  updates.white.newRating,
    black_rating_after:  updates.black.newRating,
    white_rd_after:      updates.white.newRD,
    black_rd_after:      updates.black.newRD,
  }).eq('id', game_id);

  if (gameUpdateErr) {
    // Non-fatal — ratings can still update even if game metadata save fails
    console.error('[ratings/update] game row update failed (non-fatal):', gameUpdateErr.message);
  }

  // ── Update white player rating ───────────────────────────────────────────────
  const { error: whiteErr } = await supabase.from('players').update({
    ss4_rating:       updates.white.newRating,
    rating_deviation: updates.white.newRD,
    volatility:       updates.white.newVolatility,
    games_played:     white.games_played + 1,
  }).eq('id', white.id);

  if (whiteErr) {
    console.error('[ratings/update] FAILED to update white player rating:', whiteErr.message);
    return NextResponse.json({ error: 'Failed to update white rating: ' + whiteErr.message }, { status: 500 });
  }

  // ── Update black player rating ───────────────────────────────────────────────
  const { error: blackErr } = await supabase.from('players').update({
    ss4_rating:       updates.black.newRating,
    rating_deviation: updates.black.newRD,
    volatility:       updates.black.newVolatility,
    games_played:     black.games_played + 1,
  }).eq('id', black.id);

  if (blackErr) {
    console.error('[ratings/update] FAILED to update black player rating:', blackErr.message);
    return NextResponse.json({ error: 'Failed to update black rating: ' + blackErr.message }, { status: 500 });
  }

  console.log(`[ratings/update] ✓ ${white.id}: ${Math.round(white.ss4_rating)} → ${Math.round(updates.white.newRating)} (${updates.white.ratingChange >= 0 ? '+' : ''}${Math.round(updates.white.ratingChange)})`);
  console.log(`[ratings/update] ✓ ${black.id}: ${Math.round(black.ss4_rating)} → ${Math.round(updates.black.newRating)} (${updates.black.ratingChange >= 0 ? '+' : ''}${Math.round(updates.black.ratingChange)})`);

  // ── rating_history (optional — null season is allowed for casual games) ───────
  if (game.season != null) {
    try {
      await supabase.from('rating_history').insert([
        { player_id: white.id, game_id, season: game.season, rating: updates.white.newRating, rating_deviation: updates.white.newRD, volatility: updates.white.newVolatility, change: updates.white.ratingChange, recorded_at: now },
        { player_id: black.id, game_id, season: game.season, rating: updates.black.newRating, rating_deviation: updates.black.newRD, volatility: updates.black.newVolatility, change: updates.black.ratingChange, recorded_at: now },
      ]);
    } catch (rhErr: any) {
      console.error('[ratings/update] rating_history insert failed (non-fatal):', rhErr?.message);
    }
  }

  // ── Standings (competitive leagues only) ─────────────────────────────────────
  const COMPETITIVE_LEAGUES = [
    'league_1','league_2','league_3','league_4','league_5','league_6',
    'champions_league','open_cup','newcomer_shield','blitz',
  ];
  if (game.league && COMPETITIVE_LEAGUES.includes(game.league)) {
    const wPts = result === '1-0' ? 3 : result === '0.5-0.5' ? 1 : 0;
    const bPts = result === '0-1' ? 3 : result === '0.5-0.5' ? 1 : 0;

    for (const [pid, pts, win, draw, loss] of [
      [white.id, wPts, result==='1-0'?1:0, result==='0.5-0.5'?1:0, result==='0-1'?1:0],
      [black.id, bPts, result==='0-1'?1:0, result==='0.5-0.5'?1:0, result==='1-0'?1:0],
    ] as any[]) {
      const { data: s } = await supabase.from('standings').select('*')
        .eq('season', game.season).eq('league', game.league).eq('player_id', pid).maybeSingle();
      if (s) {
        await supabase.from('standings').update({
          points: s.points + pts,
          wins: s.wins + win,
          draws: s.draws + draw,
          losses: s.losses + loss,
          games_played: s.games_played + 1,
        }).eq('id', s.id);
      } else if (game.season != null) {
        await supabase.from('standings').insert({
          season: game.season, league: game.league, player_id: pid,
          points: pts, wins: win, draws: draw, losses: loss, games_played: 1,
        });
      }
    }
  }

  // ── Giant killer badge ────────────────────────────────────────────────────────
  const diff = Math.abs(white.ss4_rating - black.ss4_rating);
  if (diff >= 300 && result !== '0.5-0.5') {
    const winnerId  = result === '1-0' ? white.id : black.id;
    const winnerRating = winnerId === white.id ? white.ss4_rating : black.ss4_rating;
    const loserRating  = winnerId === white.id ? black.ss4_rating : white.ss4_rating;
    if (winnerRating < loserRating) {
      await supabase.from('player_badges').upsert({
        player_id: winnerId, badge_type: 'giant_killer', season: game.season,
        description: `Defeated a player rated ${Math.round(diff)} points above them`,
      }, { onConflict: 'player_id,badge_type,season', ignoreDuplicates: true });
    }
  }

  // ── Notifications (non-fatal) ─────────────────────────────────────────────────
  try {
    await supabase.from('notifications').insert([
      { player_id: white.id, type: 'result_recorded', title: 'Game Result Recorded', message: `Result: ${result}. Rating: ${updates.white.ratingChange >= 0 ? '+' : ''}${Math.round(updates.white.ratingChange)}`, game_id },
      { player_id: black.id, type: 'result_recorded', title: 'Game Result Recorded', message: `Result: ${result}. Rating: ${updates.black.ratingChange >= 0 ? '+' : ''}${Math.round(updates.black.ratingChange)}`, game_id },
    ]);
  } catch (nErr: any) {
    console.error('[ratings/update] notifications insert failed (non-fatal):', nErr?.message);
  }

  return NextResponse.json({
    success: true,
    white_new_rating: formatRating(updates.white.newRating, updates.white.newRD),
    black_new_rating: formatRating(updates.black.newRating, updates.black.newRD),
    white_change: updates.white.ratingChange,
    black_change: updates.black.ratingChange,
  });
}
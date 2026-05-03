import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { processGameResult, formatRating } from '@/lib/glicko2';

export async function POST(req: NextRequest) {
  if (req.headers.get('x-internal-secret') !== process.env.INTERNAL_API_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { game_id, result, pgn } = await req.json();
  if (!['1-0','0-1','0.5-0.5'].includes(result))
    return NextResponse.json({ error: 'Invalid result' }, { status: 400 });

  const supabase = createServerClient();
  const { data: game } = await supabase.from('games')
    .select('white_player_id, black_player_id, season, league, tier').eq('id', game_id).single();
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  const { data: players } = await supabase.from('players')
    .select('id, ss4_rating, rating_deviation, volatility, games_played')
    .in('id', [game.white_player_id, game.black_player_id]);

  const white = players?.find(p => p.id === game.white_player_id);
  const black = players?.find(p => p.id === game.black_player_id);
  if (!white || !black) return NextResponse.json({ error: 'Players not found' }, { status: 404 });

  const updates = processGameResult(
    { rating: white.ss4_rating, rd: white.rating_deviation, volatility: white.volatility },
    { rating: black.ss4_rating, rd: black.rating_deviation, volatility: black.volatility },
    result
  );

  const now = new Date().toISOString();
  await supabase.from('games').update({
    result, pgn, played_at: now, is_live: false,
    white_rating_before: white.ss4_rating, black_rating_before: black.ss4_rating,
    white_rd_before: white.rating_deviation, black_rd_before: black.rating_deviation,
    white_rating_after: updates.white.newRating, black_rating_after: updates.black.newRating,
    white_rd_after: updates.white.newRD, black_rd_after: updates.black.newRD,
  }).eq('id', game_id);

  await supabase.from('players').update({ ss4_rating: updates.white.newRating, rating_deviation: updates.white.newRD, volatility: updates.white.newVolatility, games_played: white.games_played + 1 }).eq('id', white.id);
  await supabase.from('players').update({ ss4_rating: updates.black.newRating, rating_deviation: updates.black.newRD, volatility: updates.black.newVolatility, games_played: black.games_played + 1 }).eq('id', black.id);

  // rating_history is optional — don't let a constraint failure (e.g. null season on
  // calibration games) block the player rating updates that already succeeded above.
  if (game.season != null) {
    try {
      await supabase.from('rating_history').insert([
        { player_id: white.id, game_id, season: game.season, rating: updates.white.newRating, rating_deviation: updates.white.newRD, volatility: updates.white.newVolatility, change: updates.white.ratingChange, recorded_at: now },
        { player_id: black.id, game_id, season: game.season, rating: updates.black.newRating, rating_deviation: updates.black.newRD, volatility: updates.black.newVolatility, change: updates.black.ratingChange, recorded_at: now },
      ]);
    } catch (rhErr) {
      console.error('[ratings/update] rating_history insert failed (non-fatal):', rhErr);
    }
  }

  // Update standings (football scoring: W=3, D=1, L=0)
  // No longer gated on game.tier — the league system has no tiers.
  // Casual and calibration games are excluded by league name.
  const COMPETITIVE_LEAGUES = [
    'league_1','league_2','league_3','league_4','league_5','league_6',
    'champions_league','continental_shield','open_cup','newcomer_shield','blitz',
  ];
  if (COMPETITIVE_LEAGUES.includes(game.league)) {
    const isChessScoring = ['champions_league','continental_shield'].includes(game.league);
    const wPts = result === '1-0' ? (isChessScoring ? 1 : 3) : result === '0.5-0.5' ? (isChessScoring ? 0.5 : 1) : 0;
    const bPts = result === '0-1' ? (isChessScoring ? 1 : 3) : result === '0.5-0.5' ? (isChessScoring ? 0.5 : 1) : 0;
    // Use 'n_a' as the unified tier key — DB unique constraint is (season,league,tier,player_id)
    const effectiveTier = 'n_a';

    for (const [pid, pts, win, draw, loss] of [
      [white.id, wPts, result==='1-0'?1:0, result==='0.5-0.5'?1:0, result==='0-1'?1:0],
      [black.id, bPts, result==='0-1'?1:0, result==='0.5-0.5'?1:0, result==='1-0'?1:0],
    ] as any[]) {
      const { data: s } = await supabase.from('standings').select('*')
        .eq('season', game.season).eq('league', game.league).eq('tier', effectiveTier).eq('player_id', pid).single();
      if (s) {
        await supabase.from('standings').update({ points: s.points + pts, wins: s.wins + win, draws: s.draws + draw, losses: s.losses + loss, games_played: s.games_played + 1 }).eq('id', s.id);
      } else {
        await supabase.from('standings').insert({ season: game.season, league: game.league, tier: effectiveTier, player_id: pid, points: pts, wins: win, draws: draw, losses: loss, games_played: 1 });
      }
    }
  }

  // Giant killer badge check
  const diff = Math.abs(white.ss4_rating - black.ss4_rating);
  if (diff >= 300 && result !== '0.5-0.5') {
    const winnerId = result === '1-0' ? white.id : black.id;
    const winnerRating = winnerId === white.id ? white.ss4_rating : black.ss4_rating;
    const loserRating = winnerId === white.id ? black.ss4_rating : white.ss4_rating;
    if (winnerRating < loserRating) {
      await supabase.from('player_badges').upsert({ 
        player_id: winnerId, 
        badge_type: 'giant_killer', 
        season: game.season, 
        description: `Defeated a player rated ${Math.round(diff)} points above them` 
      }, { onConflict: 'player_id,badge_type,season', ignoreDuplicates: true });
    }
  }

  try {
    await supabase.from('notifications').insert([
      { player_id: white.id, type: 'result_recorded', title: 'Game Result Recorded', message: `Result: ${result}. Rating: ${updates.white.ratingChange >= 0 ? '+' : ''}${Math.round(updates.white.ratingChange)}`, game_id },
      { player_id: black.id, type: 'result_recorded', title: 'Game Result Recorded', message: `Result: ${result}. Rating: ${updates.black.ratingChange >= 0 ? '+' : ''}${Math.round(updates.black.ratingChange)}`, game_id },
    ]);
  } catch (nErr) {
    console.error('[ratings/update] notifications insert failed (non-fatal):', nErr);
  }

  return NextResponse.json({
    success: true,
    white_new_rating: formatRating(updates.white.newRating, updates.white.newRD),
    black_new_rating: formatRating(updates.black.newRating, updates.black.newRD),
    white_change: updates.white.ratingChange, black_change: updates.black.ratingChange,
  });
}
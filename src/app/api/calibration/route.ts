import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { clamp } from '@/lib/utils';
 
const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
 
// Bot Elo levels — maps to Stockfish depth/skill settings
const BOT_LEVELS = [400, 600, 800, 900, 1000, 1100, 1200, 1350, 1500, 1650, 1800, 2000, 2200, 2400];
const STARTING_LEVEL_INDEX = 4; // starts at ~1000
 
// GET /api/calibration?player_id=xxx
export async function GET(req: NextRequest) {
  const player_id = new URL(req.url).searchParams.get('player_id');
  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 });
 
  const supabase = supabaseAdmin();
  const { data: player } = await supabase
    .from('players')
    .select('id, full_name, calibration_games_played, calibration_complete, ss4_rating')
    .eq('id', player_id).single();
 
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
 
  const { data: calGames } = await supabase
    .from('games')
    .select('id, result, white_rating_before, played_at')
    .eq('white_player_id', player_id)
    .eq('competition_phase', 'calibration')
    .order('played_at', { ascending: true });
 
  // Determine current bot level index
  let levelIndex = STARTING_LEVEL_INDEX;
  for (const g of calGames ?? []) {
    if (g.result === '1-0')      levelIndex = Math.min(levelIndex + 2, BOT_LEVELS.length - 1);
    else if (g.result === '0-1') levelIndex = Math.max(levelIndex - 2, 0);
  }
 
  const gamesPlayed = calGames?.length ?? 0;
  const nextBotElo = BOT_LEVELS[levelIndex];
  const remainingGames = Math.max(0, 5 - gamesPlayed);
 
  return NextResponse.json({
    player_id,
    calibration_complete: player.calibration_complete,
    games_played: gamesPlayed,
    remaining_games: remainingGames,
    current_bot_elo: nextBotElo,
    current_level_index: levelIndex,
    games: calGames,
  });
}
 
// POST /api/calibration
// Body: { player_id, result ('1-0'|'0-1'|'0.5-0.5'), bot_elo, pgn? }
export async function POST(req: NextRequest) {
  const { player_id, result, bot_elo, pgn } = await req.json();
  if (!player_id || !result || !bot_elo)
    return NextResponse.json({ error: 'player_id, result, bot_elo required' }, { status: 400 });
  if (!['1-0', '0-1', '0.5-0.5'].includes(result))
    return NextResponse.json({ error: 'Invalid result' }, { status: 400 });
 
  const supabase = supabaseAdmin();
 
  const { data: player } = await supabase
    .from('players')
    .select('id, calibration_games_played, calibration_complete, joining_season')
    .eq('id', player_id).single();
 
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  if (player.calibration_complete)
    return NextResponse.json({ error: 'Calibration already complete' }, { status: 400 });
 
  // Record the game
  const { data: season } = await supabase.from('seasons')
    .select('id').eq('id', player.joining_season).single();
 
  const { error: insertError } = await supabase.from('games').insert({
    season: season?.id ?? 1,
    league: 'calibration',
    tier: 'n_a',
    competition_phase: 'calibration',
    white_player_id: player_id,
    black_player_id: player_id, // same UUID allowed for calibration — see DB constraint
    result,
    pgn: pgn ?? '',
    white_rating_before: bot_elo,
    time_control: '600+0',
  });

  if (insertError) {
    console.error('[calibration] game insert failed:', insertError.message);
    return NextResponse.json({ error: 'Failed to record game: ' + insertError.message }, { status: 500 });
  }
 
  const newGameCount = (player.calibration_games_played ?? 0) + 1;
 
  if (newGameCount >= 5) {
    // Fetch all 5 cal games to compute final seed rating
    const { data: allGames } = await supabase
      .from('games')
      .select('white_rating_before, result')
      .eq('white_player_id', player_id)
      .eq('competition_phase', 'calibration')
      .order('played_at', { ascending: true })
      .limit(5);
 
    // Weighted average: games 4+5 count double
    const weights = [1, 1, 1, 2, 2];
    let weightedSum = 0, totalWeight = 0;
    (allGames ?? []).forEach((g, i) => {
      const w = weights[i] ?? 1;
      // Adjust bot elo by result: win = +75, draw = 0, loss = -75
      const adj = g.result === '1-0' ? 75 : g.result === '0.5-0.5' ? 0 : -75;
      weightedSum += (g.white_rating_before + adj) * w;
      totalWeight += w;
    });
 
    const rawSeed = totalWeight > 0 ? weightedSum / totalWeight : 1000;
    const seedRating = clamp(Math.round(rawSeed), 600, 2400);
 
    await supabase.from('players').update({
      calibration_games_played: newGameCount,
      calibration_complete: true,
      seed_rating: seedRating,
      seed_source: 'bot_calibration',
      ss4_rating: seedRating,
      rating_deviation: 200,
    }).eq('id', player_id);
 
    await supabase.from('notifications').insert({
      player_id,
      type: 'rating_update',
      title: 'Calibration Complete!',
      message: `Your calibration seed rating is ${seedRating}. You will be placed in the draft when registration closes.`,
    });
 
    return NextResponse.json({ complete: true, seed_rating: seedRating, games_played: 5 });
  }
 
  // Not done yet — update count and return next bot level
  await supabase.from('players')
    .update({ calibration_games_played: newGameCount }).eq('id', player_id);
 
  // Next bot level
  const { data: calGames } = await supabase
    .from('games')
    .select('result')
    .eq('white_player_id', player_id)
    .eq('competition_phase', 'calibration')
    .order('played_at', { ascending: true });
 
  let li = STARTING_LEVEL_INDEX;
  for (const g of calGames ?? []) {
    if (g.result === '1-0')      li = Math.min(li + 2, BOT_LEVELS.length - 1);
    else if (g.result === '0-1') li = Math.max(li - 2, 0);
  }
 
  return NextResponse.json({
    complete: false,
    games_played: newGameCount,
    remaining_games: 5 - newGameCount,
    next_bot_elo: BOT_LEVELS[li],
    next_level_index: li,
  });
}
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
 
const db85 = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
 
function getDramatismScore(analysisJson: { ply: number; score: number }[]): number {
  if (!analysisJson?.length) return 0;
  let maxSwing = 0, totalSwing = 0, swingCount = 0;
 
  for (let i = 1; i < analysisJson.length; i++) {
    const prev = analysisJson[i - 1].score;
    const curr = analysisJson[i].score;
    const swing = Math.abs(curr - prev);
    if (swing > 50) { // ignore tiny moves
      maxSwing = Math.max(maxSwing, swing);
      totalSwing += swing;
      swingCount++;
    }
  }
 
  // Final centipawn swing in last 10 moves (endgame drama)
  const last10 = analysisJson.slice(-10);
  const endgameSwing = last10.length > 1
    ? Math.abs(last10[last10.length - 1].score - last10[0].score) : 0;
 
  // Dramatism = weighted: max swing + avg swing + endgame drama
  const avgSwing = swingCount > 0 ? totalSwing / swingCount : 0;
  return Math.round(maxSwing * 0.4 + avgSwing * 0.3 + endgameSwing * 0.3);
}
 
// GET /api/game-of-the-round?season=1&round=3&league=league_1
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const season = Number(p.get('season') ?? 1);
  const round  = Number(p.get('round') ?? 1);
  const league = p.get('league');
  const supabase = db85();
 
  let query = supabase.from('games')
    .select(`id, result, analysis_json, pgn, time_control,
      white_player:players!games_white_player_id_fkey(id, full_name, ss4_rating),
      black_player:players!games_black_player_id_fkey(id, full_name, ss4_rating)`)
    .eq('season', season).eq('round', round).neq('result', '*').not('analysis_json', 'is', null);
 
  if (league) query = query.eq('league', league);
  const { data: games, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!games?.length) return NextResponse.json({ game_of_round: null, message: 'No analysed games for this round' });
 
  // Score each game for drama
  const scored = games.map(g => ({
    ...g,
    dramatism_score: getDramatismScore(g.analysis_json ?? []),
  })).sort((a, b) => b.dramatism_score - a.dramatism_score);
 
  const winner = scored[0];
 
  // Persist result
  await supabase.from('games').update({ is_game_of_round: true }).eq('id', winner.id);
  // Clear previous GOTR for this round
  const otherIds = scored.slice(1).map(g => g.id);
  if (otherIds.length) await supabase.from('games').update({ is_game_of_round: false }).in('id', otherIds);
 
  return NextResponse.json({
    game_of_round: {
      id: winner.id,
      white_player: winner.white_player,
      black_player: winner.black_player,
      result: winner.result,
      dramatism_score: winner.dramatism_score,
      time_control: winner.time_control,
    },
    all_scored: scored.map(g => ({ id: g.id, score: g.dramatism_score })),
  });
}
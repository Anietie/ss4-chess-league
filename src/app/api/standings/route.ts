/**
 * GET /api/standings?season=1&league=league_1&tier=premier
 * Returns sorted standings with all 5 tiebreakers applied:
 * 1. Points  2. Head-to-head  3. Sonneborn-Berger  4. Wins  5. Rating
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const season = Number(searchParams.get('season') ?? 1);
  const league = searchParams.get('league');
  const tier   = searchParams.get('tier');

  if (!league || !tier) {
    return NextResponse.json({ error: 'league and tier required' }, { status: 400 });
  }

  // Fetch all completed games for this tier/season
  const { data: games, error } = await supabase
    .from('games')
    .select('white_player_id, black_player_id, result, white_rating_before, black_rating_before')
    .eq('season', season)
    .eq('league', league)
    .eq('tier', tier)
    .eq('competition_phase', 'league_phase')
    .neq('result', '*');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch players in this tier
  const { data: players, error: pErr } = await supabase
    .from('players')
    .select('id, full_name, ss4_rating, rating_deviation, home_league, current_tier')
    .eq('home_league', league)
    .eq('current_tier', tier);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!players?.length) return NextResponse.json({ standings: [] });

  // Build stats map
  type Stats = {
    id: string; name: string; rating: number; rd: number;
    pts: number; w: number; d: number; l: number; gp: number;
    sb: number; // Sonneborn-Berger
    opponents: Record<string, { pts: number }>;
  };

  const statsMap: Record<string, Stats> = {};
  for (const p of players) {
    statsMap[p.id] = {
      id: p.id, name: p.full_name, rating: p.ss4_rating, rd: p.rating_deviation,
      pts: 0, w: 0, d: 0, l: 0, gp: 0, sb: 0, opponents: {},
    };
  }

  for (const g of games ?? []) {
    const w = statsMap[g.white_player_id];
    const b = statsMap[g.black_player_id];
    if (!w || !b) continue;

    w.gp++; b.gp++;

    if (g.result === '1-0') {
      w.pts += 3; w.w++;
      b.l++;
    } else if (g.result === '0-1') {
      b.pts += 3; b.w++;
      w.l++;
    } else if (g.result === '0.5-0.5') {
      w.pts += 1; w.d++;
      b.pts += 1; b.d++;
    }

    // Track H2H points
    if (!w.opponents[b.id]) w.opponents[b.id] = { pts: 0 };
    if (!b.opponents[w.id]) b.opponents[w.id] = { pts: 0 };
    if (g.result === '1-0') { w.opponents[b.id].pts += 3; }
    else if (g.result === '0-1') { b.opponents[w.id].pts += 3; }
    else { w.opponents[b.id].pts += 1; b.opponents[w.id].pts += 1; }
  }

  // Sonneborn-Berger: sum of points of opponents beaten + half points of opponents drawn
  for (const g of games ?? []) {
    const w = statsMap[g.white_player_id];
    const b = statsMap[g.black_player_id];
    if (!w || !b) continue;
    if (g.result === '1-0') w.sb += statsMap[b.id]?.pts ?? 0;
    else if (g.result === '0-1') b.sb += statsMap[w.id]?.pts ?? 0;
    else { w.sb += (statsMap[b.id]?.pts ?? 0) / 2; b.sb += (statsMap[w.id]?.pts ?? 0) / 2; }
  }

  const standings = Object.values(statsMap).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;               // 1. Points
    const h2hA = a.opponents[b.id]?.pts ?? 0;                // 2. H2H
    const h2hB = b.opponents[a.id]?.pts ?? 0;
    if (h2hB !== h2hA) return h2hB - h2hA;
    if (b.sb !== a.sb) return b.sb - a.sb;                   // 3. SB
    if (b.w !== a.w) return b.w - a.w;                       // 4. Wins
    return b.rating - a.rating;                              // 5. Rating
  });

  return NextResponse.json({ standings: standings.map((s, i) => ({ ...s, rank: i + 1 })) });
}
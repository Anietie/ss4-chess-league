import { createClient } from '@supabase/supabase-js';
 
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
 
async function checkLeagueBalance() {
  const season = Number(arg('season') ?? 1);
  console.log(`\n⚖️  Inter-League Balance Check — Season ${season}\n`);
 
  const leagues = ['league_1', 'league_2', 'league_3', 'league_4'];
  const stats: Record<string, { avg: number; count: number; min: number; max: number }> = {};
 
  for (const league of leagues) {
    const { data: players } = await supabase.from('players')
      .select('ss4_rating')
      .eq('home_league', league)
      .eq('current_tier', 'premier')
      .eq('is_active', true);
    if (!players?.length) continue;
    const ratings = players.map(p => p.ss4_rating);
    stats[league] = {
      avg: Math.round(ratings.reduce((s, r) => s + r, 0) / ratings.length),
      count: ratings.length,
      min: Math.min(...ratings),
      max: Math.max(...ratings),
    };
  }
 
  const activeLeagues = Object.keys(stats);
  if (activeLeagues.length < 2) { console.log('Need at least 2 active leagues to compare.'); return; }
 
  console.log('Premier Tier averages:');
  activeLeagues.forEach(l => {
    const s = stats[l];
    console.log(`  ${l.padEnd(12)} avg: ${s.avg}  range: ${s.min}–${s.max}  (${s.count} players)`);
  });
 
  const avgs = activeLeagues.map(l => stats[l].avg);
  const maxGap = Math.max(...avgs) - Math.min(...avgs);
  const THRESHOLD = 200;
 
  if (maxGap > THRESHOLD) {
    const highLeague = activeLeagues[avgs.indexOf(Math.max(...avgs))];
    const lowLeague  = activeLeagues[avgs.indexOf(Math.min(...avgs))];
    console.log(`\n⚠️  IMBALANCE DETECTED — gap of ${maxGap} points between ${highLeague} (${stats[highLeague].avg}) and ${lowLeague} (${stats[lowLeague].avg})`);
    console.log('   Recommended action: Manual inter-league player transfer or adjustment at next draft.\n');
    process.exit(1); // non-zero exit so CI/cron can alert
  } else {
    console.log(`\n✓ Balance OK — max gap is ${maxGap} points (threshold: ${THRESHOLD})`);
  }
}
checkLeagueBalance().catch(console.error);
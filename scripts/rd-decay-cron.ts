import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function rdDecayCron() {
  const commit = process.argv.includes('--commit');
  const RD_INCREASE = 35;   // per season of inactivity
  const RD_MAX = 350;        // cap
  const INACTIVE_GAME_THRESHOLD = 3; // fewer than this = inactive
 
  const { data: players } = await supabase.from('players').select('id, full_name, ss4_rating, rating_deviation, games_played');
  const inactive = (players ?? []).filter(p => p.games_played < INACTIVE_GAME_THRESHOLD);
 
  console.log(`\n📉 RD Decay Cron | ${inactive.length} inactive players\n`);
  inactive.forEach(p => {
    const newRD = Math.min(p.rating_deviation + RD_INCREASE, RD_MAX);
    console.log(`  ${p.full_name.padEnd(30)} RD: ${Math.round(p.rating_deviation)} → ${Math.round(newRD)}`);
  });
 
  if (!commit) { console.log('\nDry run. Add --commit.'); return; }
  for (const p of inactive) {
    const newRD = Math.min(p.rating_deviation + RD_INCREASE, RD_MAX);
    await supabase.from('players').update({ rating_deviation: newRD }).eq('id', p.id);
  }
  console.log('\n✓ RD decay applied.');
}
rdDecayCron().catch(console.error);
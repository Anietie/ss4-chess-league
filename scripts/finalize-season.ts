import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];

async function finalizeSeason() {
  const season  = Number(arg('season') ?? 1);
  const winner  = arg('winner');
  const runnerUp = arg('runner-up');
  const commit  = process.argv.includes('--commit');
 
  if (!winner) { console.error('--winner=<player_id> required'); return; }
 
  const { data: p } = await supabase.from('players').select('full_name').eq('id', winner).single();
  console.log(`\n🏆 Finalizing Season ${season} | Winner: ${p?.full_name}\n`);
 
  if (!commit) { console.log('Dry run. Add --commit.'); return; }
 
  await supabase.from('seasons').update({ cl_winner_id: winner, cl_runner_up_id: runnerUp ?? null, status: 'complete' }).eq('id', season);
 
  await supabase.from('player_badges').upsert({ player_id: winner, badge_type: 'cl_winner', season, description: `SS4 Champions League Winner Season ${season}` }, { onConflict: 'player_id,badge_type,season', ignoreDuplicates: true });
  if (runnerUp) await supabase.from('player_badges').upsert({ player_id: runnerUp, badge_type: 'cl_runner_up', season, description: `SS4 CL Runner-Up Season ${season}` }, { onConflict: 'player_id,badge_type,season', ignoreDuplicates: true });
 
  // Reset forfeit counts for next season
  await supabase.from('players').update({ season_forfeit_count: 0 });
 
  console.log('✓ Season finalized. Forfeit counts reset.');
}
finalizeSeason().catch(console.error);
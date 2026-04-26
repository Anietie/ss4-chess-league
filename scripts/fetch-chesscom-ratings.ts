/**
 * scripts/fetch-chesscom-ratings.ts
 * Run: npx tsx scripts/fetch-chesscom-ratings.ts
 * Fetches current rapid rating from Chess.com public API for every player
 * that has a chess_com_username, then updates seed_rating + ss4_rating.
 * Only updates players whose calibration is NOT yet complete via real games.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fetchRapidRating(username: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.chess.com/pub/player/${username}/stats`, {
      headers: { 'User-Agent': 'SS4ChessLeague/1.0 contact@ss4chess.com' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.chess_rapid?.last?.rating ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const { data: players, error } = await supabase
    .from('players')
    .select('id, full_name, chess_com_username, games_played')
    .not('chess_com_username', 'is', null);

  if (error) throw error;
  if (!players?.length) { console.log('No players with Chess.com usernames found.'); return; }

  console.log(`Fetching ratings for ${players.length} players...\n`);

  for (const player of players) {
    // Don't overwrite rating once they have real league games
    if (player.games_played >= 10) {
      console.log(`⏭  ${player.full_name} — skipped (${player.games_played} league games played)`);
      continue;
    }

    const rating = await fetchRapidRating(player.chess_com_username);
    if (!rating) {
      console.log(`✗  ${player.full_name} (@${player.chess_com_username}) — API returned nothing`);
      continue;
    }

    const { error: uErr } = await supabase.from('players').update({
      seed_rating:   rating,
      seed_source:   'chess_com_api',
      ss4_rating:    rating,
      calibration_complete: true,
    }).eq('id', player.id);

    if (uErr) console.error(`✗  ${player.full_name}: ${uErr.message}`);
    else console.log(`✓  ${player.full_name} — ${rating} rapid`);

    // Be polite to Chess.com API
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\nDone.');
}

main().catch(console.error);

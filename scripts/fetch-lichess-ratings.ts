/**
 * scripts/fetch-lichess-ratings.ts
 * Run: npx tsx scripts/fetch-lichess-ratings.ts
 * Fetches current rapid rating from Lichess API for players with lichess_username.
 */
import { createServerClient } from "../src/lib/supabase";

const supabase = createServerClient();

async function fetchLichessRapid(username: string): Promise<number | null> {
  try {
    const res = await fetch(`https://lichess.org/api/user/${username}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.perfs?.rapid?.rating ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const { data: players, error } = await supabase
    .from("players")
    .select("id, full_name, lichess_username, games_played, seed_source")
    .not("lichess_username", "is", null);

  if (error) throw error;
  if (!players?.length) {
    console.log("No players with Lichess usernames found.");
    return;
  }

  console.log(`Fetching Lichess ratings for ${players.length} players...\n`);

  for (const player of players) {
    if (player.games_played >= 10) {
      console.log(`⏭  ${player.full_name} — skipped (enough league games)`);
      continue;
    }
    // Don't overwrite if Chess.com already seeded
    if (player.seed_source === "chess_com_api") {
      console.log(`⏭  ${player.full_name} — already seeded from Chess.com`);
      continue;
    }

    const rating = await fetchLichessRapid(player.lichess_username);
    if (!rating) {
      console.log(`✗  ${player.full_name} — not found on Lichess`);
      continue;
    }

    const { error: uErr } = await supabase
      .from("players")
      .update({
        seed_rating: rating,
        seed_source: "lichess_api",
        ss4_rating: rating,
        calibration_complete: true,
      })
      .eq("id", player.id);

    if (uErr) console.error(`✗  ${player.full_name}: ${uErr.message}`);
    else console.log(`✓  ${player.full_name} — ${rating} rapid (Lichess)`);

    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("\nDone.");
}

main().catch(console.error);

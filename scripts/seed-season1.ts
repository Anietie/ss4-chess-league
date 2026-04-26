/**
 * scripts/seed-season1.ts
 * Run: npx tsx scripts/seed-season1.ts
 * Inserts Season 1 record + all known Season 1 players.
 * Safe to re-run (uses upsert).
 */
import { createServerClient } from "../src/lib/supabase";

const supabase = createServerClient();

const SEASON: any = {
  id: 1,
  name: "Season 1",
  start_date: "2026-04-01",
  end_date: "2026-07-31",
  status: "registration",
};

// Appendix A confirmed registrations (+ placeholders for remaining)
// chess_com_rapid_rating is the seed; update with live API fetch after
const PLAYERS: any[] = [
  {
    full_name: "Victor Augustine",
    chess_com_username: "victoraugustine",
    seed_rating: 1705,
    year_started_chess: 2020,
  },
  {
    full_name: "Nkereuwem Samuel Ime",
    chess_com_username: "Fulgent47",
    seed_rating: 1702,
  },
  {
    full_name: "Etengeabasi Ekpe",
    chess_com_username: "Power_101",
    seed_rating: 1665,
    year_started_chess: 2023,
  },
  {
    full_name: "Destiny Chilaka",
    chess_com_username: "chilax333",
    seed_rating: 1645,
    year_started_chess: 2022,
  },
  {
    full_name: "Saviour Joseph Ibok",
    chess_com_username: "Savlast",
    seed_rating: 1498,
    year_started_chess: 2024,
  },
  {
    full_name: "Mover",
    chess_com_username: "xemover",
    seed_rating: 1413,
    year_started_chess: 2018,
  },
  {
    full_name: "Emmanuel",
    chess_com_username: "anhe_tiny",
    seed_rating: 1333,
    year_started_chess: 2021,
  },
  {
    full_name: "Favour",
    chess_com_username: "Favourizo1",
    seed_rating: 1302,
    year_started_chess: 2016,
  },
  {
    full_name: "Enoch Isaac",
    chess_com_username: "21stPhenom",
    seed_rating: 981,
    year_started_chess: 2022,
  },
  // Add remaining players below as they register
  // { full_name: '', chess_com_username: '', seed_rating: 0 },
];

async function main() {
  console.log("Seeding Season 1...");

  // Upsert season
  const { error: sErr } = await supabase
    .from("seasons")
    .upsert(SEASON, { onConflict: "id" });
  if (sErr) throw new Error(`Season insert failed: ${sErr.message}`);
  console.log("✓ Season 1 inserted");

  // Upsert players (email derived from name if not provided)
  for (const p of PLAYERS) {
    const email =
      p.email ??
      `${p.full_name.toLowerCase().replace(/\s+/g, ".")}@ss4.placeholder`;
    const player = {
      full_name: p.full_name,
      email,
      chess_com_username: p.chess_com_username ?? null,
      year_started_chess: p.year_started_chess ?? null,
      joining_season: 1,
      home_league: "unassigned", // set by draft
      current_tier: "unassigned",
      ss4_rating: p.seed_rating ?? 1000,
      rating_deviation: 200,
      volatility: 0.06,
      seed_rating: p.seed_rating ?? null,
      seed_source: p.seed_rating ? "chess_com_api" : "default",
      calibration_complete: !!p.seed_rating,
    };

    const { error } = await supabase
      .from("players")
      .upsert(player, { onConflict: "email" });
    if (error) console.error(`✗ ${p.full_name}: ${error.message}`);
    else console.log(`✓ ${p.full_name}`);
  }

  console.log("\nDone. Run fetch-chesscom-ratings.ts to refresh live ratings.");
}

main().catch(console.error);

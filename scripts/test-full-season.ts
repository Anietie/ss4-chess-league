// scripts/test-full-season.ts
// ULTRA-REALISTIC SEASON TEST SCRIPT
// Run: npx tsx scripts/test-full-season.ts --commit

import { createServerClient } from "../src/lib/supabase-server";
import { Chess } from "chess.js";

const supabase = createServerClient();
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ADMIN_SECRET = "ss4-admin-2026-abc";

const TEST_SEASON = 99;

// ─── PLAYER NAMES ──────────────────────────────────────────────────────────

const NIGERIAN_NAMES = [
  { first: "Chidi", last: "Okonkwo" },
  { first: "Amara", last: "Eze" },
  { first: "Tunde", last: "Adebayo" },
  { first: "Ngozi", last: "Okafor" },
  { first: "Emeka", last: "Nwachukwu" },
  { first: "Folake", last: "Balogun" },
  { first: "Obinna", last: "Ibe" },
  { first: "Ifeoma", last: "Obi" },
  { first: "Yemi", last: "Adesina" },
  { first: "Chiamaka", last: "Ude" },
  { first: "Segun", last: "Oladele" },
  { first: "Nkechi", last: "Anyanwu" },
  { first: "Babatunde", last: "Ogunleye" },
  { first: "Adanna", last: "Nwosu" },
  { first: "Kelechi", last: "Maduka" },
  { first: "Yetunde", last: "Afolabi" },
  { first: "Oluwaseun", last: "Okeke" },
  { first: "Chinwe", last: "Nnamdi" },
  { first: "Dayo", last: "Olatunji" },
  { first: "Ezinne", last: "Chukwu" },
  { first: "Temitope", last: "Adekunle" },
  { first: "Uchenna", last: "Okoro" },
  { first: "Adaeze", last: "Emeka" },
  { first: "Nonso", last: "Obi" },
];

// ─── COMPLETE CLEANUP ─────────────────────────────────────────────────────

async function cleanupAll() {
  console.log("Cleaning up ALL previous test data...");
  
  // Step 1: Get all test players' auth_user_ids BEFORE deleting players
  const { data: testPlayers } = await supabase
    .from("players")
    .select("id, auth_user_id")
    .eq("joining_season", TEST_SEASON);

  const authIds = (testPlayers ?? [])
    .map(p => p.auth_user_id)
    .filter(Boolean) as string[];

  // Step 2: Delete related records
  const tables = ["games", "standings", "season_draft", "notifications", 
                  "rating_history", "player_badges", "conduct_violations"];
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).delete().eq("season", TEST_SEASON);
      if (error) console.log(`  ⚠ ${table}: ${error.message}`);
    } catch (e: any) {
      console.log(`  ⚠ ${table}: ${e.message}`);
    }
  }

  // Step 3: Delete players
  const { error: delErr } = await supabase
    .from("players")
    .delete()
    .eq("joining_season", TEST_SEASON);
  if (delErr) console.log(`  ⚠ players: ${delErr.message}`);

  // Step 4: Delete auth users (this is what caused the duplicate email issue!)
  let deletedAuth = 0;
  for (const uid of authIds) {
    try {
      await supabase.auth.admin.deleteUser(uid);
      deletedAuth++;
    } catch {
      // User might already be deleted
    }
  }
  console.log(`  Deleted ${deletedAuth} auth users`);

  // Step 5: Delete season itself
  await supabase.from("seasons").delete().eq("id", TEST_SEASON);
  
  // Short pause for deletions to propagate
  await new Promise(r => setTimeout(r, 500));
  console.log("✓ Cleanup complete");
}

// ─── SEASON SETUP ─────────────────────────────────────────────────────────

async function createSeason() {
  console.log(`\n📅 Creating test Season ${TEST_SEASON}...`);
  await supabase.from("seasons").upsert({
    id: TEST_SEASON,
    name: `Test Season ${TEST_SEASON}`,
    start_date: "2026-01-01",
    status: "registration",
  }, { onConflict: "id" });
  console.log("✓ Season created");
}

// ─── REGISTRATION ─────────────────────────────────────────────────────────

interface TestPlayer {
  id: string;
  full_name: string;
  ss4_rating: number;
}

async function registerPlayers(): Promise<TestPlayer[]> {
  console.log(`\n👥 Registering ${NIGERIAN_NAMES.length} test players...`);
  
  const players: TestPlayer[] = [];

  for (let i = 0; i < NIGERIAN_NAMES.length; i++) {
    const { first, last } = NIGERIAN_NAMES[i];
    const full_name = `${first} ${last}`;
    // Use unique email with timestamp to avoid duplicates
    const email = `test.s${TEST_SEASON}.${i}.${first.toLowerCase()}@ss4test.local`;
    const password = "testpass123";
    const rating = 900 + Math.floor(Math.random() * 1200);

    // First check if this email already exists
    const { data: existing } = await supabase
      .from("players")
      .select("id")
      .eq("email", email)
      .single();

    if (existing) {
      console.log(`  ⏭ ${full_name} already exists`);
      continue;
    }

    // Create auth user
    const { data: auth, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authErr) {
      console.log(`  ✗ ${full_name}: auth error — ${authErr.message}`);
      continue;
    }

    // Create player
    const { data: player, error: playerErr } = await supabase
      .from("players")
      .insert({
        full_name,
        email,
        whatsapp_number: `+2348000000${String(i).padStart(3, "0")}`,
        joining_season: TEST_SEASON,
        home_league: "unassigned",
        ss4_rating: rating,
        rating_deviation: 200,
        volatility: 0.06,
        seed_rating: rating,
        seed_source: "manual",
        calibration_complete: true,
        auth_user_id: auth.user?.id,
        is_active: true,
        is_verified: true,
      })
      .select("id")
      .single();

    if (playerErr) {
      console.log(`  ✗ ${full_name}: ${playerErr.message}`);
      continue;
    }

    players.push({ id: player.id, full_name, ss4_rating: rating });
    console.log(`  ✓ ${full_name} (${rating})`);
  }

  console.log(`✓ Registered ${players.length} players`);
  return players;
}

// ─── DRAFT ────────────────────────────────────────────────────────────────

async function runDraft() {
  console.log(`\n🎯 Running draft...`);
  const res = await fetch(`${BASE_URL}/api/draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({ season: TEST_SEASON }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  console.log(`✓ ${data.total_players} players → ${data.league_count} leagues`);
  console.log(`  ${data.balance?.details}`);
  return data;
}

// ─── FETCH FIXTURES ───────────────────────────────────────────────────────

async function getFixturesByLeague(): Promise<Map<string, { id: string; white: string; black: string }[]>> {
  const { data: games } = await supabase
    .from("games")
    .select("id, league, white_player_id, black_player_id")
    .eq("season", TEST_SEASON)
    .eq("result", "*")
    .order("round");

  const byLeague = new Map<string, { id: string; white: string; black: string }[]>();
  for (const g of games ?? []) {
    if (!byLeague.has(g.league)) byLeague.set(g.league, []);
    byLeague.get(g.league)!.push({
      id: g.id,
      white: g.white_player_id,
      black: g.black_player_id,
    });
  }
  return byLeague;
}

// ─── SIMULATE GAME ────────────────────────────────────────────────────────

function generateRandomGame(whiteRating: number, blackRating: number): { pgn: string; result: string } {
  const chess = new Chess();
  const openingMoves = ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6", "O-O", "Be7", "Re1", "d6"];
  
  for (const m of openingMoves) {
    try { chess.move(m); } catch { break; }
  }

  const extra = 10 + Math.floor(Math.random() * 30);
  for (let i = 0; i < extra; i++) {
    const legal = chess.moves({ verbose: true });
    if (!legal.length) break;
    try { chess.move(legal[Math.floor(Math.random() * legal.length)].san); } catch { break; }
  }

  let result: string;
  if (chess.isCheckmate()) {
    result = chess.turn() === "w" ? "0-1" : "1-0";
  } else if (chess.isDraw() || chess.isStalemate()) {
    result = "0.5-0.5";
  } else {
    const diff = whiteRating - blackRating;
    const whiteProb = 1 / (1 + Math.pow(10, -diff / 400));
    const r = Math.random();
    result = r < whiteProb ? "1-0" : r < whiteProb + 0.1 ? "0.5-0.5" : "0-1";
  }

  return { pgn: chess.pgn(), result };
}

// ─── PLAY GAMES ───────────────────────────────────────────────────────────

async function playAllGames() {
  console.log(`\n⚔️ Playing all pending games...`);
  
  const fixturesByLeague = await getFixturesByLeague();
  let total = 0;
  let completed = 0;

  for (const [league, fixtures] of fixturesByLeague) {
    total += fixtures.length;
    console.log(`\n  ${league}: ${fixtures.length} games`);

    for (const game of fixtures) {
      // Get white & black ratings
      const [{ data: w }, { data: b }] = await Promise.all([
        supabase.from("players").select("ss4_rating").eq("id", game.white).single(),
        supabase.from("players").select("ss4_rating").eq("id", game.black).single(),
      ]);

      const { pgn, result } = generateRandomGame(
        (w as any)?.ss4_rating ?? 1200,
        (b as any)?.ss4_rating ?? 1200,
      );

      // Update game
      const { error: gErr } = await supabase
        .from("games")
        .update({ result, pgn, is_live: false, played_at: new Date().toISOString() })
        .eq("id", game.id);

      if (gErr) {
        console.log(`    ✗ ${game.id}: ${gErr.message}`);
        continue;
      }

      // Update ratings
      try {
        await fetch(`${BASE_URL}/api/ratings/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": process.env.INTERNAL_API_SECRET || "ss4-admin-2026-xyz",
          },
          body: JSON.stringify({ game_id: game.id, result, pgn }),
        });
      } catch {}

      completed++;
    }
    console.log(`    ✓ All complete`);
  }

  console.log(`\n✓ ${completed}/${total} games played`);
}

// ─── VERIFICATION ─────────────────────────────────────────────────────────

async function verifyStandings() {
  console.log(`\n📋 Final standings:`);
  const { data } = await supabase
    .from("standings")
    .select("league, player:players(full_name), points, wins, draws, losses, games_played")
    .eq("season", TEST_SEASON)
    .order("league")
    .order("points", { ascending: false });

  const byLeague = new Map<string, typeof data>();
  for (const s of data ?? []) {
    if (!byLeague.has(s.league)) byLeague.set(s.league, []);
    byLeague.get(s.league)!.push(s);
  }

  for (const [league, rows] of byLeague) {
    console.log(`\n  ${league}:`);
    rows.forEach((r, i) => {
      const p = r.player as any;
      console.log(`    ${i + 1}. ${p?.full_name ?? "?"} — ${r.points}pts (${r.wins}W ${r.draws}D ${r.losses}L) [${r.games_played} games]`);
    });
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

async function main() {
  if (!process.argv.includes("--commit")) {
    console.log("⚠️  DRY RUN — Add --commit to write to database");
    return;
  }

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   SS4 CHESS LEAGUE — ULTRA-REALISTIC TEST SUITE     ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  try {
    // Phase 1: FULL Cleanup
    console.log("\n═══ PHASE 1: CLEANUP ═══");
    await cleanupAll();

    // Phase 2: Setup
    console.log("\n═══ PHASE 2: SETUP ═══");
    await createSeason();

    // Phase 3: Registration
    console.log("\n═══ PHASE 3: REGISTRATION ═══");
    const players = await registerPlayers();

    if (players.length === 0) {
      throw new Error("No players registered!");
    }

    // Phase 4: Draft
    console.log("\n═══ PHASE 4: DRAFT ═══");
    await runDraft();

    // Phase 5: Play games
    console.log("\n═══ PHASE 5: PLAY GAMES ═══");
    await playAllGames();

    // Phase 6: Verify
    console.log("\n═══ PHASE 6: VERIFICATION ═══");
    await verifyStandings();

    console.log("\n═══════════════════════════════════════════");
    console.log("  ✅ ULTRA-REALISTIC TEST COMPLETE");
    console.log("═══════════════════════════════════════════\n");

  } catch (error) {
    console.error("\n❌ TEST FAILED:", (error as Error).message);
    process.exit(1);
  }
}

main();
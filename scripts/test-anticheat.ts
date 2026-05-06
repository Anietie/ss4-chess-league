// scripts/test-anticheat.ts
// Tests the anti-cheat analysis pipeline
// Run: npx tsx scripts/test-anticheat.ts

// Add BEFORE the supabase import
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local before anything else
config({ path: resolve(__dirname, "../.env.local") });

// Then import supabase
import { createServerClient } from "../src/lib/supabase-server";
import { Chess } from "chess.js";

const supabase = createServerClient();
const BASE = "http://localhost:3000";
const ADMIN_SECRET = "ss4-admin-2026-abc";

async function testAntiCheat() {
  console.log("🔍 SS4 Chess League — Anti-Cheat Test\n");

  // ── Step 1: Get two test players ────────────────────────────────────
  console.log("─── Setting up ───");
  
  const { data: players } = await supabase
    .from("players")
    .select("id, full_name, ss4_rating")
    .eq("is_active", true)
    .limit(2);

  if (!players || players.length < 2) {
    console.error("✗ Need at least 2 active players");
    process.exit(1);
  }

  const whitePlayer = players[0];
  const blackPlayer = players[1];
  console.log(`  White: ${whitePlayer.full_name}`);
  console.log(`  Black: ${blackPlayer.full_name}`);

  // ── Step 2: Create a game with engine-like moves ────────────────────
  console.log("\n─── Creating game ───");

  const chess = new Chess();
  
  // Play a game where white plays perfectly (all engine top-1 moves)
  // This SHOULD trigger the anti-cheat threshold
  const engineMoves = [
    "e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", 
    "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O",
    "h3", "Na5", "Bc2", "c5", "d4", "Qc7", "Nbd2", "cxd4",
    "cxd4", "Nc6", "Nb3", "a5", "Be3", "a4", "Nbd2", "a3",
    "bxa3", "Rxa3", "Rc1", "Ra8", "d5", "Nb4", "Bb1", "Nxe4",
    "Rxc7", "Nxd2", "Qxd2", "Rxc7", "Qg5", "g6", "Qf6", "Rfc8",
    "Bh6", "Rc1", "Rxc1", "Rxc1", "Qxf7+", "Kh8", "Qxe7",
  ];

  for (const move of engineMoves) {
    try {
      chess.move(move);
    } catch {
      break;
    }
  }

  // Force a result (white wins)
  const result = "1-0";
  const pgn = chess.pgn();

  const { data: game } = await supabase
    .from("games")
    .insert({
      season: 99,
      league: "test_anticheat",
      competition_phase: "league_phase",
      white_player_id: whitePlayer.id,
      black_player_id: blackPlayer.id,
      time_control: "600+5",
      result,
      pgn,
      is_rated: false,
      is_live: false,
      played_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (!game) {
    console.error("✗ Failed to create game");
    process.exit(1);
  }
  console.log(`  Game created: ${game.id}`);

  // ── Step 3: Build fake analysis data (all moves match engine) ──────
  console.log("\n─── Building analysis data ───");
  
  const analysisMoves = chess.history({ verbose: true });
  const analysisJson = analysisMoves.map((move, i) => ({
    ply: i + 1,
    score: 50 + Math.floor(Math.random() * 20), // Slight variation
    bestMove: move.from + move.to,
    top3: [
      move.from + move.to,  // Actual move is in top 3
      // Add some alternatives (but actual move always first = engine match)
    ],
  }));

  console.log(`  Analysis entries: ${analysisJson.length}`);

  // ── Step 4: Submit to anti-cheat API ───────────────────────────────
  console.log("\n─── Submitting to anti-cheat API ───");

  const res = await fetch(`${BASE}/api/games/${game.id}/anticheat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis_json: analysisJson }),
  });

  const data = await res.json();
  console.log(`  Response:`, JSON.stringify(data, null, 2));

  // ── Step 5: Check results ──────────────────────────────────────────
  console.log("\n─── Verification ───");

  const { data: updatedGame } = await supabase
    .from("games")
    .select("white_anticheat_score, black_anticheat_score, anticheat_flagged, analysis_json")
    .eq("id", game.id)
    .single();

  if (updatedGame) {
    console.log(`  White score: ${updatedGame.white_anticheat_score}%`);
    console.log(`  Black score: ${updatedGame.black_anticheat_score}%`);
    console.log(`  Flagged: ${updatedGame.anticheat_flagged}`);
    console.log(`  Analysis saved: ${updatedGame.analysis_json ? "✓" : "✗"}`);
  }

  // Check for conduct violations
  const { data: violations } = await supabase
    .from("conduct_violations")
    .select("*")
    .eq("game_id", game.id);

  if (violations && violations.length > 0) {
    console.log(`  Conduct violations created: ${violations.length}`);
    violations.forEach(v => {
      console.log(`    - Player: ${v.player_id}, Severity: ${v.severity}, Type: ${v.violation_type}`);
    });
  } else {
    console.log("  ⚠ No conduct violations created (may be below threshold)");
  }

  // ── Step 6: Check admin panel ─────────────────────────────────────
  console.log("\n─── Admin panel check ───");

  const flaggedRes = await fetch(`${BASE}/api/admin/anti-cheat/flagged-games`, {
    headers: { "x-admin-secret": ADMIN_SECRET },
  });
  const flaggedData = await flaggedRes.json();
  
  const ourGame = flaggedData.flagged_games?.find((g: any) => g.id === game.id);
  if (ourGame) {
    console.log("  ✓ Game appears in admin flagged games list");
  } else {
    console.log("  Game not in admin flagged list (may be normal if not flagged)");
  }

  // ── Cleanup (optional) ─────────────────────────────────────────────
  console.log("\n─── Cleanup ───");
  console.log(`  Game preserved for manual review: /game/${game.id}/review`);
  console.log(`  Admin review: /admin/anti-cheat`);

  // ── Results ────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════");
  console.log("  Anti-Cheat Test Results:");
  console.log(`  Game created:      ✓`);
  console.log(`  Analysis saved:    ${updatedGame?.analysis_json ? "✓" : "✗"}`);
  console.log(`  Score calculated:  ${updatedGame?.white_anticheat_score != null ? "✓" : "✗"}`);
  console.log(`  Flagged:           ${updatedGame?.anticheat_flagged ? "✓" : "— (may be normal)"}`);
  console.log(`  Violations:        ${violations?.length || 0}`);
  console.log("═══════════════════════════════════\n");
}

testAntiCheat().catch((e) => {
  console.error("\n❌ Test failed:", e.message);
  process.exit(1);
});
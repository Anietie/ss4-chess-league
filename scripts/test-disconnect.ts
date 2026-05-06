// scripts/test-disconnect.ts
// Tests the disconnect/reconnect flow with Socket.io
// Run: npx tsx scripts/test-disconnect.ts
// Requires: socket server running, at least 2 registered players

// Add BEFORE the supabase import
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local before anything else
config({ path: resolve(__dirname, "../.env.local") });

// Then import supabase
import { createServerClient } from "../src/lib/supabase-server";
import { io } from "socket.io-client";

const supabase = createServerClient();
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
const TEST_SEASON = 98; // Different from full season test

async function testDisconnectReconnect() {
  console.log("🔌 SS4 Chess League — Disconnect/Reconnect Test\n");

  // ── Step 1: Get or create two test players ─────────────────────────
  console.log("─── Setting up test players ───");
  
  // Find existing active players
  const { data: existingPlayers } = await supabase
    .from("players")
    .select("id, full_name, email, ss4_rating, auth_user_id")
    .eq("is_active", true)
    .limit(2);

  if (!existingPlayers || existingPlayers.length < 2) {
    console.error("✗ Need at least 2 active players. Run test-full-season.ts first or register manually.");
    process.exit(1);
  }

  const whitePlayer = existingPlayers[0];
  const blackPlayer = existingPlayers[1];
  console.log(`  White: ${whitePlayer.full_name} (${whitePlayer.ss4_rating})`);
  console.log(`  Black: ${blackPlayer.full_name} (${blackPlayer.ss4_rating})`);

  // ── Step 2: Create a test game ─────────────────────────────────────
  console.log("\n─── Creating test game ───");
  
  const { data: game } = await supabase
    .from("games")
    .insert({
      season: TEST_SEASON,
      league: "test_disconnect",
      competition_phase: "league_phase",
      white_player_id: whitePlayer.id,
      black_player_id: blackPlayer.id,
      time_control: "600+5",
      result: "*",
      is_rated: false,
      is_live: false,
    })
    .select("id")
    .single();

  if (!game) {
    console.error("✗ Failed to create test game");
    process.exit(1);
  }
  console.log(`  Game created: ${game.id}`);

  // ── Step 3: Connect both players ────────────────────────────────────
  console.log("\n─── Connecting players ───");

  const whiteSocket = io(SOCKET_URL, { transports: ["websocket"] });
  const blackSocket = io(SOCKET_URL, { transports: ["websocket"] });

  let gameStarted = false;
  let disconnectNotified = false;
  let reconnectNotified = false;

  // White player setup
  await new Promise<void>((resolve) => {
    whiteSocket.on("connect", () => {
      console.log("  White socket connected");
      whiteSocket.emit("join_game", {
        game_id: game.id,
        auth_user_id: whitePlayer.auth_user_id,
        player_id: whitePlayer.id,
        is_spectator: false,
      });
    });

    whiteSocket.on("game_started", () => {
      console.log("  ✓ Game started!");
      gameStarted = true;
    });

    // Listen for disconnect notifications
    whiteSocket.on("player_disconnected", ({ player_id }) => {
      if (player_id === blackPlayer.id) {
        console.log("  ✓ White received: Black disconnected");
        disconnectNotified = true;
      }
    });

    // Listen for reconnect notifications
    whiteSocket.on("player_joined", ({ player_id }) => {
      if (player_id === blackPlayer.id) {
        console.log("  ✓ White received: Black reconnected");
        reconnectNotified = true;
      }
    });

    blackSocket.on("connect", () => {
      console.log("  Black socket connected");
      blackSocket.emit("join_game", {
        game_id: game.id,
        auth_user_id: blackPlayer.auth_user_id,
        player_id: blackPlayer.id,
        is_spectator: false,
      });
    });

    // Wait for game to start
    const checkInterval = setInterval(() => {
      if (gameStarted) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 10000);
  });

  if (!gameStarted) {
    console.log("  ⚠ Game didn't start — continuing with test");
  }

  // ── Step 4: Test Disconnect ─────────────────────────────────────────
  console.log("\n─── Testing disconnect ───");

  // Make a move first so game is "active"
  if (gameStarted) {
    whiteSocket.emit("make_move", {
      game_id: game.id,
      player_id: whitePlayer.id,
      move: { from: "e2", to: "e4", promotion: "q" },
    });
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("  → Disconnecting black player...");
  blackSocket.disconnect();
  
  // Wait for the disconnect event to propagate
  await new Promise(r => setTimeout(r, 2000));
  
  console.log(`  Disconnect notification: ${disconnectNotified ? "✓ RECEIVED" : "✗ NOT RECEIVED"}`);

  // ── Step 5: Test Reconnect ──────────────────────────────────────────
  console.log("\n─── Testing reconnect ───");
  console.log("  → Reconnecting black player...");

  const blackSocket2 = io(SOCKET_URL, { transports: ["websocket"] });

  await new Promise<void>((resolve) => {
    blackSocket2.on("connect", () => {
      console.log("  Black socket reconnected");
      blackSocket2.emit("join_game", {
        game_id: game.id,
        auth_user_id: blackPlayer.auth_user_id,
        player_id: blackPlayer.id,
        is_spectator: false,
      });
    });

    // Wait a bit for the rejoin notification
    setTimeout(() => resolve(), 3000);
  });

  console.log(`  Reconnect notification: ${reconnectNotified ? "✓ RECEIVED" : "⚠ NOT RECEIVED (may be normal if game ended)"}`);

  // If game is still active, make a move to verify functionality
  if (gameStarted) {
    try {
      blackSocket2.emit("make_move", {
        game_id: game.id,
        player_id: blackPlayer.id,
        move: { from: "e7", to: "e5", promotion: "q" },
      });
      console.log("  ✓ Post-reconnect move sent");
    } catch {
      console.log("  ⚠ Post-reconnect move failed");
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────
  console.log("\n─── Cleanup ───");
  whiteSocket.disconnect();
  blackSocket2.disconnect();

  // Don't delete the game — it's useful for manual inspection
  console.log(`  Test game preserved: ${game.id} (league: test_disconnect)`);

  // ── Results ─────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════");
  console.log("  Disconnect/Reconnect Test Results:");
  console.log(`  Game started:        ${gameStarted ? "✓" : "✗"}`);
  console.log(`  Disconnect notified: ${disconnectNotified ? "✓" : "✗"}`);
  console.log(`  Reconnect notified:  ${reconnectNotified ? "✓" : "⚠"}`);
  console.log("═══════════════════════════════════\n");

  const allPassed = gameStarted && disconnectNotified;
  process.exit(allPassed ? 0 : 1);
}

testDisconnectReconnect().catch((e) => {
  console.error("\n❌ Test failed:", e.message);
  process.exit(1);
});
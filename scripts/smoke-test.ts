// scripts/smoke-test.ts
// Quick 2-player test for individual features
// Run: npx tsx scripts/smoke-test.ts
// Add BEFORE the supabase import
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local before anything else
config({ path: resolve(__dirname, "../.env.local") });

// Then import supabase
import { createServerClient } from "../src/lib/supabase";

async function smokeTest() {
  console.log("🔍 SS4 Chess League — Smoke Test\n");

  const BASE = "http://localhost:3000";
  
  // 1. Health check
  const health = await fetch(`${BASE}/api/players?limit=1`);
  console.log(health.ok ? "✓ API responding" : "✗ API down");

  // 2. Public routes
  for (const path of ["/", "/players", "/champions-league", "/hall-of-champions"]) {
    const res = await fetch(`${BASE}${path}`);
    console.log(res.ok ? `✓ ${path}` : `✗ ${path} (${res.status})`);
  }

  // 3. Auth flow
  const loginRes = await fetch(`${BASE}/auth/login`);
  console.log(loginRes.ok ? "✓ Login page" : "✗ Login page");

  // 4. Game server
  try {
    const socketHealth = await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL}/health`);
    const data = await socketHealth.json();
    console.log(`✓ Socket server (${data.clients} clients, ${data.active_games} games)`);
  } catch {
    console.log("✗ Socket server unreachable");
  }

  console.log("\n✓ Smoke test complete");
}

smokeTest().catch(console.error);
/**
 * scripts/generate-fixtures.ts
 * Run: npx tsx scripts/generate-fixtures.ts --season=1 --league=league_1 --tier=premier --start=2026-05-01
 */
import {
  generateRoundRobin,
  generateSwissRound1,
} from "../src/lib/fixture-generator";
import { createServerClient } from "../src/lib/supabase";

const supabase = createServerClient();

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const season = Number(arg("season") ?? 1);
const league = arg("league") ?? "league_1";
const tier = arg("tier") ?? "premier";
const start = arg("start") ?? new Date().toISOString().split("T")[0];
const tc = arg("tc") ?? "600+5";
const commit = process.argv.includes("--commit");

async function main() {
  console.log(
    `\n📅 Generating fixtures: Season ${season} / ${league} / ${tier}\n`,
  );

  const { data: players } = await supabase
    .from("players")
    .select("id, full_name, ss4_rating")
    .eq("home_league", league)
    .eq("current_tier", tier)
    .eq("is_active", true)
    .eq("is_suspended", false);

  if (!players?.length) {
    console.error("No players found.");
    process.exit(1);
  }
  console.log(`Players: ${players.length}`);
  if (players.length < 6) {
    console.error("Need at least 6.");
    process.exit(1);
  }

  const useSwiss = players.length >= 8;
  const fixtures = useSwiss
    ? generateSwissRound1(players).fixtures
    : generateRoundRobin(players);
  console.log(
    `Format: ${useSwiss ? "Swiss" : "Round Robin"} | ${fixtures.length} fixtures | ${Math.max(...fixtures.map((f) => f.round))} rounds\n`,
  );

  const base = new Date(start);
  fixtures.forEach((f) => {
    const d = new Date(base);
    d.setDate(base.getDate() + f.day_offset);
    console.log(
      `  R${f.round}: ${f.white_name.padEnd(25)} vs ${f.black_name.padEnd(25)} ${d.toISOString().split("T")[0]}`,
    );
  });

  if (!commit) {
    console.log("\nDry run. Add --commit to write to DB.");
    return;
  }

  const rows = fixtures.map((f) => {
    const d = new Date(base);
    d.setDate(base.getDate() + f.day_offset);
    const dl = new Date(d);
    dl.setDate(d.getDate() + 2);
    return {
      season,
      round: f.round,
      league,
      tier,
      competition_phase: "league_phase",
      white_player_id: f.white_player_id,
      black_player_id: f.black_player_id,
      scheduled_date: d.toISOString().split("T")[0],
      deadline_date: dl.toISOString().split("T")[0],
      time_control: tc,
      result: "*",
    };
  });

  const { error } = await supabase.from("games").insert(rows);
  if (error) throw error;

  const standingRows = players.map((p) => ({
    season,
    league,
    tier,
    player_id: p.id,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    games_played: 0,
  }));
  await supabase.from("standings").upsert(standingRows, {
    onConflict: "season,league,tier,player_id",
    ignoreDuplicates: true,
  });

  console.log(`\n✓ ${rows.length} fixtures written to DB.`);
}
main().catch(console.error);

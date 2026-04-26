/**
 * scripts/run-draft.ts
 * Run: npx tsx scripts/run-draft.ts --season=1
 */
import { createClient } from "@supabase/supabase-js";
import { checkLeagueImbalance, runSnakeDraft } from "../src/lib/snake-draft";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const season = Number(
  process.argv.find((a) => a.startsWith("--season="))?.split("=")[1] ?? 1,
);

async function main() {
  console.log(`\n🎯 Running Snake Draft for Season ${season}\n`);
  const { data: players, error } = await supabase
    .from("players")
    .select(
      "id, full_name, ss4_rating, rating_deviation, calibration_complete, is_active, is_suspended",
    )
    .eq("joining_season", season)
    .eq("is_active", true)
    .eq("is_suspended", false)
    .eq("calibration_complete", true);
  if (error) throw error;
  if (!players?.length) {
    console.error("No eligible players found.");
    process.exit(1);
  }

  console.log(`Players eligible: ${players.length}\n`);
  const result = runSnakeDraft(players);
  const imbalance = checkLeagueImbalance(result.stats);

  console.log("Draft Order:");
  result.assignments.forEach((a) => {
    console.log(
      `  #${String(a.draft_position).padStart(2)} ${a.full_name.padEnd(30)} → ${a.assigned_league} / ${a.assigned_tier} (${a.seed_rating})`,
    );
  });

  console.log("\nLeague Stats:");
  Object.entries(result.stats).forEach(([league, s]: any) => {
    console.log(
      `  ${league}: ${s.playerCount} players | avg ${Math.round(s.averageRating)} | range ${s.minRating}–${s.maxRating}`,
    );
  });

  if (imbalance.imbalanced) console.warn(`\n⚠️  ${imbalance.details}`);

  const confirm = process.argv.includes("--commit");
  if (!confirm) {
    console.log("\nDry run. Add --commit to write to DB.");
    return;
  }

  for (const a of result.assignments) {
    await supabase
      .from("players")
      .update({ home_league: a.assigned_league, current_tier: a.assigned_tier })
      .eq("id", a.player_id);
    await supabase
      .from("season_draft")
      .upsert(
        {
          season,
          player_id: a.player_id,
          draft_position: a.draft_position,
          assigned_league: a.assigned_league,
          assigned_tier: a.assigned_tier,
          seed_rating_at_draft: a.seed_rating,
        },
        { onConflict: "season,player_id" },
      );
  }
  await supabase.from("seasons").update({ status: "active" }).eq("id", season);
  console.log("\n✓ Draft committed to database.");
}
main().catch(console.error);

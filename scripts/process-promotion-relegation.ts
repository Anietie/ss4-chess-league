import { createServerClient } from "../src/lib/supabase";

const supabase = createServerClient();
const arg = (n: string) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

async function processPromotionRelegation() {
  const season = Number(arg("season") ?? 1);
  const commit = process.argv.includes("--commit");
  console.log(`\n📊 Promotion/Relegation for Season ${season}\n`);

  const changes: any[] = [];
  for (const league of ["league_1", "league_2", "league_3", "league_4"]) {
    const { data: premier } = await supabase
      .from("standings")
      .select("player_id, points, wins, player:players(full_name)")
      .eq("season", season)
      .eq("league", league)
      .eq("tier", "premier")
      .order("points", { ascending: false })
      .order("wins", { ascending: false });
    const { data: dev } = await supabase
      .from("standings")
      .select("player_id, points, wins, player:players(full_name)")
      .eq("season", season)
      .eq("league", league)
      .eq("tier", "development")
      .order("points", { ascending: false })
      .order("wins", { ascending: false });
    if (!premier?.length || !dev?.length) continue;

    const relegated = premier.slice(-2);
    const promoted = dev.slice(0, 2);
    for (const p of relegated)
      changes.push({
        action: "RELEGATED",
        league,
        player_id: p.player_id,
        name: (p.player as any)?.full_name,
      });
    for (const p of promoted)
      changes.push({
        action: "PROMOTED",
        league,
        player_id: p.player_id,
        name: (p.player as any)?.full_name,
      });
  }

  changes.forEach((c) =>
    console.log(`  ${c.action.padEnd(10)} ${c.name?.padEnd(30)} ${c.league}`),
  );

  if (!commit) {
    console.log("\nDry run. Add --commit to apply.");
    return;
  }
  for (const c of changes) {
    await supabase
      .from("players")
      .update({
        current_tier: c.action === "RELEGATED" ? "development" : "premier",
      })
      .eq("id", c.player_id);
  }
  console.log(`\n✓ ${changes.length} changes applied.`);
}
processPromotionRelegation().catch(console.error);

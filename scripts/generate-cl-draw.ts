import { createClient } from "@supabase/supabase-js";
import { drawCLGroups } from "../src/lib/fixture-generator";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const arg = (n: string) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

async function generateCLDraw() {
  const season = Number(arg("season") ?? 1);
  const commit = process.argv.includes("--commit");

  // Top 2 from each league by final premier standings + coefficient spots
  const { data: qualifiers } = await supabase
    .from("champions_league")
    .select(
      `player_id, seeding_pot, from_league, domestic_finish, 
       players:players(full_name, ss4_rating)`,
    )
    .eq("season", season);

  if (!qualifiers?.length) {
    console.error("No CL qualifiers in DB. Add them first.");
    return;
  }

  console.log(
    `\n🎲 CL Draw — Season ${season} | ${qualifiers.length} qualifiers\n`,
  );
  
  const qualifierMap = new Map(
    qualifiers.map((q: any) => [
      q.player_id,
      {
        full_name: q.players?.full_name || "Unknown",
        from_league: q.from_league,
        seeding_pot: q.seeding_pot ?? 2,
        ss4_rating: q.players?.ss4_rating || 1000,
      },
    ]),
  );

  const draw = drawCLGroups(
    qualifiers.map((q: any) => ({
      player_id: q.player_id,
      full_name: q.players?.full_name || "Unknown",
      from_league: q.from_league,
      domestic_finish: q.domestic_finish,
      seeding_pot: q.seeding_pot ?? 2,
      ss4_rating: q.players?.ss4_rating || 1000,
    })),
  );

  console.log("  Group A:");
  draw.groupA.forEach((player_id) => {
    const q = qualifierMap.get(player_id);
    console.log(
      `    ${q?.full_name} (${q?.from_league}) — Pot ${q?.seeding_pot}`,
    );
  });

  console.log("  Group B:");
  draw.groupB.forEach((player_id) => {
    const q = qualifierMap.get(player_id);
    console.log(
      `    ${q?.full_name} (${q?.from_league}) — Pot ${q?.seeding_pot}`,
    );
  });

  if (!commit) {
    console.log("\nDry run. Add --commit.");
    return;
  }
  for (const player_id of draw.groupA) {
    await supabase
      .from("champions_league")
      .update({ cl_group: "A" })
      .eq("player_id", player_id)
      .eq("season", season);
  }
  for (const player_id of draw.groupB) {
    await supabase
      .from("champions_league")
      .update({ cl_group: "B" })
      .eq("player_id", player_id)
      .eq("season", season);
  }
  console.log("\n✓ Groups assigned.");
}
generateCLDraw().catch(console.error);

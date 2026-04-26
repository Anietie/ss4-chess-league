import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const season = new URL(req.url).searchParams.get("season") ?? "1";
  const supabase = createServerClient();
  const { data: games } = await supabase
    .from("games")
    .select(
      `id, round, result, time_control,
      white_player:players!games_white_player_id_fkey(id, full_name, ss4_rating),
      black_player:players!games_black_player_id_fkey(id, full_name, ss4_rating)`,
    )
    .eq("season", Number(season))
    .eq("league", "blitz")
    .order("round");
  return NextResponse.json({
    games,
    time_control: "180+2",
    format: "round_robin",
  });
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-secret") !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { season, action, invited_player_ids } = await req.json();
  const supabase = createServerClient();

  if (action === "generate_blitz_fixtures") {
    // Invitational: top N players by rating or admin-selected
    let players;
    if (invited_player_ids?.length) {
      const { data } = await supabase
        .from("players")
        .select("id, full_name, ss4_rating")
        .in("id", invited_player_ids);
      players = data;
    } else {
      const { data } = await supabase
        .from("players")
        .select("id, full_name, ss4_rating")
        .eq("is_active", true)
        .order("ss4_rating", { ascending: false })
        .limit(8);
      players = data;
    }
    if (!players?.length)
      return NextResponse.json({ error: "No players" }, { status: 400 });

    const { generateRoundRobin } = await import("@/lib/fixture-generator");
    const fixtures = generateRoundRobin(players);
    const rows = fixtures.map((f) => ({
      season,
      round: f.round,
      league: "blitz",
      tier: "n_a",
      competition_phase: "blitz_round_robin",
      white_player_id: f.white_player_id,
      black_player_id: f.black_player_id,
      time_control: "180+2", // 3+2 blitz
      result: "*",
    }));
    await supabase.from("games").insert(rows);

    // Blitz ratings are tracked separately — not mixed with SS4 Glicko-2 ratings
    // Each blitz result updates blitz_rating (separate column, if present)
    return NextResponse.json({
      success: true,
      participants: players.length,
      fixtures: rows.length,
      time_control: "180+2",
    });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

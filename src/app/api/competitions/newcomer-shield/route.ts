import { generateSingleElimination } from "@/lib/fixture-generator";
import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const season = new URL(req.url).searchParams.get("season") ?? "1";
  const supabase = createServerClient();
  const [{ data: games }, { data: players }] = await Promise.all([
    supabase
      .from("games")
      .select(
        `id, round, result,
      white_player:players!games_white_player_id_fkey(id, full_name),
      black_player:players!games_black_player_id_fkey(id, full_name)`,
      )
      .eq("season", Number(season))
      .eq("league", "newcomer_shield")
      .order("round"),
    supabase
      .from("players")
      .select("id, full_name, ss4_rating, joining_season")
      .eq("joining_season", Number(season))
      .eq("is_active", true),
  ]);
  return NextResponse.json({ games, eligible_players: players });
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-secret") !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { season, action } = await req.json();
  const supabase = createServerClient();

  if (action === "draw_bracket") {
    const { data: players } = await supabase
      .from("players")
      .select("id, full_name, ss4_rating")
      .eq("joining_season", season)
      .eq("is_active", true);
    if (!players?.length)
      return NextResponse.json(
        { error: "No first-season players found" },
        { status: 400 },
      );

    // Seeded by rating
    const seeded = [...players].sort((a, b) => b.ss4_rating - a.ss4_rating);
    const bracket = generateSingleElimination(seeded);

    const rows = bracket.map((f) => ({
      season,
      round: f.round,
      league: "newcomer_shield",
      tier: "n_a",
      competition_phase: `shield_round_${f.round}`,
      white_player_id: f.white_player_id,
      black_player_id: f.black_player_id,
      time_control: "600+5",
      result: "*",
    }));
    await supabase.from("games").insert(rows);
    return NextResponse.json({
      success: true,
      participants: players.length,
      fixtures: rows.length,
    });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

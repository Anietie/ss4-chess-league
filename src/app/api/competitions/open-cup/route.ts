import { generateSingleElimination } from "@/lib/fixture-generator";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const db = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function GET(req: NextRequest) {
  const season = new URL(req.url).searchParams.get("season") ?? "1";
  const supabase = db();
  const { data: games } = await supabase
    .from("games")
    .select(
      `id, round, result, competition_phase,
      white_player:players!games_white_player_id_fkey(id, full_name, home_league),
      black_player:players!games_black_player_id_fkey(id, full_name, home_league)`,
    )
    .eq("season", Number(season))
    .eq("league", "open_cup")
    .order("round");
  return NextResponse.json({ games });
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-secret") !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { season, action } = await req.json();
  const supabase = db();

  if (action === "draw_bracket") {
    const { data: players } = await supabase
      .from("players")
      .select("id, full_name, ss4_rating")
      .eq("is_active", true)
      .eq("is_suspended", false);
    if (!players?.length)
      return NextResponse.json({ error: "No players" }, { status: 400 });

    // Random shuffle
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const bracket = generateSingleElimination(shuffled);

    const rows = bracket.map((f) => ({
      season,
      round: f.round,
      league: "open_cup",
      tier: "n_a",
      competition_phase: `cup_round_${f.round}`,
      white_player_id: f.white_player_id,
      black_player_id: f.black_player_id,
      time_control: "600+5",
      result: "*",
    }));
    await supabase.from("games").insert(rows);

    // Notify all participants
    for (const row of rows) {
      await supabase.from("notifications").insert([
        {
          player_id: row.white_player_id,
          type: "fixture_scheduled",
          title: "Open Cup — Round 1",
          message: `Your Open Cup Round 1 fixture has been drawn.`,
        },
        {
          player_id: row.black_player_id,
          type: "fixture_scheduled",
          title: "Open Cup — Round 1",
          message: `Your Open Cup Round 1 fixture has been drawn.`,
        },
      ]);
    }
    return NextResponse.json({
      success: true,
      participants: players.length,
      fixtures: rows.length,
    });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

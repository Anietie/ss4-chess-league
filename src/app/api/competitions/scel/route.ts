// src/app/api/competitions/scel/route.ts
// Replace the old open-cup route

import { generateScelBracket } from "@/lib/scel-generator";
import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const season = new URL(req.url).searchParams.get("season") ?? "1";
  const supabase = createServerClient();
  
  const [{ data: games }, { data: playerCount }] = await Promise.all([
    supabase
      .from("games")
      .select(`
        id, round, result, competition_phase,
        white_player:players!games_white_player_id_fkey(id, full_name, home_league),
        black_player:players!games_black_player_id_fkey(id, full_name, home_league)
      `)
      .eq("season", Number(season))
      .eq("league", "scel")
      .order("round"),
    supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_suspended", false),
  ]);

  return NextResponse.json({
    games,
    total_players: playerCount ?? 0,
    format: "single_elimination",
    name: "SS4 Chess Elimination League",
    abbreviation: "SCEL",
  });
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-secret") !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { season, action } = await req.json();
  const supabase = createServerClient();

  if (action === "generate_bracket") {
    const { data: players } = await supabase
      .from("players")
      .select("id, full_name, ss4_rating")
      .eq("is_active", true)
      .eq("is_suspended", false);

    if (!players?.length) {
      return NextResponse.json({ error: "No eligible players" }, { status: 400 });
    }

    const bracket = generateScelBracket(players);

    const rows = bracket.fixtures.map((f) => ({
      season,
      round: f.round,
      league: "scel",
      competition_phase: f.competition_phase,
      white_player_id: f.white_player_id,
      black_player_id: f.black_player_id,
      time_control: "600+5",
      result: "*",
      is_rated: true,
    }));

    await supabase.from("games").insert(rows);

    return NextResponse.json({
      success: true,
      bracket_size: bracket.bracket_size,
      total_rounds: bracket.total_rounds,
      byes_awarded: bracket.byes_awarded,
      fixtures_created: rows.length,
      participants: players.length,
    });
  }

  // Generate next round after previous round results are in
  if (action === "generate_next_round") {
    // Fetch completed SCEL games for this season, find winners
    // Group by competition_phase to determine current round
    // Pair winners for next round
    // (Implementation depends on how you track bracket progression)
    return NextResponse.json({ error: "Not yet implemented" }, { status: 501 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
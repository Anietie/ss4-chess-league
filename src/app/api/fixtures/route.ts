import {
    generateRoundRobin,
    generateSwissRound1,
} from "@/lib/fixture-generator";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

// POST /api/fixtures  — admin only
// Body: { season, league, tier, start_date, time_control? }
export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-secret") !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    season,
    league,
    tier,
    start_date,
    time_control = "600+5",
  } = await req.json();
  if (!season || !league || !tier || !start_date)
    return NextResponse.json(
      { error: "season, league, tier, start_date required" },
      { status: 400 },
    );

  const supabase = adminSupabase();

  // Fetch players in this league+tier
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, full_name, ss4_rating")
    .eq("home_league", league)
        .eq("is_active", true)
    .eq("is_suspended", false);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!players || players.length < 6)
    return NextResponse.json(
      { error: `Need at least 6 players, found ${players?.length ?? 0}` },
      { status: 400 },
    );
  if (players.length > 10)
    return NextResponse.json(
      { error: `Tier has ${players.length} players — max is 10` },
      { status: 400 },
    );

  // Choose format: Swiss if ≥8, round-robin if <8
  const useSwiss = players.length >= 8;
  const fixturesData = useSwiss
    ? generateSwissRound1(players).fixtures
    : generateRoundRobin(players);

  const base = new Date(start_date);
  const gameRows = fixturesData.map((f) => {
    const scheduled = new Date(base);
    scheduled.setDate(base.getDate() + f.day_offset);
    const deadline = new Date(scheduled);
    deadline.setDate(scheduled.getDate() + 2); // 2-day window per round
    return {
      season,
      round: f.round,
      league,
      tier,
      competition_phase: "league_phase",
      white_player_id: f.white_player_id,
      black_player_id: f.black_player_id,
      scheduled_date: scheduled.toISOString().split("T")[0],
      deadline_date: deadline.toISOString().split("T")[0],
      time_control,
      result: "*",
    };
  });

  const { error: gErr } = await supabase.from("games").insert(gameRows);
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  // Initialise standings rows for all players
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
  await supabase
    .from("standings")
    .upsert(standingRows, {
      onConflict: "season,league,tier,player_id",
      ignoreDuplicates: true,
    });

  // Notify players of their fixtures
  for (const f of fixturesData) {
    await supabase.from("notifications").insert([
      {
        player_id: f.white_player_id,
        type: "fixture_scheduled",
        title: `Round ${f.round} Fixture Scheduled`,
        message: `You play as White vs ${f.black_name}. Scheduled: ${gameRows.find((g) => g.round === f.round && g.white_player_id === f.white_player_id)?.scheduled_date}`,
      },
      {
        player_id: f.black_player_id,
        type: "fixture_scheduled",
        title: `Round ${f.round} Fixture Scheduled`,
        message: `You play as Black vs ${f.white_name}. Scheduled: ${gameRows.find((g) => g.round === f.round && g.black_player_id === f.black_player_id)?.scheduled_date}`,
      },
    ]);
  }

  return NextResponse.json({
    success: true,
    format: useSwiss ? "swiss" : "round_robin",
    fixtures_created: gameRows.length,
    players: players.length,
    rounds: Math.max(...fixturesData.map((f) => f.round)),
  });
}

// GET /api/fixtures?season=1&league=league_1&tier=premier&status=pending
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const supabase = adminSupabase();

  let query = supabase
    .from("games")
    .select(
      `
      id, round, league, tier, result, scheduled_date, deadline_date, time_control, played_at,
      white_player:players!games_white_player_id_fkey(id, full_name, ss4_rating, is_provisional, rating_deviation),
      black_player:players!games_black_player_id_fkey(id, full_name, ss4_rating, is_provisional, rating_deviation)
    `,
    )
    .neq("league", "calibration");

  if (p.get("season")) query = query.eq("season", Number(p.get("season")));
  if (p.get("league")) query = query.eq("league", p.get("league")!);
  if (p.get("tier")) query = query.eq("tier", p.get("tier")!);
  if (p.get("status") === "pending") query = query.eq("result", "*");
  if (p.get("status") === "completed") query = query.neq("result", "*");
  if (p.get("player_id")) {
    query = query.or(
      `white_player_id.eq.${p.get("player_id")},black_player_id.eq.${p.get("player_id")}`,
    );
  }

  query = query.order("round").order("scheduled_date");

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fixtures: data });
}
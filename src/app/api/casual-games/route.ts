import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// GET /api/casual-games - List available casual games
export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const url = new URL(req.url);

  const playerId = url.searchParams.get("player_id");
  const status = url.searchParams.get("status") ?? "pending";
  const isRated =
    url.searchParams.get("is_rated") === "true"
      ? true
      : url.searchParams.get("is_rated") === "false"
        ? false
        : undefined;

  let query = supabase
    .from("casual_games")
    .select(
      `
      id, challenger_id, opponent_id, status, is_rated, time_control,
      challenger:players!challenger_id(id, full_name, ss4_rating, rating_deviation),
      opponent:players!opponent_id(id, full_name, ss4_rating, rating_deviation),
      created_at, played_at
    `,
    )
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (isRated !== undefined) {
    query = query.eq("is_rated", isRated);
  }

  if (playerId) {
    query = query.or(`challenger_id.eq.${playerId},opponent_id.eq.${playerId}`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching casual games:", error);
    return NextResponse.json(
      { error: "Failed to fetch casual games" },
      { status: 500 },
    );
  }

  return NextResponse.json({ casual_games: data ?? [] });
}

// POST /api/casual-games - Create a casual challenge
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();
  const { opponent_id, is_rated, time_control } = body;
  const authHeader = req.headers.get("authorization");

  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get challenger from auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: challenger } = await supabase
    .from("players")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!challenger || !opponent_id) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (challenger.id === opponent_id) {
    return NextResponse.json(
      { error: "Cannot challenge yourself" },
      { status: 400 },
    );
  }

  // Create casual game challenge
  const { data: casualGame, error } = await supabase
    .from("casual_games")
    .insert({
      challenger_id: challenger.id,
      opponent_id,
      is_rated: is_rated ?? false,
      time_control: time_control ?? "600+5",
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating casual game:", error);
    return NextResponse.json(
      { error: "Failed to create challenge" },
      { status: 500 },
    );
  }

  // Create notification for opponent
  await supabase.from("notifications").insert({
    player_id: opponent_id,
    title: "New Casual Challenge",
    message: `You have been challenged to a ${is_rated ? "rated" : "unrated"} casual game`,
    type: "casual_challenge",
    related_id: casualGame.id,
  });

  return NextResponse.json({ casual_game: casualGame }, { status: 201 });
}

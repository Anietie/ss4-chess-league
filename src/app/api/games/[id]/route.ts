import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data: game, error } = await supabase
    .from("games")
    .select(
      `
      *,
      white_player:players!games_white_player_id_fkey(id, full_name, ss4_rating, rating_deviation, home_league, is_provisional),
      black_player:players!games_black_player_id_fkey(id, full_name, ss4_rating, rating_deviation, home_league, is_provisional)
    `,
    )
    .eq("id", id)
    .single();

  if (error || !game)
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  return NextResponse.json({ game });
}

// POST → record forfeit
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const adminSecret = req.headers.get("x-admin-secret");
  if (adminSecret !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { forfeit_player_id, reason } = await req.json();
  const supabase = createServerClient();

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .single();
  if (!game)
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.result !== "*")
    return NextResponse.json(
      { error: "Game already has a result" },
      { status: 400 },
    );

  const result = forfeit_player_id === game.white_player_id ? "0-1" : "1-0";

  // Increment forfeit counter
  await supabase
    .from("players")
    .update({
      season_forfeit_count: supabase.rpc("increment", { x: 1 }),
    })
    .eq("id", forfeit_player_id);

  // Call rating update
  const ratingRes = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/ratings/update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({ game_id: id, result, pgn: "" }),
    },
  );

  const winnerId =
    result === "1-0" ? game.black_player_id : game.white_player_id;

  await supabase.from("notifications").insert([
    {
      player_id: forfeit_player_id,
      type: "result_recorded",
      title: "Game Forfeited",
      message: `Your game has been recorded as a forfeit. Reason: ${reason || "No-show / deadline missed"}.`,
    },
    {
      player_id: winnerId,
      type: "result_recorded",
      title: "Opponent Forfeited",
      message: "Your opponent forfeited. You have been awarded the win.",
    },
  ]);

  // Check for suspension (3 forfeits = suspended)
  const { data: player } = await supabase
    .from("players")
    .select("season_forfeit_count, full_name")
    .eq("id", forfeit_player_id)
    .single();
  if ((player?.season_forfeit_count || 0) >= 3) {
    await supabase
      .from("players")
      .update({
        is_suspended: true,
        suspension_reason: "3 forfeits in Season 1",
      })
      .eq("id", forfeit_player_id);
    await supabase.from("notifications").insert({
      player_id: forfeit_player_id,
      type: "suspension",
      title: "Account Suspended",
      message:
        "You have accumulated 3 forfeits this season. Your account has been suspended pending review by the League Officer.",
    });
  }

  return NextResponse.json({ success: true, result, forfeit_processed: true });
}

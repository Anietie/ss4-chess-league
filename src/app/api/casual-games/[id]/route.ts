import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/casual-games/[id] - Accept or decline a casual game
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json();
  const { action } = body; // 'accept' or 'decline'

  // Get current player
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Get casual game
  const { data: casualGame } = await supabase
    .from("casual_games")
    .select("*")
    .eq("id", id)
    .single();

  if (!casualGame) {
    return NextResponse.json(
      { error: "Casual game not found" },
      { status: 404 },
    );
  }

  // Verify player is the opponent
  if (casualGame.opponent_id !== player.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (action === "accept") {
    // Accept the challenge - create a new game
    const { data: challenger } = await supabase
      .from("players")
      .select("ss4_rating, rating_deviation")
      .eq("id", casualGame.challenger_id)
      .single();

    const { data: opponent } = await supabase
      .from("players")
      .select("ss4_rating, rating_deviation")
      .eq("id", casualGame.opponent_id)
      .single();

    // Randomly assign colors
    const whiteIsChallenger = Math.random() > 0.5;
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        season: 1,
        league: "casual",
        competition_phase: "casual",
        white_player_id: whiteIsChallenger
          ? casualGame.challenger_id
          : casualGame.opponent_id,
        black_player_id: whiteIsChallenger
          ? casualGame.opponent_id
          : casualGame.challenger_id,
        time_control: casualGame.time_control,
        white_rating_before: whiteIsChallenger
          ? challenger?.ss4_rating
          : opponent?.ss4_rating,
        black_rating_before: whiteIsChallenger
          ? opponent?.ss4_rating
          : challenger?.ss4_rating,
        white_rd_before: whiteIsChallenger
          ? challenger?.rating_deviation
          : opponent?.rating_deviation,
        black_rd_before: whiteIsChallenger
          ? opponent?.rating_deviation
          : challenger?.rating_deviation,
        result: "*",
        is_live: true,
      })
      .select("id")
      .single();

    if (gameError) {
      console.error("Error creating game:", gameError);
      return NextResponse.json(
        { error: "Failed to create game" },
        { status: 500 },
      );
    }

    // Update casual game with accepted status and game_id
    const { data: updated, error: updateError } = await supabase
      .from("casual_games")
      .update({
        status: "accepted",
        game_id: game.id,
        white_player_id: whiteIsChallenger
          ? casualGame.challenger_id
          : casualGame.opponent_id,
        black_player_id: whiteIsChallenger
          ? casualGame.opponent_id
          : casualGame.challenger_id,
        white_rating_before: whiteIsChallenger
          ? challenger?.ss4_rating
          : opponent?.ss4_rating,
        black_rating_before: whiteIsChallenger
          ? opponent?.ss4_rating
          : challenger?.ss4_rating,
        is_live: true,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating casual game:", updateError);
      return NextResponse.json(
        { error: "Failed to accept challenge" },
        { status: 500 },
      );
    }

    // Notify challenger
    await supabase.from("notifications").insert({
      player_id: casualGame.challenger_id,
      title: "Challenge Accepted",
      message: "Your casual challenge was accepted! Join the game.",
      type: "casual_accepted",
      related_id: game.id,
    });

    return NextResponse.json({
      casual_game: updated,
      game_id: game.id,
    });
  } else if (action === "decline") {
    // Decline the challenge
    const { data: updated, error: updateError } = await supabase
      .from("casual_games")
      .update({ status: "declined" })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error declining casual game:", updateError);
      return NextResponse.json(
        { error: "Failed to decline challenge" },
        { status: 500 },
      );
    }

    // Notify challenger
    await supabase.from("notifications").insert({
      player_id: casualGame.challenger_id,
      title: "Challenge Declined",
      message: "Your casual challenge was declined.",
      type: "casual_declined",
      related_id: id,
    });

    return NextResponse.json({ casual_game: updated });
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}

// DELETE /api/casual-games/[id] - Cancel a casual game challenge
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: casualGame } = await supabase
    .from("casual_games")
    .select("*")
    .eq("id", id)
    .single();

  if (!casualGame) {
    return NextResponse.json(
      { error: "Casual game not found" },
      { status: 404 },
    );
  }

  if (casualGame.challenger_id !== player.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (casualGame.status !== "pending") {
    return NextResponse.json(
      { error: "Cannot cancel this challenge" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("casual_games").delete().eq("id", id);

  if (error) {
    console.error("Error deleting casual game:", error);
    return NextResponse.json(
      { error: "Failed to cancel challenge" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

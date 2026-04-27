import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// POST /api/players/[id]/follow - Follow a player
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetPlayerId } = await params;
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: follower } = await supabase
    .from("players")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!follower) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  if (follower.id === targetPlayerId) {
    return NextResponse.json(
      { error: "Cannot follow yourself" },
      { status: 400 },
    );
  }

  // Check if already following
  const { data: existing } = await supabase
    .from("player_follows")
    .select("id, is_blocked")
    .eq("follower_id", follower.id)
    .eq("following_id", targetPlayerId)
    .single();

  if (existing) {
    if (existing.is_blocked) {
      // Unblock
      const { data: updated, error } = await supabase
        .from("player_follows")
        .update({ is_blocked: false })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Failed to follow" },
          { status: 500 },
        );
      }

      return NextResponse.json({ follow: updated });
    } else {
      return NextResponse.json({ error: "Already following" }, { status: 400 });
    }
  }

  // Create follow
  const { data: follow, error } = await supabase
    .from("player_follows")
    .insert({
      follower_id: follower.id,
      following_id: targetPlayerId,
      is_blocked: false,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating follow:", error);
    return NextResponse.json(
      { error: "Failed to follow player" },
      { status: 500 },
    );
  }

  return NextResponse.json({ follow }, { status: 201 });
}

// DELETE /api/players/[id]/follow - Unfollow or block a player
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetPlayerId } = await params;
  const supabase = createServerClient();
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "unfollow"; // 'unfollow' or 'block'

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: follower } = await supabase
    .from("players")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!follower) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: follow } = await supabase
    .from("player_follows")
    .select("*")
    .eq("follower_id", follower.id)
    .eq("following_id", targetPlayerId)
    .single();

  if (!follow) {
    return NextResponse.json(
      { error: "Not following this player" },
      { status: 404 },
    );
  }

  if (action === "block") {
    const { data: updated, error } = await supabase
      .from("player_follows")
      .update({ is_blocked: true })
      .eq("id", follow.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to block player" },
        { status: 500 },
      );
    }

    return NextResponse.json({ follow: updated });
  } else if (action === "unfollow") {
    const { error } = await supabase
      .from("player_follows")
      .delete()
      .eq("id", follow.id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to unfollow player" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

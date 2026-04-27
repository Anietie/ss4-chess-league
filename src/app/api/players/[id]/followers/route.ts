import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// GET /api/players/[id]/followers - Get followers of a player
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerClient();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "followers"; // 'followers' or 'following'

  if (type === "followers") {
    const { data: followers, error } = await supabase
      .from("player_follows")
      .select(
        `
        id, follower_id, created_at,
        follower:players!follower_id(id, full_name, ss4_rating, rating_deviation, home_league)
      `,
      )
      .eq("following_id", id)
      .eq("is_blocked", false)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching followers:", error);
      return NextResponse.json(
        { error: "Failed to fetch followers" },
        { status: 500 },
      );
    }

    return NextResponse.json({ followers: followers ?? [] });
  } else if (type === "following") {
    const { data: following, error } = await supabase
      .from("player_follows")
      .select(
        `
        id, following_id, created_at,
        following:players!following_id(id, full_name, ss4_rating, rating_deviation, home_league)
      `,
      )
      .eq("follower_id", id)
      .eq("is_blocked", false)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching following:", error);
      return NextResponse.json(
        { error: "Failed to fetch following" },
        { status: 500 },
      );
    }

    return NextResponse.json({ following: following ?? [] });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

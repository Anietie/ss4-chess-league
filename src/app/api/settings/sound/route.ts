import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// GET /api/settings/sound - Get sound preferences
export async function GET(req: NextRequest) {
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: player, error } = await supabase
    .from("players")
    .select(
      "sound_enabled, sound_volume, sound_move, sound_capture, sound_check, sound_game_end",
    )
    .eq("auth_user_id", user.id)
    .single();

  if (error) {
    console.error("Error fetching sound settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch sound settings" },
      { status: 500 },
    );
  }

  return NextResponse.json({ settings: player });
}

// PATCH /api/settings/sound - Update sound preferences
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: player, error: updateError } = await supabase
    .from("players")
    .update({
      sound_enabled: body.sound_enabled,
      sound_volume: body.sound_volume,
      sound_move: body.sound_move,
      sound_capture: body.sound_capture,
      sound_check: body.sound_check,
      sound_game_end: body.sound_game_end,
    })
    .eq("auth_user_id", user.id)
    .select(
      "sound_enabled, sound_volume, sound_move, sound_capture, sound_check, sound_game_end",
    )
    .single();

  if (updateError) {
    console.error("Error updating sound settings:", updateError);
    return NextResponse.json(
      { error: "Failed to update sound settings" },
      { status: 500 },
    );
  }

  return NextResponse.json({ settings: player });
}

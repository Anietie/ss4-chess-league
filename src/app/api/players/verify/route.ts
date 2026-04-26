import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { player_id, verification_code } = body;

  if (!player_id || !verification_code)
    return NextResponse.json(
      { error: "Player ID and verification code required" },
      { status: 400 },
    );

  const supabase = createServerClient();

  // Get the player and check verification code
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id, verification_code, email")
    .eq("id", player_id)
    .single();

  if (playerError || !player)
    return NextResponse.json({ error: "Player not found" }, { status: 404 });

  if (player.verification_code !== verification_code)
    return NextResponse.json(
      { error: "Invalid verification code" },
      { status: 400 },
    );

  // Mark as verified
  const { error: updateError } = await supabase
    .from("players")
    .update({ is_verified: true, verification_code: null })
    .eq("id", player_id);

  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    message: "Email verified successfully",
  });
}

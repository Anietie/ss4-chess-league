import { checkLeagueImbalance, runSnakeDraft } from "@/lib/snake-draft";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

// POST /api/draft  — admin only
export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-secret") !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { season } = await req.json();
  if (!season)
    return NextResponse.json({ error: "season required" }, { status: 400 });

  const supabase = adminSupabase();

  // Check season exists and is in draft status
  const { data: seasonData } = await supabase
    .from("seasons")
    .select("id, status")
    .eq("id", season)
    .single();
  if (!seasonData)
    return NextResponse.json({ error: "Season not found" }, { status: 404 });

  // Fetch all eligible players (calibration complete, active, unassigned)
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select(
      "id, full_name, ss4_rating, rating_deviation, calibration_complete, is_active, is_suspended",
    )
    .eq("joining_season", season)
    .eq("is_active", true)
    .eq("is_suspended", false)
    .eq("calibration_complete", true);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!players?.length)
    return NextResponse.json(
      { error: "No eligible players for draft" },
      { status: 400 },
    );

  // Run snake draft
  const result = runSnakeDraft(players);
  const imbalance = checkLeagueImbalance(result.stats);

  // Write assignments to DB
  const draftRows = result.assignments.map((a) => ({
    season,
    player_id: a.player_id,
    draft_position: a.draft_position,
    assigned_league: a.assigned_league,
    assigned_tier: a.assigned_tier,
    seed_rating_at_draft: a.seed_rating,
  }));

  const { error: dErr } = await supabase
    .from("season_draft")
    .upsert(draftRows, { onConflict: "season,player_id" });
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  // Update each player's home_league and current_tier
  for (const a of result.assignments) {
    await supabase
      .from("players")
      .update({
        home_league: a.assigned_league,
        current_tier: a.assigned_tier,
      })
      .eq("id", a.player_id);
  }

  // Advance season status to 'active'
  await supabase.from("seasons").update({ status: "active" }).eq("id", season);

  // Notify all players of their assignment
  const notifications = result.assignments.map((a) => ({
    player_id: a.player_id,
    type: "draft_result",
    title: "Draft Complete — League Assigned",
    message: `You have been assigned to ${a.assigned_league.replace("_", " ").toUpperCase()}, ${a.assigned_tier.toUpperCase()} Tier (Draft pick #${a.draft_position}).`,
  }));
  await supabase.from("notifications").insert(notifications);

  return NextResponse.json({
    success: true,
    season,
    total_players: players.length,
    assignments: result.assignments,
    stats: result.stats,
    imbalance_warning: imbalance.imbalanced ? imbalance.details : null,
  });
}

// GET /api/draft?season=1
export async function GET(req: NextRequest) {
  const season = new URL(req.url).searchParams.get("season") ?? "1";
  const supabase = adminSupabase();

  const { data, error } = await supabase
    .from("season_draft")
    .select("*, player:players(id, full_name, ss4_rating)")
    .eq("season", Number(season))
    .order("draft_position");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draft: data });
}

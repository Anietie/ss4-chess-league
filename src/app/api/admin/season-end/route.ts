import { CUP_QUALIFIERS_PER_LEAGUE } from "@/lib/snake-draft";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const adminSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

/**
 * POST /api/admin/season-end
 * Headers: x-admin-secret
 * Body: { season }
 *
 * Runs end-of-season processing:
 * 1. Snapshot each player's current ss4_rating → draft_rating (for next season draft)
 * 2. Mark top-N finishers per league as cup_qualified
 * 3. Advance season status to 'champions_cup'
 * 4. Notify cup qualifiers
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-secret") !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { season } = await req.json();
  if (!season)
    return NextResponse.json({ error: "season required" }, { status: 400 });

  const supabase = adminSupabase();

  // Check all league games are complete
  const { data: pendingGames } = await supabase
    .from("games")
    .select("id")
    .eq("season", season)
    .eq("competition_phase", "league_phase")
    .eq("result", "*");

  if (pendingGames && pendingGames.length > 0) {
    return NextResponse.json(
      {
        error: `${pendingGames.length} league games still pending`,
        pending_game_ids: pendingGames.map((g) => g.id),
      },
      { status: 409 },
    );
  }

  // Fetch final standings grouped by league
  const { data: standings } = await supabase
    .from("standings")
    .select("id, player_id, league, points, wins, sonneborn_berger, position")
    .eq("season", season)
    .order("points", { ascending: false })
    .order("wins", { ascending: false })
    .order("sonneborn_berger", { ascending: false });

  if (!standings?.length) {
    return NextResponse.json(
      { error: "No standings found for this season" },
      { status: 404 },
    );
  }

  // Group by league and compute positions
  const leagueMap = new Map<string, typeof standings>();
  for (const s of standings) {
    if (!leagueMap.has(s.league)) leagueMap.set(s.league, []);
    leagueMap.get(s.league)!.push(s);
  }

  const cupQualifiers: {
    player_id: string;
    league: string;
    position: number;
  }[] = [];
  const standingUpdates: {
    id: string;
    position: number;
    cup_qualified: boolean;
  }[] = [];

  for (const [league, rows] of leagueMap.entries()) {
    // Already sorted by points/wins/SB from DB query
    rows.forEach((row, idx) => {
      const position = idx + 1;
      const cupQualified = position <= CUP_QUALIFIERS_PER_LEAGUE;
      standingUpdates.push({
        id: row.id,
        position,
        cup_qualified: cupQualified,
      });
      if (cupQualified) {
        cupQualifiers.push({ player_id: row.player_id, league, position });
      }
    });
  }

  // Batch update standings
  for (const upd of standingUpdates) {
    await supabase
      .from("standings")
      .update({ position: upd.position, cup_qualified: upd.cup_qualified })
      .eq("id", upd.id);
  }

  // Snapshot draft_rating = current ss4_rating for all participants
  const allPlayerIds = [...new Set(standings.map((s) => s.player_id))];
  const { data: currentRatings } = await supabase
    .from("players")
    .select("id, ss4_rating")
    .in("id", allPlayerIds);

  for (const p of currentRatings ?? []) {
    await supabase
      .from("players")
      .update({ draft_rating: p.ss4_rating })
      .eq("id", p.id);
  }

  // Advance season to champions_cup phase
  await supabase
    .from("seasons")
    .update({
      status: "champions_cup",
      domestic_end_date: new Date().toISOString(),
    })
    .eq("id", season);

  // Generate Champions Cup bracket
  await generateCupBracket(supabase as any, season, cupQualifiers);

  // Notify cup qualifiers
  const notifications = cupQualifiers.map((q) => ({
    player_id: q.player_id,
    type: "cup_qualified",
    title: "🏆 Champions Cup — You Qualified!",
    message: `You finished #${q.position} in ${q.league.replace("_", " ").toUpperCase()} and have qualified for the Season ${season} Champions Cup. Get ready!`,
  }));
  await supabase.from("notifications").insert(notifications);

  // Notify non-qualifiers with their final position
  const qualifierIds = new Set(cupQualifiers.map((q) => q.player_id));
  const nonQualifierNotifs = standings
    .filter((s) => !qualifierIds.has(s.player_id))
    .map((s) => ({
      player_id: s.player_id,
      type: "rating_update",
      title: "Season Complete",
      message: `Season ${season} league phase is over. You finished in position ${standingUpdates.find((u) => u.id === s.id)?.position ?? "?"} in ${s.league.replace("_", " ").toUpperCase()}. The Champions Cup is underway — good luck next season!`,
    }));
  if (nonQualifierNotifs.length) {
    await supabase.from("notifications").insert(nonQualifierNotifs);
  }

  return NextResponse.json({
    success: true,
    season,
    cup_qualifiers: cupQualifiers.length,
    qualifiers: cupQualifiers,
    ratings_snapshotted: currentRatings?.length ?? 0,
  });
}

/**
 * Generate Champions Cup single-elimination bracket.
 * Cup qualifiers are seeded by league position then by rating.
 * Top seeds play lowest seeds in QF: 1v8, 2v7, 3v6, 4v5 etc.
 */
async function generateCupBracket(
  supabase: any,
  season: number,
  qualifiers: { player_id: string; league: string; position: number }[],
) {
  if (qualifiers.length < 2) return;

  // Fetch ratings for seeding
  const { data: ratings } = await supabase
    .from("players")
    .select("id, ss4_rating")
    .in(
      "id",
      qualifiers.map((q) => q.player_id),
    );

  const ratingMap = new Map(
    (ratings ?? []).map((r: any) => [r.id, r.ss4_rating]),
  );

  // Seed: top position first, tiebreak by rating
  const seeded = [...qualifiers].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return (
      ((ratingMap.get(b.player_id) as number) ?? 0) -
      ((ratingMap.get(a.player_id) as number) ?? 0)
    );
  });

  const n = seeded.length;
  // Determine phase: 2 players = final, 3-4 = SF, 5-8 = QF, 9+ = group
  const phase =
    n === 2 ? "cup_final" : n <= 4 ? "cup_semifinal" : "cup_quarterfinal";

  // Create matchups: 1v N, 2vN-1, ...
  const matchups: [string, string][] = [];
  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i++) {
    matchups.push([seeded[i].player_id, seeded[n - 1 - i].player_id]);
  }

  // If odd number, top seed gets a bye (will be handled in QF results)
  const cupGames = matchups.map(([white, black]) => ({
    season,
    league: "champions_cup",
    competition_phase: phase,
    white_player_id: white,
    black_player_id: black,
    result: "*",
    time_control: "900+10",
    is_rated: true,
  }));

  if (cupGames.length > 0) {
    await supabase.from("games").insert(cupGames);
  }
}

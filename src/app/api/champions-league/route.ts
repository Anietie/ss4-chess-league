import { drawCLGroups } from "@/lib/fixture-generator";
import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// GET /api/champions-league?season=1
export async function GET(req: NextRequest) {
  const season = new URL(req.url).searchParams.get("season") ?? "1";
  const supabase = createServerClient();

  const [{ data: clData }, { data: coefficients }, { data: games }] =
    await Promise.all([
      supabase
        .from("champions_league")
        .select(
          "*, player:players(id, full_name, ss4_rating, rating_deviation, home_league, is_provisional)",
        )
        .eq("season", Number(season)),
      supabase
        .from("league_coefficients")
        .select("*")
        .order("cumulative_coefficient", { ascending: false }),
      supabase
        .from("games")
        .select(
          `
        id, round, result, league, competition_phase, played_at, time_control,
        white_player:players!games_white_player_id_fkey(id, full_name, home_league),
        black_player:players!games_black_player_id_fkey(id, full_name, home_league)
      `,
        )
        .eq("season", Number(season))
        .eq("league", "champions_league")
        .order("round"),
    ]);

  // Group CL entries by group
  const groups = (clData ?? []).reduce((acc: Record<string, any[]>, entry) => {
    const g = entry.group_name ?? "Undrawn";
    acc[g] = [...(acc[g] ?? []), entry];
    return acc;
  }, {});

  return NextResponse.json({ groups, coefficients, games, qualifiers: clData });
}

// POST /api/champions-league
// Body actions: draw_groups | generate_knockout | record_cl_result | finalize
export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-secret") !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action, season } = body;
  const supabase = createServerClient();

  // ── draw_groups ───────────────────────────────────────────────
  if (action === "draw_groups") {
    const { data: qualifiers } = await supabase
      .from("champions_league")
      .select(
        `player_id, seeding_pot, from_league, domestic_finish, 
         players(full_name, ss4_rating)`,
      )
      .eq("season", season)
      .eq("stage", "group");

    if (!qualifiers?.length)
      return NextResponse.json(
        { error: "No qualifiers found for season" },
        { status: 400 },
      );

    const draw = drawCLGroups(
      qualifiers.map((q: any) => ({
        player_id: q.player_id,
        full_name: q.players?.full_name || "Unknown",
        from_league: q.from_league,
        domestic_finish: q.domestic_finish,
        seeding_pot: q.seeding_pot ?? 2,
        ss4_rating: q.players?.ss4_rating || 1000,
      })),
    );

    // Assign groups
    for (const player_id of draw.groupA) {
      await supabase
        .from("champions_league")
        .update({ cl_group: "A" })
        .eq("player_id", player_id)
        .eq("season", season);
    }
    for (const player_id of draw.groupB) {
      await supabase
        .from("champions_league")
        .update({ cl_group: "B" })
        .eq("player_id", player_id)
        .eq("season", season);
    }

    // Generate group stage fixtures
    const fixtures: any[] = [];
    const qualifierMap = new Map(
      qualifiers.map((q: any) => [
        q.player_id,
        {
          full_name: q.players?.full_name || "Unknown",
          ss4_rating: q.players?.ss4_rating || 1000,
        },
      ]),
    );
    for (const group of [draw.groupA, draw.groupB]) {
      const players = group.map((player_id: string) => {
        const q = qualifierMap.get(player_id);
        return {
          id: player_id,
          full_name: q?.full_name || "Unknown",
          ss4_rating: q?.ss4_rating || 1000,
        };
      });
      const { generateRoundRobin } = await import("@/lib/fixture-generator");
      const rr = generateRoundRobin(players);
      for (const f of rr) {
        fixtures.push({
          season,
          round: f.round,
          league: "champions_league",
          tier: "n_a",
          competition_phase: "group_stage",
          white_player_id: f.white_player_id,
          black_player_id: f.black_player_id,
          time_control: "600+5",
          result: "*",
        });
      }
    }
    await supabase.from("games").insert(fixtures);

    return NextResponse.json({
      success: true,
      groupA: draw.groupA,
      groupB: draw.groupB,
      fixtures_created: fixtures.length,
    });
  }

  // ── generate_knockout ─────────────────────────────────────────
  if (action === "generate_knockout") {
    // Top 2 from each group advance: A1 vs B2, B1 vs A2
    const { data: clStandings } = await supabase
      .from("champions_league")
      .select("player_id, group_name, group_points, group_wins, group_gp")
      .eq("season", season)
      .eq("stage", "group")
      .order("group_points", { ascending: false });

    const byGroup: Record<string, any[]> = {};
    for (const row of clStandings ?? []) {
      byGroup[row.group_name] = [...(byGroup[row.group_name] ?? []), row];
    }

    const groupA = byGroup["A"] ?? [];
    const groupB = byGroup["B"] ?? [];
    if (groupA.length < 2 || groupB.length < 2)
      return NextResponse.json(
        { error: "Not enough group stage data" },
        { status: 400 },
      );

    const sf1 = { white: groupA[0].player_id, black: groupB[1].player_id }; // A1 vs B2
    const sf2 = { white: groupB[0].player_id, black: groupA[1].player_id }; // B1 vs A2

    await supabase.from("games").insert([
      {
        season,
        league: "champions_league",
        tier: "n_a",
        competition_phase: "knockout_semifinal",
        white_player_id: sf1.white,
        black_player_id: sf1.black,
        time_control: "600+5",
        result: "*",
      },
      {
        season,
        league: "champions_league",
        tier: "n_a",
        competition_phase: "knockout_semifinal",
        white_player_id: sf2.white,
        black_player_id: sf2.black,
        time_control: "600+5",
        result: "*",
      },
    ]);

    await supabase
      .from("champions_league")
      .update({ stage: "knockout" })
      .in("player_id", [sf1.white, sf1.black, sf2.white, sf2.black])
      .eq("season", season);

    return NextResponse.json({ success: true, sf1, sf2 });
  }

  // ── finalize ──────────────────────────────────────────────────
  if (action === "finalize") {
    const { cl_winner_id, cl_runner_up_id } = body;
    if (!cl_winner_id)
      return NextResponse.json(
        { error: "cl_winner_id required" },
        { status: 400 },
      );

    await supabase
      .from("seasons")
      .update({ cl_winner_id, cl_runner_up_id, status: "complete" })
      .eq("id", season);

    // Award CL Winner badge
    await supabase.from("player_badges").upsert(
      {
        player_id: cl_winner_id,
        badge_type: "cl_winner",
        season,
        description: "SS4 Champions League Winner",
      },
      { onConflict: "player_id,badge_type,season", ignoreDuplicates: true },
    );

    if (cl_runner_up_id) {
      await supabase.from("player_badges").upsert(
        {
          player_id: cl_runner_up_id,
          badge_type: "cl_runner_up",
          season,
          description: "SS4 Champions League Runner-Up",
        },
        { onConflict: "player_id,badge_type,season", ignoreDuplicates: true },
      );
    }

    // Compute league coefficients from CL group + knockout performance
    const { data: clGames } = await supabase
      .from("games")
      .select("result, white_player_id, black_player_id, competition_phase")
      .eq("season", season)
      .eq("league", "champions_league")
      .neq("result", "*");

    const leaguePoints: Record<string, number> = {};
    const { data: clPlayers } = await supabase
      .from("champions_league")
      .select("player_id, home_league")
      .eq("season", season);

    const playerLeague: Record<string, string> = {};
    for (const p of clPlayers ?? []) playerLeague[p.player_id] = p.home_league;

    for (const g of clGames ?? []) {
      const isKnockout =
        g.competition_phase.includes("knockout") ||
        g.competition_phase.includes("final");
      const multiplier = isKnockout ? 2 : 1;
      if (g.result === "1-0") {
        const l = playerLeague[g.white_player_id];
        if (l) leaguePoints[l] = (leaguePoints[l] ?? 0) + 3 * multiplier;
      } else if (g.result === "0-1") {
        const l = playerLeague[g.black_player_id];
        if (l) leaguePoints[l] = (leaguePoints[l] ?? 0) + 3 * multiplier;
      } else {
        const wl = playerLeague[g.white_player_id];
        const bl = playerLeague[g.black_player_id];
        if (wl) leaguePoints[wl] = (leaguePoints[wl] ?? 0) + multiplier;
        if (bl) leaguePoints[bl] = (leaguePoints[bl] ?? 0) + multiplier;
      }
    }

    for (const [league, pts] of Object.entries(leaguePoints)) {
      const { data: existing } = await supabase
        .from("league_coefficients")
        .select("cumulative_coefficient")
        .eq("league", league)
        .order("season", { ascending: false })
        .limit(1)
        .single();
      const cumulative = (existing?.cumulative_coefficient ?? 0) + pts;
      await supabase.from("league_coefficients").upsert(
        {
          league,
          season,
          coefficient_score: pts,
          cumulative_coefficient: cumulative,
          cl_spots_next_season: 4, // will be recalculated once all leagues scored
        },
        { onConflict: "league,season" },
      );
    }

    // Award Top Earner badge to league with most CL points
    const topLeague = Object.entries(leaguePoints).sort(
      (a, b) => b[1] - a[1],
    )[0];
    if (topLeague) {
      await supabase.from("notifications").insert({
        player_id: cl_winner_id,
        type: "season_complete",
        title: "Season Complete",
        message: `Season ${season} is complete. ${topLeague[0].replace("_", " ").toUpperCase()} earned the most CL points (${topLeague[1]}).`,
      });
    }

    return NextResponse.json({ success: true, league_points: leaguePoints });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

import { createServerClient } from "@/lib/supabase";
import Link from "next/link";

const supabase = createServerClient();

async function getCLData(season = 1) {
  const [{ data: clEntries }, { data: coefficients }, { data: clGames }] =
    await Promise.all([
      supabase
        .from("champions_league")
        .select(
          "*, player:players(id, full_name, ss4_rating, rating_deviation, home_league)",
        )
        .eq("season", season),
      supabase
        .from("league_coefficients")
        .select("*")
        .order("cumulative_coefficient", { ascending: false }),
      supabase
        .from("games")
        .select(
          `
      id, round, result, competition_phase,
      white_player:players!games_white_player_id_fkey(id, full_name),
      black_player:players!games_black_player_id_fkey(id, full_name)
    `,
        )
        .eq("season", season)
        .eq("league", "champions_league")
        .order("round"),
    ]);

  const groups = (clEntries ?? []).reduce((acc: Record<string, any[]>, e) => {
    const g = e.group_name ?? "TBD";
    acc[g] = [...(acc[g] ?? []), e];
    return acc;
  }, {});

  return { groups, coefficients, clGames };
}

export default async function ChampionsLeaguePage() {
  const { groups, coefficients, clGames } = await getCLData();
  const groupNames = Object.keys(groups).sort();
  const hasGroups = groupNames.length > 0 && !groupNames.includes("TBD");

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      <div className="flex items-center gap-3">
        <span className="league-pill-cl">Champions League</span>
        <h1 className="font-display text-3xl font-bold text-chalk">
          SS4 Champions League
        </h1>
      </div>

      {!hasGroups && (
        <div className="card p-10 text-center border-dashed border-ink-600">
          <div className="text-4xl mb-4">🏆</div>
          <div className="font-display text-xl text-chalk mb-2">
            Group Draw Not Yet Held
          </div>
          <p className="text-ink-400 text-sm">
            The Champions League begins after the league season concludes.
            Qualification spots are awarded based on league standings and
            coefficients.
          </p>
        </div>
      )}

      {hasGroups && (
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-4">
            Group Stage
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {groupNames.map((gName) => (
              <div key={gName} className="card overflow-hidden">
                <div className="px-4 py-3 bg-pitch-800 border-b border-ink-700 flex items-center gap-2">
                  <span className="text-star font-bold">Group {gName}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-ink-400 border-b border-ink-700">
                      <th className="px-4 py-2 text-left">Player</th>
                      <th className="px-3 py-2 text-center">GP</th>
                      <th className="px-3 py-2 text-center">W</th>
                      <th className="px-3 py-2 text-center">D</th>
                      <th className="px-3 py-2 text-center">L</th>
                      <th className="px-3 py-2 text-center font-bold text-star">
                        Pts
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups[gName]
                      .sort(
                        (a, b) => (b.group_points ?? 0) - (a.group_points ?? 0),
                      )
                      .map((e, i) => (
                        <tr
                          key={e.player_id}
                          className={`border-b border-ink-700/50 ${i < 2 ? "bg-gold/5" : ""}`}
                        >
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/profile/${e.player_id}`}
                              className="font-medium text-chalk hover:text-gold transition-colors"
                            >
                              {(e.player as any)?.full_name}
                            </Link>
                            <div className="text-xs text-ink-400">
                              {(e.player as any)?.home_league?.replace(
                                "_",
                                " ",
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center text-ink-400">
                            {e.group_gp ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-center text-ink-300">
                            {e.group_wins ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-center text-ink-300">
                            {e.group_draws ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-center text-ink-300">
                            {e.group_losses ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-star">
                            {e.group_points ?? 0}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CL Games */}
      {(clGames?.length ?? 0) > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-4">
            Results
          </h2>
          <div className="card divide-y divide-ink-700">
            {clGames!.map((g) => (
              <Link
                key={g.id}
                href={`/game/${g.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-ink-700 transition-colors"
              >
                <span className="text-sm text-chalk">
                  {(g.white_player as any)?.full_name} vs{" "}
                  {(g.black_player as any)?.full_name}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-400 capitalize">
                    {g.competition_phase?.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm font-mono font-bold text-gold">
                    {g.result === "*" ? "–" : g.result}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Coefficients */}
      <section>
        <h2 className="font-display text-lg font-bold text-chalk mb-4">
          League Coefficients
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-400 border-b border-ink-700 bg-ink-900">
                <th className="px-4 py-3 text-left">League</th>
                <th className="px-4 py-3 text-center">This Season</th>
                <th className="px-4 py-3 text-center">Cumulative</th>
                <th className="px-4 py-3 text-center">CL Spots</th>
              </tr>
            </thead>
            <tbody>
              {coefficients?.map((c, i) => (
                <tr key={c.league} className="border-b border-ink-700/50">
                  <td className="px-4 py-3 font-medium text-chalk capitalize">
                    {c.league?.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-center text-ink-300">
                    {c.coefficient_score ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-gold">
                    {c.cumulative_coefficient ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center text-star">
                    ⭐ {c.cl_spots_next_season ?? 4}
                  </td>
                </tr>
              ))}
              {!coefficients?.length && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-ink-400"
                  >
                    No coefficient data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

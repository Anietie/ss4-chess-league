import { createServerClient } from "@/lib/supabase";
import { formatRating } from "@/lib/utils";
import Link from "next/link";

const supabase = createServerClient();

function leagueDisplayName(key: string): string {
  const m = key.match(/^league_(\d+)$/);
  return m
    ? `League ${m[1]}`
    : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function getHomeData() {
  const [
    { data: recentGames },
    { data: upcomingGames },
    { data: topPlayers },
    { data: activeLeagues },
    { data: activeSeason },
  ] = await Promise.all([
    supabase
      .from("games")
      .select(
        `
        id, result, league, tier, played_at, time_control,
        white_player:players!games_white_player_id_fkey(id, full_name, ss4_rating, rating_deviation),
        black_player:players!games_black_player_id_fkey(id, full_name, ss4_rating, rating_deviation)
      `,
      )
      .neq("result", "*")
      .neq("league", "calibration")
      .order("played_at", { ascending: false })
      .limit(10),

    supabase
      .from("games")
      .select(
        `
        id, round, scheduled_date, league, tier, time_control,
        white_player:players!games_white_player_id_fkey(id, full_name, ss4_rating, rating_deviation),
        black_player:players!games_black_player_id_fkey(id, full_name, ss4_rating, rating_deviation)
      `,
      )
      .eq("result", "*")
      .neq("league", "calibration")
      .order("scheduled_date")
      .limit(8),

    supabase
      .from("players")
      .select(
        "id,full_name,ss4_rating,rating_deviation,home_league,current_tier",
      )
      .eq("is_active", true)
      .neq("home_league", "unassigned")
      .neq("home_league", "calibration")
      .order("ss4_rating", { ascending: false })
      .limit(15),

    // Get all distinct active leagues
    supabase
      .from("players")
      .select("home_league")
      .eq("is_active", true)
      .neq("home_league", "unassigned")
      .neq("home_league", "calibration"),

    supabase
      .from("seasons")
      .select("id,name,status")
      .in("status", ["active", "playoffs", "registration"])
      .order("id", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const leagues = [
    ...new Set((activeLeagues ?? []).map((p: any) => p.home_league)),
  ]
    .filter((l: string) => /^league_\d+$/.test(l))
    .sort(
      (a: string, b: string) =>
        parseInt(a.replace("league_", "")) - parseInt(b.replace("league_", "")),
    );

  return { recentGames, upcomingGames, topPlayers, leagues, activeSeason };
}

function ResultBadge({ result }: { result: string }) {
  if (result === "1-0")
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded bg-gold/20 text-gold">
        1 – 0
      </span>
    );
  if (result === "0-1")
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded bg-gold/20 text-gold">
        0 – 1
      </span>
    );
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded bg-ink-600 text-chalk-700">
      ½ – ½
    </span>
  );
}

export default async function HomePage() {
  const { recentGames, upcomingGames, topPlayers, leagues, activeSeason } =
    await getHomeData();

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-12">
      {/* Hero */}
      <div className="text-center space-y-4 py-10 bg-board-pattern rounded-2xl border border-ink-700">
        <div className="text-5xl">♟</div>
        <h1 className="font-display text-4xl md:text-5xl font-bold text-chalk">
          SS4 Chess League
        </h1>
        <p className="text-ink-300 text-lg max-w-xl mx-auto">
          Parallel League Competition · Glicko-2 Rating System · Champions
          League
        </p>
        {activeSeason && (
          <div className="text-sm text-ink-400">
            {activeSeason.name ?? `Season ${activeSeason.id}`} ·{" "}
            <span className="capitalize">{activeSeason.status}</span>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link href="/register" className="btn-gold btn-lg">
            Register
          </Link>
          <Link href="/calibrate" className="btn-ghost btn-lg">
            Rating Calibration
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
        {/* Left */}
        <div className="space-y-8">
          {/* Recent Results */}
          <section>
            <h2 className="font-display text-xl font-bold text-chalk mb-4 flex items-center gap-2">
              <span className="text-gold">⚔</span> Recent Results
            </h2>
            <div className="card divide-y divide-ink-700">
              {recentGames?.length ? (
                recentGames.map((g) => (
                  <Link
                    key={g.id}
                    href={`/game/${g.id}/review`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-ink-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-chalk font-medium truncate">
                        {(g.white_player as any)?.full_name}
                      </span>
                      <span className="text-ink-500 text-xs mx-2">vs</span>
                      <span className="text-sm text-chalk font-medium truncate">
                        {(g.black_player as any)?.full_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <ResultBadge result={g.result} />
                      <span className="text-xs text-ink-400 capitalize hidden sm:block">
                        {leagueDisplayName(g.league)}
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="px-4 py-10 text-center text-ink-400 text-sm">
                  No results yet — the season is loading up.
                </div>
              )}
            </div>
          </section>

          {/* Upcoming Fixtures */}
          <section>
            <h2 className="font-display text-xl font-bold text-chalk mb-4 flex items-center gap-2">
              <span className="text-gold">📅</span> Upcoming Fixtures
            </h2>
            <div className="card divide-y divide-ink-700">
              {upcomingGames?.length ? (
                upcomingGames.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-chalk">
                        {(g.white_player as any)?.full_name}
                      </span>
                      <span className="text-ink-500 text-xs mx-2">vs</span>
                      <span className="text-sm text-chalk">
                        {(g.black_player as any)?.full_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-xs text-ink-400">
                      <span>{g.scheduled_date}</span>
                      <span className="hidden sm:block">{g.time_control}</span>
                      <span className="hidden sm:block capitalize">
                        {leagueDisplayName(g.league)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-10 text-center text-ink-400 text-sm">
                  Fixtures not yet scheduled.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right — Top Ratings */}
        <div>
          <h2 className="font-display text-xl font-bold text-chalk mb-4 flex items-center gap-2">
            <span className="text-gold">🏆</span> Top Ratings
          </h2>
          <div className="card divide-y divide-ink-700">
            {topPlayers?.length ? (
              topPlayers.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/profile/${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-ink-700 transition-colors"
                >
                  <span className="text-sm text-ink-500 w-5 text-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-chalk font-medium truncate">
                      {p.full_name}
                    </div>
                    <div className="text-xs text-ink-400 capitalize">
                      {leagueDisplayName(p.home_league)} · {p.current_tier}
                    </div>
                  </div>
                  <span className="text-sm font-mono font-bold text-gold tabular-nums flex-shrink-0">
                    {formatRating(p.ss4_rating, p.rating_deviation)}
                  </span>
                </Link>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-ink-400 text-sm">
                No rated players yet.
              </div>
            )}
          </div>

          {/* Dynamic league links — only shows leagues that exist */}
          {leagues.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {leagues.map((l) => (
                <Link
                  key={l}
                  href={`/league/${l}`}
                  className="btn-ghost flex-1 justify-center text-xs min-w-[80px]"
                >
                  {leagueDisplayName(l)}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

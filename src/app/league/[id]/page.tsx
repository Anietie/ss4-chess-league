import { StandingsTable } from "@/components/standings/StandingsTable";
import { createServerClient } from "@/lib/supabase";
import { leagueName, leaguePillClass } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

const NAMED = [
  "champions_league",
  "scel",
  "continental_shield",
  "blitz",
  "newcomer_shield",
];

function isValidKey(key: string) {
  return /^league_\d+$/.test(key) || NAMED.includes(key);
}

async function getActiveSeason() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("seasons")
    .select("id")
    .in("status", ["active", "playoffs", "registration", "draft", "champions_league"])
    .order("id", { ascending: false })
    .limit(1)
    .single();
  return data?.id ?? 1;
}

async function getData(league: string, season: number) {
  const supabase = createServerClient();
  const [
    { data: standings },
    { data: upcoming },
    { data: done },
    { data: seasons },
    { data: players },
  ] = await Promise.all([
    supabase
      .from("standings")
      .select("*, player:players(id,full_name,ss4_rating,rating_deviation)")
      .eq("season", season)
      .eq("league", league)
      .order("points", { ascending: false }),
    supabase
      .from("games")
      .select(
        "id,round,scheduled_date,deadline_date,time_control,competition_phase,white_player:players!games_white_player_id_fkey(id,full_name,ss4_rating,rating_deviation),black_player:players!games_black_player_id_fkey(id,full_name,ss4_rating,rating_deviation)"
      )
      .eq("season", season)
      .eq("league", league)
      .eq("result", "*")
      .order("scheduled_date")
      .limit(20),
    supabase
      .from("games")
      .select(
        "id,round,result,competition_phase,played_at,white_player:players!games_white_player_id_fkey(id,full_name),black_player:players!games_black_player_id_fkey(id,full_name)"
      )
      .eq("season", season)
      .eq("league", league)
      .neq("result", "*")
      .order("played_at", { ascending: false })
      .limit(20),
    supabase
      .from("seasons")
      .select("id,name,status")
      .order("id", { ascending: false }),
    supabase
      .from("players")
      .select("id,full_name,ss4_rating,rating_deviation")
      .eq("home_league", league)
      .eq("is_active", true)
      .order("ss4_rating", { ascending: false }),
  ]);
  return { standings, upcoming, done, seasons, players };
}

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { season?: string };
}) {
  if (!isValidKey(params.id)) notFound();

  const activeSeason = await getActiveSeason();
  const season = searchParams.season
    ? Number(searchParams.season)
    : activeSeason;
  const { standings, upcoming, done, seasons, players } = await getData(
    params.id,
    season,
  );
  const name = leagueName(params.id);
  const hasStandings = (standings?.length ?? 0) > 0;
  const hasPlayers = (players?.length ?? 0) > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={leaguePillClass(params.id)}>{name}</span>
          <h1 className="font-display text-3xl font-bold text-chalk">{name}</h1>
        </div>
        {(seasons?.length ?? 0) > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="section-label">Season:</span>
            {seasons!.map((s) => (
              <Link
                key={s.id}
                href={`/league/${params.id}?season=${s.id}`}
                className={`btn btn-sm ${season === s.id ? "btn-gold" : "btn-ghost"}`}
              >
                {s.name ?? `Season ${s.id}`}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* No players at all */}
      {!hasPlayers && !hasStandings && (
        <div className="card p-12 text-center border-dashed border-ink-600">
          <div className="text-4xl mb-4">🏗️</div>
          <div className="font-display text-xl font-bold text-chalk mb-2">
            {name} — Awaiting Draft
          </div>
          <p className="text-ink-400 text-sm">
            Players will be assigned here after the draft.
          </p>
          <Link href="/register" className="btn-gold mt-6 inline-flex">
            Register
          </Link>
        </div>
      )}

      {/* Players assigned but no standings yet */}
      {hasPlayers && !hasStandings && (
        <div className="card p-6 border-dashed border-ink-600">
          <div className="text-center mb-6">
            <div className="text-3xl mb-2">📋</div>
            <div className="font-display text-lg font-bold text-chalk">
              Draft Complete — Season Starting Soon
            </div>
            {players && players.length > 0 ? (
              <>
                <p className="text-ink-400 text-sm mt-1">
                  {players.length} players assigned. Fixtures will appear once the season begins.
                </p>
                <div className="card divide-y divide-ink-700/50 max-h-96 overflow-y-auto mt-4">
                  {players.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-xs text-ink-500 w-6">{i + 1}</span>
                      <Link
                        href={`/profile/${p.id}`}
                        className="flex-1 text-sm text-chalk hover:text-gold transition-colors"
                      >
                        {p.full_name}
                      </Link>
                      <span className="font-mono text-sm text-gold">
                        {Math.round(p.ss4_rating)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-ink-400 text-sm mt-1">No players assigned yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Live season */}
      {hasStandings && (
        <>
          {/* Standings */}
          <section>
            <h2 className="font-display text-lg font-bold text-chalk mb-3 flex items-center gap-2">
              Standings
            </h2>
            {standings?.length ? (
              <StandingsTable rows={standings} />
            ) : (
              <div className="card p-8 text-center text-ink-400 text-sm">
                No standings data yet.
              </div>
            )}
          </section>

          {/* Fixtures + Results */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Upcoming Fixtures */}
            <section>
              <h2 className="font-display text-lg font-bold text-chalk mb-3">
                Upcoming Fixtures
              </h2>
              <div className="card divide-y divide-ink-700">
                {upcoming?.length ? (
                  upcoming.map((g) => (
                    <div key={g.id} className="px-4 py-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-chalk">
                          {(g.white_player as any)?.full_name}{" "}
                          <span className="text-ink-500">vs</span>{" "}
                          {(g.black_player as any)?.full_name}
                        </span>
                        <span className="text-xs text-ink-500 ml-2">
                          {g.round ? `R${g.round}` : g.competition_phase}
                        </span>
                      </div>
                      <div className="text-xs text-ink-500 mt-0.5">
                        {g.scheduled_date} · {g.time_control}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-ink-400 text-sm">
                    No pending fixtures.
                  </div>
                )}
              </div>
            </section>

            {/* Recent Results */}
            <section>
              <h2 className="font-display text-lg font-bold text-chalk mb-3">
                Recent Results
              </h2>
              <div className="card divide-y divide-ink-700">
                {done?.length ? (
                  done.map((g) => (
                    <Link
                      key={g.id}
                      href={`/game/${g.id}/review`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-ink-700 transition-colors"
                    >
                      <span className="text-sm text-chalk truncate">
                        {(g.white_player as any)?.full_name} vs{" "}
                        {(g.black_player as any)?.full_name}
                      </span>
                      <span className="text-sm font-mono font-bold text-gold ml-3">
                        {g.result}
                      </span>
                    </Link>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-ink-400 text-sm">
                    No results yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
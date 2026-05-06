import { BadgeWall } from "@/components/profile/BadgeWall";
import { RatingChart } from "@/components/profile/RatingChart";
import { createServerClient } from "@/lib/supabase";
import { formatRating } from "@/lib/utils";
import { GraduationCap, BookOpen, Building2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

const supabase = createServerClient();

async function getProfileData(id: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/players/${id}`,
    { cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return null;
  return res.json();
}

async function getOpeningRepertoire(id: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/opening-repertoire?player_id=${id}`,
    { cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return null;
  return res.json();
}

async function getSameSchoolPlayers(school: string, currentPlayerId: string) {
  if (!school) return [];
  const { data } = await supabase
    .from("players")
    .select("id, full_name, ss4_rating, rating_deviation, department")
    .eq("school", school)
    .eq("is_active", true)
    .neq("id", currentPlayerId)
    .order("ss4_rating", { ascending: false })
    .limit(10);
  return data ?? [];
}

async function getSameDepartmentPlayers(department: string, currentPlayerId: string) {
  if (!department) return [];
  const { data } = await supabase
    .from("players")
    .select("id, full_name, ss4_rating, rating_deviation")
    .eq("department", department)
    .eq("is_active", true)
    .neq("id", currentPlayerId)
    .order("ss4_rating", { ascending: false })
    .limit(10);
  return data ?? [];
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getProfileData(id);
  if (!data?.player) notFound();

  const { player, standings, recentGames, ratingHistory } = data;

  const [{ data: badges }, repertoireData, schoolMates, deptMates] = await Promise.all([
    supabase.from("player_badges").select("*").eq("player_id", id),
    getOpeningRepertoire(id),
    getSameSchoolPlayers(player.school, id),
    getSameDepartmentPlayers(player.department, id),
  ]);

  const repertoire = repertoireData?.repertoire;

  const wins = recentGames?.filter((g: any) =>
    (g.result === '1-0' && g.white_player?.id === id) ||
    (g.result === '0-1' && g.black_player?.id === id),
  ).length ?? 0;
  const draws  = recentGames?.filter((g: any) => g.result === '0.5-0.5').length ?? 0;
  const losses = (recentGames?.length ?? 0) - wins - draws;
  const totalGames = recentGames?.length ?? 0;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span
                className={
                  player.home_league === "league_1"
                    ? "league-pill-l1"
                    : player.home_league === "league_2"
                    ? "league-pill-l2"
                    : "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-ink-700 text-ink-300 border border-ink-600"
                }
              >
                {player.home_league?.replace("_", " ").toUpperCase() || "Unassigned"}
              </span>
              {player.joining_season === 1 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gold/20 text-gold border border-gold/30">⭐ Pioneer</span>
              )}
            </div>
            <h1 className="font-display text-3xl font-bold text-chalk">
              {player.full_name}
            </h1>
            
            {/* School, Category & Department */}
            {(player.school || player.institution_category || player.department) && (
              <div className="flex flex-wrap items-center gap-3 mt-3">
                {player.institution_category && (
                  <span className={`text-xs px-2 py-1 rounded-full border ${
                    player.institution_category === 'university' 
                      ? 'bg-blue-900/30 text-blue-300 border-blue-700/50' 
                      : player.institution_category === 'polytechnic'
                      ? 'bg-green-900/30 text-green-300 border-green-700/50'
                      : 'bg-purple-900/30 text-purple-300 border-purple-700/50'
                  }`}>
                    <Building2 size={10} className="inline mr-1" />
                    {player.institution_category === 'university' ? 'University' : 
                     player.institution_category === 'polytechnic' ? 'Polytechnic' : 'College of Education'}
                  </span>
                )}
                {player.school && (
                  <div className="flex items-center gap-1.5 text-sm text-ink-300 bg-ink-800/50 px-3 py-1.5 rounded-lg border border-ink-700">
                    <GraduationCap size={14} className="text-gold" />
                    <span>{player.school}</span>
                  </div>
                )}
                {player.department && (
                  <div className="flex items-center gap-1.5 text-sm text-ink-300 bg-ink-800/50 px-3 py-1.5 rounded-lg border border-ink-700">
                    <BookOpen size={14} className="text-gold" />
                    <span>{player.department}</span>
                  </div>
                )}
              </div>
            )}
            
            {/* External Profile Links */}
            <div className="flex items-center gap-3 mt-2">
              {player.chess_com_username && (
                <a
                  href={`https://chess.com/member/${player.chess_com_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink-400 hover:text-gold transition-colors"
                >
                  ♟ @{player.chess_com_username}
                </a>
              )}
              {player.lichess_username && (
                <a
                  href={`https://lichess.org/@/${player.lichess_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink-400 hover:text-gold transition-colors"
                >
                  ♞ @{player.lichess_username}
                </a>
              )}
            </div>
          </div>
          
          {/* Rating Display */}
          <div className="text-right">
            <div className="font-mono text-4xl font-bold text-gold">
              {formatRating(player.ss4_rating, player.rating_deviation)}
            </div>
            <div className="text-xs text-ink-400 mt-1">
              RD: ±{Math.round(player.rating_deviation)}
              {player.rating_deviation > 100 && (
                <span className="text-amber-400 ml-1">(Provisional)</span>
              )}
            </div>
            <div className="text-xs text-ink-400">
              {player.games_played} rated games played
            </div>
          </div>
        </div>

        {/* W/D/L + Win Rate */}
        <div className="mt-4 grid grid-cols-4 gap-3 pt-4 border-t border-ink-700">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">{wins}</div>
            <div className="text-xs text-ink-400">Wins</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-chalk-700">{draws}</div>
            <div className="text-xs text-ink-400">Draws</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">{losses}</div>
            <div className="text-xs text-ink-400">Losses</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gold">{winRate}%</div>
            <div className="text-xs text-ink-400">Win Rate</div>
          </div>
        </div>
      </div>

      {/* Rating Chart */}
      {ratingHistory?.length > 1 && (
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-3">
            Rating History
          </h2>
          <div className="card p-4">
            <RatingChart data={ratingHistory} />
          </div>
        </section>
      )}

      {/* Badges */}
      {badges && badges.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-3">
            Badges
          </h2>
          <BadgeWall badges={badges} />
        </section>
      )}

      {/* Campus Network */}
      {(schoolMates.length > 0 || deptMates.length > 0) && (
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-3 flex items-center gap-2">
            <GraduationCap size={18} className="text-gold" />
            Campus Network
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schoolMates.length > 0 && (
              <div className="card p-4">
                <h3 className="text-sm font-bold text-ink-300 mb-3 flex items-center gap-2">
                  <GraduationCap size={13} className="text-gold" />
                  Same School — {player.school}
                </h3>
                <div className="space-y-2">
                  {schoolMates.map((mate: any) => (
                    <Link
                      key={mate.id}
                      href={`/profile/${mate.id}`}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-ink-700/50 transition-colors"
                    >
                      <div>
                        <div className="text-sm text-chalk">{mate.full_name}</div>
                        {mate.department && (
                          <div className="text-xs text-ink-500">{mate.department}</div>
                        )}
                      </div>
                      <span className="text-xs font-mono text-gold">
                        {formatRating(mate.ss4_rating, mate.rating_deviation)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {deptMates.length > 0 && (
              <div className="card p-4">
                <h3 className="text-sm font-bold text-ink-300 mb-3 flex items-center gap-2">
                  <BookOpen size={13} className="text-gold" />
                  Same Department — {player.department}
                </h3>
                <div className="space-y-2">
                  {deptMates.map((mate: any) => (
                    <Link
                      key={mate.id}
                      href={`/profile/${mate.id}`}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-ink-700/50 transition-colors"
                    >
                      <div>
                        <div className="text-sm text-chalk">{mate.full_name}</div>
                      </div>
                      <span className="text-xs font-mono text-gold">
                        {formatRating(mate.ss4_rating, mate.rating_deviation)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Season History */}
      {standings?.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-3">
            Season History
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-400 border-b border-ink-700 bg-ink-900">
                  <th className="px-4 py-3 text-left">Season</th>
                  <th className="px-4 py-3 text-left">League</th>
                  <th className="px-4 py-3 text-center">GP</th>
                  <th className="px-4 py-3 text-center">W</th>
                  <th className="px-4 py-3 text-center">D</th>
                  <th className="px-4 py-3 text-center">L</th>
                  <th className="px-4 py-3 text-center">Pts</th>
                  <th className="px-4 py-3 text-right">Position</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s: any) => (
                  <tr
                    key={`${s.season}-${s.league}`}
                    className="border-b border-ink-700/50"
                  >
                    <td className="px-4 py-3 text-chalk">
                      {s.season?.name ?? `Season ${s.season}`}
                    </td>
                    <td className="px-4 py-3 text-ink-300 capitalize">
                      {s.league?.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-center text-ink-400">
                      {s.games_played}
                    </td>
                    <td className="px-4 py-3 text-center text-green-400">
                      {s.wins}
                    </td>
                    <td className="px-4 py-3 text-center text-ink-300">
                      {s.draws}
                    </td>
                    <td className="px-4 py-3 text-center text-red-400">
                      {s.losses}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-gold">
                      {s.points}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-400">
                      {s.position ? `#${s.position}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Opening Repertoire */}
      {(repertoire?.white?.length > 0 || repertoire?.black?.length > 0) && (
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-3">
            Opening Repertoire (Top 10)
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h3 className="text-sm font-bold text-ink-300 mb-3 border-b border-ink-700 pb-2">
                As White ♔
              </h3>
              {repertoire.white?.length > 0 ? (
                <div className="space-y-3">
                  {repertoire.white.map((op: any) => (
                    <div
                      key={op.moves}
                      className="flex justify-between items-center text-sm"
                    >
                      <div
                        className="font-mono text-xs text-chalk truncate mr-2"
                        title={op.moves}
                      >
                        {op.moves}
                      </div>
                      <div className="flex gap-2 text-xs tabular-nums">
                        <span className="text-ink-400 w-6 text-right">{op.count}G</span>
                        <span className="text-green-400 w-6 text-right">{op.wins}W</span>
                        <span className="text-chalk-700 w-6 text-right">{op.draws}D</span>
                        <span className="text-red-400 w-6 text-right">{op.losses}L</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-ink-500 text-center py-4">No data yet</div>
              )}
            </div>

            <div className="card p-4">
              <h3 className="text-sm font-bold text-ink-300 mb-3 border-b border-ink-700 pb-2">
                As Black ♚
              </h3>
              {repertoire.black?.length > 0 ? (
                <div className="space-y-3">
                  {repertoire.black.map((op: any) => (
                    <div
                      key={op.moves}
                      className="flex justify-between items-center text-sm"
                    >
                      <div
                        className="font-mono text-xs text-chalk truncate mr-2"
                        title={op.moves}
                      >
                        {op.moves}
                      </div>
                      <div className="flex gap-2 text-xs tabular-nums">
                        <span className="text-ink-400 w-6 text-right">{op.count}G</span>
                        <span className="text-green-400 w-6 text-right">{op.wins}W</span>
                        <span className="text-chalk-700 w-6 text-right">{op.draws}D</span>
                        <span className="text-red-400 w-6 text-right">{op.losses}L</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-ink-500 text-center py-4">No data yet</div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Recent Games */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-bold text-chalk">
            Recent Games
          </h2>
          <Link href={`/games/history?player=${id}`} className="text-xs text-ink-400 hover:text-gold transition-colors">
            View all →
          </Link>
        </div>
        <div className="card divide-y divide-ink-700">
          {recentGames?.slice(0, 15).map((g: any) => {
            const isWhite = g.white_player?.id === id;
            const opp = isWhite ? g.black_player : g.white_player;
            const myResult =
              g.result === '0.5-0.5'
                ? 'draw'
                : (isWhite ? g.result === '1-0' : g.result === '0-1')
                  ? 'win'
                  : 'loss';
            const colourMap = { win: 'text-green-400', draw: 'text-chalk-700', loss: 'text-red-400' };
            const ratingBefore = isWhite ? g.white_rating_before : g.black_rating_before;
            const ratingAfter  = isWhite ? g.white_rating_after  : g.black_rating_after;
            const change = ratingAfter && ratingBefore ? Math.round(ratingAfter - ratingBefore) : null;
            const isCasual = g.league === 'casual';
            const leagueLabel = isCasual
              ? (g.is_rated ? 'Casual Rated' : 'Casual Unrated')
              : g.league?.replace(/_/g, ' ');
            return (
              <div key={g.id} className="flex items-center justify-between px-4 py-3 hover:bg-ink-700/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-chalk">
                    vs {opp?.full_name ?? 'Unknown'}
                    <span className="text-ink-500 text-xs ml-1.5">({isWhite ? 'White' : 'Black'})</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-ink-400 capitalize">{leagueLabel}</span>
                    {g.played_at && <span className="text-xs text-ink-600">· {g.played_at.slice(0, 10)}</span>}
                    {g.time_control && <span className="text-xs text-ink-600">· {g.time_control}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <span className={`text-sm font-bold capitalize ${colourMap[myResult as keyof typeof colourMap]}`}>
                      {myResult}
                    </span>
                    {change !== null && (
                      <div className={`text-xs ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {change >= 0 ? '+' : ''}{change}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/game/${g.id}/review`}
                    className="text-xs text-ink-500 hover:text-gold transition-colors px-2 py-1 rounded border border-ink-700 hover:border-gold/40"
                    title="Review game"
                  >
                    Review
                  </Link>
                </div>
              </div>
            );
          })}
          {!recentGames?.length && (
            <div className="px-4 py-8 text-center text-ink-400 text-sm">
              No games played yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
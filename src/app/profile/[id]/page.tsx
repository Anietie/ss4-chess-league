import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { RatingChart } from '@/components/profile/RatingChart';
import { BadgeWall } from '@/components/profile/BadgeWall';
import { formatRating } from '@/lib/utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getProfileData(id: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/players/${id}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return null;
  return res.json();
}

async function getOpeningRepertoire(id: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/opening-repertoire?player_id=${id}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return null;
  return res.json();
}

// 1. Updated params for Next.js 15
export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  // 2. Await the params
  const { id } = await params;
  
  const data = await getProfileData(id);
  if (!data?.player) notFound();

  const { player, standings, recentGames, ratingHistory } = data;
  
  // Fetch badges and opening repertoire concurrently
  const [{ data: badges }, repertoireData] = await Promise.all([
    supabase.from('player_badges').select('*').eq('player_id', id),
    getOpeningRepertoire(id)
  ]);

  const repertoire = repertoireData?.repertoire;

  const wins   = recentGames?.filter((g: any) => (g.result === '1-0' && g.white_player?.id === id) || (g.result === '0-1' && g.black_player?.id === id)).length ?? 0;
  const draws  = recentGames?.filter((g: any) => g.result === '0.5-0.5').length ?? 0;
  const losses = (recentGames?.length ?? 0) - wins - draws;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={player.home_league === 'league_1' ? 'league-pill-l1' : 'league-pill-l2'}>
                {player.home_league?.replace('_', ' ').toUpperCase()}
              </span>
              <span className={player.current_tier === 'premier' ? 'tier-pill-premier' : 'tier-pill-development'}>
                {player.current_tier}
              </span>
            </div>
            <h1 className="font-display text-3xl font-bold text-chalk">{player.full_name}</h1>
            {player.chess_com_username && (
              <a href={`https://chess.com/member/${player.chess_com_username}`} target="_blank" rel="noopener" className="text-sm text-ink-400 hover:text-gold transition-colors">
                @{player.chess_com_username} on Chess.com
              </a>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-4xl font-bold text-gold">{formatRating(player.ss4_rating, player.rating_deviation)}</div>
            <div className="text-xs text-ink-400 mt-1">RD: ±{Math.round(player.rating_deviation)}</div>
            <div className="text-xs text-ink-400">{player.games_played} league games</div>
          </div>
        </div>

        {/* W/D/L */}
        <div className="mt-4 grid grid-cols-3 gap-3 pt-4 border-t border-ink-700">
          <div className="text-center"><div className="text-2xl font-bold text-green-400">{wins}</div><div className="text-xs text-ink-400">Wins</div></div>
          <div className="text-center"><div className="text-2xl font-bold text-chalk-700">{draws}</div><div className="text-xs text-ink-400">Draws</div></div>
          <div className="text-center"><div className="text-2xl font-bold text-red-400">{losses}</div><div className="text-xs text-ink-400">Losses</div></div>
        </div>
      </div>

      {/* Rating Chart */}
      {ratingHistory?.length > 1 && (
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-3">Rating History</h2>
          <div className="card p-4"><RatingChart data={ratingHistory} /></div>
        </section>
      )}

      {/* Badges */}
      {badges && badges.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-3">Badges</h2>
          <BadgeWall badges={badges} />
        </section>
      )}

      {/* Season History */}
      {standings?.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-3">Season History</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-ink-400 border-b border-ink-700 bg-ink-900">
                <th className="px-4 py-3 text-left">Season</th>
                <th className="px-4 py-3 text-left">League/Tier</th>
                <th className="px-4 py-3 text-center">GP</th>
                <th className="px-4 py-3 text-center">W</th>
                <th className="px-4 py-3 text-center">D</th>
                <th className="px-4 py-3 text-center">L</th>
                <th className="px-4 py-3 text-center">Pts</th>
              </tr></thead>
              <tbody>
                {standings.map((s: any) => (
                  <tr key={`${s.season}-${s.league}`} className="border-b border-ink-700/50">
                    <td className="px-4 py-3 text-chalk">{s.season?.name ?? `S${s.season}`}</td>
                    <td className="px-4 py-3 text-ink-300 capitalize">{s.league?.replace('_', ' ')} · {s.tier}</td>
                    <td className="px-4 py-3 text-center text-ink-400">{s.games_played}</td>
                    <td className="px-4 py-3 text-center text-green-400">{s.wins}</td>
                    <td className="px-4 py-3 text-center text-ink-300">{s.draws}</td>
                    <td className="px-4 py-3 text-center text-red-400">{s.losses}</td>
                    <td className="px-4 py-3 text-center font-bold text-gold">{s.points}</td>
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
          <h2 className="font-display text-lg font-bold text-chalk mb-3">Opening Repertoire (Top 10)</h2>
          <div className="grid md:grid-cols-2 gap-4">
            
            {/* As White */}
            <div className="card p-4">
              <h3 className="text-sm font-bold text-ink-300 mb-3 border-b border-ink-700 pb-2">As White</h3>
              {repertoire.white?.length > 0 ? (
                <div className="space-y-3">
                  {repertoire.white.map((op: any) => (
                    <div key={op.moves} className="flex justify-between items-center text-sm">
                      <div className="font-mono text-xs text-chalk truncate mr-2" title={op.moves}>{op.moves}</div>
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

            {/* As Black */}
            <div className="card p-4">
              <h3 className="text-sm font-bold text-ink-300 mb-3 border-b border-ink-700 pb-2">As Black</h3>
              {repertoire.black?.length > 0 ? (
                <div className="space-y-3">
                  {repertoire.black.map((op: any) => (
                    <div key={op.moves} className="flex justify-between items-center text-sm">
                      <div className="font-mono text-xs text-chalk truncate mr-2" title={op.moves}>{op.moves}</div>
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
        <h2 className="font-display text-lg font-bold text-chalk mb-3">Recent Games</h2>
        <div className="card divide-y divide-ink-700">
          {recentGames?.map((g: any) => {
            const isWhite = g.white_player?.id === id;
            const opp = isWhite ? g.black_player : g.white_player;
            const myResult = g.result === '0.5-0.5' ? 'draw' : (isWhite ? g.result === '1-0' : g.result === '0-1') ? 'win' : 'loss';
            const colourMap = { win: 'text-green-400', draw: 'text-chalk-700', loss: 'text-red-400' };
            const ratingBefore = isWhite ? g.white_rating_before : g.black_rating_before;
            const ratingAfter = isWhite ? g.white_rating_after : g.black_rating_after;
            const change = ratingAfter && ratingBefore ? Math.round(ratingAfter - ratingBefore) : null;
            return (
              <Link key={g.id} href={`/game/${g.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-ink-700 transition-colors">
                <div>
                  <div className="text-sm text-chalk">vs {opp?.full_name}</div>
                  <div className="text-xs text-ink-400 capitalize">{g.league?.replace('_', ' ')} · {g.played_at?.slice(0, 10)}</div>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold capitalize ${colourMap[myResult as keyof typeof colourMap]}`}>{myResult}</span>
                  {change !== null && <div className={`text-xs ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>{change >= 0 ? '+' : ''}{change}</div>}
                </div>
              </Link>
            );
          })}
          {!recentGames?.length && <div className="px-4 py-8 text-center text-ink-400 text-sm">No games played yet.</div>}
        </div>
      </section>
    </div>
  );
}
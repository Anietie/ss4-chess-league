export const revalidate = 0; // Disable caching for this page
import Link from 'next/link';
import { Crown, Trophy, Shield, Star } from 'lucide-react';
import { createServerClient } from '@/lib/supabase';
import { formatRating } from '@/lib/glicko2';
import { leagueDisplayName } from '@/lib/snake-draft';
import { BADGE_META, type BadgeType } from '@/types';

async function getHallData() {
  const supabase = createServerClient();
  const [
    { data: seasons },
    { data: badges },
    { data: topRated },
    { data: clWinners },
  ] = await Promise.all([
    supabase.from('seasons').select('*').eq('status', 'complete').order('id'),
    supabase.from('player_badges').select('*, player:players(id, full_name, home_league, ss4_rating)').order('awarded_at', { ascending: false }),
    supabase.from('players').select('id, full_name, ss4_rating, rating_deviation, home_league, games_played, is_provisional').eq('is_active', true).eq('is_admin', false).order('ss4_rating', { ascending: false }).limit(20),
    supabase.from('champions_league').select('*, player:players(id, full_name)').eq('won_cl', true),
  ]);
  return { seasons: seasons || [], badges: badges || [], topRated: topRated || [], clWinners: clWinners || [] };
}

export default async function HallOfChampionsPage() {
  const { seasons, badges, topRated, clWinners } = await getHallData();
  const pioneers = badges.filter((b: any) => b.badge_type === 'pioneer_s1');
  const achievements = badges.filter((b: any) => b.badge_type !== 'pioneer_s1');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-enter">

      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden mb-12 p-12 text-center bg-gradient-to-br from-ink-900 via-navy-800/40 to-ink-900 border border-gold/15">
        <div className="absolute inset-0 bg-board-pattern opacity-5" />
        <div className="relative">
          <Shield className="text-gold w-14 h-14 mx-auto mb-4 glow-gold" />
          <h1 className="font-display text-5xl md:text-7xl font-black text-chalk mb-3">
            Hall of <span className="text-gold">Champions</span>
          </h1>
          <p className="text-ink-300 text-lg max-w-xl mx-auto">
            Every title won. Every record broken. Every legend — remembered forever.
          </p>
        </div>
      </div>

      {/* Season records */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="font-display text-3xl font-bold text-chalk">Season Records</h2>
          <div className="h-px flex-1 bg-ink-700" />
        </div>
        {seasons.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {seasons.map((s: any) => (
              <div key={s.id} className="card p-6 bg-gradient-to-br from-ink-800 to-ink-900 border-gold/20">
                <div className="flex items-center gap-2 mb-4">
                  <Crown className="text-gold" size={20} />
                  <h3 className="font-display text-xl font-bold text-chalk">{s.name}</h3>
                </div>
                <div className="space-y-3 text-sm">
                  {s.cl_winner_id && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gold/10 border border-gold/20">
                      <Trophy size={14} className="text-gold flex-shrink-0" />
                      <div>
                        <div className="text-xs text-ink-400 mb-0.5">Champions League Winner</div>
                        <Link href={`/players/${s.cl_winner_id}`} className="font-bold text-gold hover:text-gold-light transition-colors">View Champion</Link>
                      </div>
                    </div>
                  )}
                  {s.league_1_premier_champion_id && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-navy-800/40 border border-gold/10">
                      <span className="text-gold">♔</span>
                      <div>
                        <div className="text-xs text-ink-400 mb-0.5">League 1 Premier Champion</div>
                        <Link href={`/players/${s.league_1_premier_champion_id}`} className="font-medium text-chalk hover:text-gold transition-colors">View</Link>
                      </div>
                    </div>
                  )}
                  {s.league_2_premier_champion_id && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-crimson/20 border border-silver/10">
                      <span className="text-silver">♔</span>
                      <div>
                        <div className="text-xs text-ink-400 mb-0.5">League 2 Premier Champion</div>
                        <Link href={`/players/${s.league_2_premier_champion_id}`} className="font-medium text-chalk hover:text-silver transition-colors">View</Link>
                      </div>
                    </div>
                  )}
                  {s.open_cup_winner_id && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-ink-700/50">
                      <span className="text-orange-400">🏅</span>
                      <div>
                        <div className="text-xs text-ink-400 mb-0.5">Open Cup Winner</div>
                        <Link href={`/players/${s.open_cup_winner_id}`} className="font-medium text-chalk hover:text-orange-400 transition-colors">View</Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-12 text-center border-dashed border-ink-600">
            <Crown size={32} className="text-ink-600 mx-auto mb-3" />
            <h3 className="font-display text-xl font-bold text-ink-500 mb-2">Season 1 In Progress</h3>
            <p className="text-ink-600 text-sm">The first champions will be immortalised here when Season 1 concludes.</p>
          </div>
        )}
      </section>

      {/* Rating leaderboard */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="font-display text-3xl font-bold text-chalk">Rating Leaderboard</h2>
          <div className="h-px flex-1 bg-ink-700" />
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700">
                {['#', 'Player', 'League', 'Tier', 'SS4 Rating', 'Games'].map(h => (
                  <th key={h} className="text-left text-xs uppercase tracking-wider text-ink-400 py-3 px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topRated.map((p: any, i: number) => {
                const isL1 = p.home_league === 'league_1';
                const rating = formatRating(p.ss4_rating, p.rating_deviation);
                const medals: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' };
                return (
                  <tr key={p.id} className={`border-b border-ink-800 hover:bg-ink-700/20 transition-colors ${i === 0 ? 'bg-gold/5' : ''}`}>
                    <td className="py-3 px-4 text-center">
                      {medals[i]
                        ? <span className="text-lg">{medals[i]}</span>
                        : <span className="text-ink-500 font-mono text-xs">{i + 1}</span>}
                    </td>
                    <td className="py-3 px-4">
                      <Link href={`/players/${p.id}`} className="font-medium text-chalk hover:text-gold transition-colors">
                        {p.full_name}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span className={isL1 ? 'league-pill-l1' : 'league-pill-l2'}>{leagueDisplayName(p.home_league)}</span>
                    </td>
                    <td className="py-3 px-4">
                      
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-chalk">{rating}</td>
                    <td className="py-3 px-4 text-ink-400 text-center">{p.games_played}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Achievement badges */}
      {achievements.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-display text-3xl font-bold text-chalk">Achievements</h2>
            <div className="h-px flex-1 bg-ink-700" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {achievements.slice(0, 18).map((b: any) => {
              const meta = BADGE_META[b.badge_type as BadgeType];
              if (!meta) return null;
              return (
                <Link key={b.id} href={`/players/${b.player_id}`} className="card-hover p-4 flex items-center gap-4">
                  <span className="text-3xl flex-shrink-0">{meta.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-chalk">{meta.label}</div>
                    <div className="text-xs text-ink-400 truncate">{b.player?.full_name}</div>
                    <div className="text-xs text-ink-600 mt-0.5">
                      {b.season ? `Season ${b.season}` : 'All-time'} · {new Date(b.awarded_at).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Founders wall */}
      {pioneers.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-display text-3xl font-bold text-chalk">Season 1 Pioneers</h2>
            <div className="h-px flex-1 bg-ink-700" />
            <span className="text-xs text-ink-500">{pioneers.length} pioneers</span>
          </div>
          <div className="card p-8">
            <p className="text-ink-400 text-sm mb-6 text-center max-w-lg mx-auto text-balance">
              These players were present at the beginning of the first SS4 Chess League Season. Their Pioneer badge is permanent — it will never be re-awarded to anyone else.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              {pioneers.map((b: any) => (
                <Link key={b.id} href={`/players/${b.player_id}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-gold/10 border border-gold/20 hover:bg-gold/20 transition-colors group">
                  <Star size={12} className="text-gold group-hover:rotate-12 transition-transform" />
                  <span className="text-sm font-medium text-chalk">{b.player?.full_name}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
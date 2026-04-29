'use client';
import { formatRating } from '@/lib/glicko2';
import { leagueDisplayName } from '@/lib/snake-draft';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search, Star } from 'lucide-react';

interface Player {
  id: string; full_name: string; home_league: string;
  ss4_rating: number; rating_deviation: number; is_provisional: boolean;
  joining_season: number; games_played: number;
  chess_com_username?: string; calibration_complete: boolean;
}

export default function PlayersPage() {
  const [players, setPlayers]   = useState<Player[]>([]);
  const [filtered, setFiltered] = useState<Player[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [sortBy, setSortBy]     = useState<'rating' | 'name' | 'games'>('rating');

  useEffect(() => {
    fetch('/api/players')
      .then(r => r.json())
      .then(d => { setPlayers(d.players ?? []); setFiltered(d.players ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    let list = [...players];
    if (search) list = list.filter(p =>
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.chess_com_username?.toLowerCase().includes(search.toLowerCase()));
    if (leagueFilter !== 'all') list = list.filter(p => p.home_league === leagueFilter);
    list.sort((a, b) => sortBy === 'rating' ? b.ss4_rating - a.ss4_rating
      : sortBy === 'name' ? a.full_name.localeCompare(b.full_name)
      : b.games_played - a.games_played);
    setFiltered(list);
  }, [players, search, leagueFilter, sortBy]);

  const avgRating = players.length ? Math.round(players.reduce((s, p) => s + p.ss4_rating, 0) / players.length) : 0;
  const topRated  = players.reduce((max, p) => p.ss4_rating > (max?.ss4_rating ?? 0) ? p : max, players[0]);
  const leagues   = [...new Set(players.map(p => p.home_league))]
    .filter(l => /^league_\d+$/.test(l))
    .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-enter">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-black text-chalk mb-2">Players</h1>
        <p className="text-ink-400">Season 1 · {players.length} registered</p>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4 text-center">
          <div className="font-display text-3xl font-black text-gold mb-1">{players.length}</div>
          <div className="text-xs text-ink-400 uppercase tracking-wider">Total Players</div>
        </div>
        <div className="card p-4 text-center">
          <div className="font-display text-3xl font-black text-chalk mb-1">{avgRating}</div>
          <div className="text-xs text-ink-400 uppercase tracking-wider">Average Rating</div>
        </div>
        <div className="card p-4 text-center">
          <div className="font-display text-2xl font-black text-silver mb-1 truncate">{topRated?.full_name?.split(' ')[0] ?? '—'}</div>
          <div className="text-xs text-ink-400 uppercase tracking-wider">Top Rated</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or username…" className="input pl-9" />
        </div>
        <select value={leagueFilter} onChange={e => setLeagueFilter(e.target.value)} className="input w-40">
          <option value="all">All Leagues</option>
          {leagues.map(l => <option key={l} value={l}>{leagueDisplayName(l)}</option>)}
          <option value="unassigned">Unassigned</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="input w-36">
          <option value="rating">By Rating</option>
          <option value="name">By Name</option>
          <option value="games">By Games</option>
        </select>
      </div>
      {loading ? (
        <div className="card p-12 text-center text-ink-400 animate-pulse">Loading players…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-ink-500">No players found.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700">
                {['#', 'Player', 'League', 'Rating', 'RD', 'Games'].map(h => (
                  <th key={h} className="text-left text-xs uppercase tracking-wider text-ink-400 py-3 px-4 first:w-10">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const isL1 = p.home_league === 'league_1';
                return (
                  <tr key={p.id} className="border-b border-ink-800 hover:bg-ink-700/20 transition-colors">
                    <td className="py-3 px-4 text-ink-500 font-mono text-xs">{i + 1}</td>
                    <td className="py-3 px-4">
                      <Link href={`/profile/${p.id}`} className="flex items-center gap-2 group">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${isL1 ? 'bg-gold/20 text-gold' : 'bg-silver/10 text-silver'}`}>
                          {p.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-chalk group-hover:text-gold transition-colors">{p.full_name}</div>
                          {p.chess_com_username && <div className="text-xs text-ink-500">{p.chess_com_username}</div>}
                        </div>
                        {p.joining_season === 1 && <span title="Season 1 Pioneer" className="flex-shrink-0"><Star size={10} className="text-gold/60" /></span>}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span className={isL1 ? 'league-pill-l1' : 'league-pill-l2'}>{leagueDisplayName(p.home_league)}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-mono font-bold ${p.is_provisional ? 'text-ink-300' : 'text-chalk'}`}>{formatRating(p.ss4_rating, p.rating_deviation)}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-ink-400">±{Math.round(p.rating_deviation)}</td>
                    <td className="py-3 px-4 text-ink-400 text-center">{p.games_played}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-ink-800 text-xs text-ink-500">
            {filtered.length} of {players.length} players shown{search && ` · searching "${search}"`}
          </div>
        </div>
      )}
    </div>
  );
}
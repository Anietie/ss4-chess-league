'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Chess } from 'chess.js';
import { Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';

type GameRow = {
  id: string;
  result: string;
  league: string;
  tier?: string;
  played_at: string;
  time_control?: string;
  is_rated: boolean;
  white_player_id: string;
  black_player_id: string;
  white_rating_before?: number;
  black_rating_before?: number;
  white_rating_after?: number;
  black_rating_after?: number;
  white_player: { id: string; full_name: string } | null;
  black_player: { id: string; full_name: string } | null;
};

const PAGE_SIZE = 20;

const LEAGUE_LABELS: Record<string, string> = {
  casual:         'Casual',
  calibration:    'Calibration',
  league_1:       'League 1',
  league_2:       'League 2',
  league_3:       'League 3',
  league_4:       'League 4',
  league_5:       'League 5',
  league_6:       'League 6',
  champions_league: 'Champions League',
  open_cup:       'Open Cup',
  newcomer_shield:'Newcomer Shield',
  blitz:          'Blitz',
};

export default function GameHistoryPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-ink-400" size={22} />
      </div>
    }>
      <GameHistoryContent />
    </Suspense>
  );
}

function GameHistoryContent() {
  const searchParams = useSearchParams();
  const playerParam = searchParams.get('player');

  const [myId, setMyId]       = useState<string | null>(playerParam);
  const [games, setGames]     = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal]     = useState(0);

  // Filters
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [search, setSearch]             = useState('');

  // Resolve own player ID if no ?player= param
  useEffect(() => {
    if (myId) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('players').select('id').eq('auth_user_id', user.id).single();
      if (data?.id) setMyId(data.id);
    })();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const loadGames = useCallback(async (pid: string, pg: number) => {
    setLoading(true);
    const from = pg * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let q = supabase
      .from('games')
      .select(`
        id, result, league, tier, played_at, time_control, is_rated,
        white_player_id, black_player_id,
        white_rating_before, black_rating_before,
        white_rating_after,  black_rating_after,
        white_player:players!games_white_player_id_fkey(id, full_name),
        black_player:players!games_black_player_id_fkey(id, full_name)
      `, { count: 'exact' })
      .or(`white_player_id.eq.${pid},black_player_id.eq.${pid}`)
      .neq('result', '*')
      .not('league', 'eq', 'calibration')
      .order('played_at', { ascending: false })
      .range(from, to);

    if (leagueFilter !== 'all') q = q.eq('league', leagueFilter);

    const { data, count, error } = await q;
    if (error) { console.error(error); setLoading(false); return; }

    // Client-side result filter (win/draw/loss is relative to the player)
    let rows = (data ?? []) as unknown as GameRow[];
    if (resultFilter !== 'all') {
      rows = rows.filter(g => {
        const isWhite = g.white_player_id === pid;
        const r =
          g.result === '0.5-0.5' ? 'draw'
          : (isWhite ? g.result === '1-0' : g.result === '0-1') ? 'win'
          : 'loss';
        return r === resultFilter;
      });
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter(g =>
        (g.white_player?.full_name ?? '').toLowerCase().includes(s) ||
        (g.black_player?.full_name ?? '').toLowerCase().includes(s),
      );
    }

    setGames(rows);
    setTotal(count ?? 0);
    setHasMore((from + rows.length) < (count ?? 0));
    setLoading(false);
  }, [leagueFilter, resultFilter, search]);

  useEffect(() => {
    if (myId) { setPage(0); loadGames(myId, 0); }
  }, [myId, leagueFilter, resultFilter, search, loadGames]);

  useEffect(() => {
    if (myId) loadGames(myId, page);
  }, [page]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!myId && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-ink-400">Please log in to view game history.</p>
        <Link href="/auth/login" className="btn-gold btn-sm">Log In</Link>
      </div>
    );
  }

  // Aggregate stats
  const wins   = games.filter(g => myId && ((g.result === '1-0' && g.white_player_id === myId) || (g.result === '0-1' && g.black_player_id === myId))).length;
  const draws  = games.filter(g => g.result === '0.5-0.5').length;
  const losses = games.length - wins - draws;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-chalk">Game History</h1>
          <p className="text-sm text-ink-400 mt-0.5">{total} games total</p>
        </div>
        <Link href={`/profile/${myId}`} className="btn-ghost btn-sm">← Profile</Link>
      </div>

      {/* Stats row */}
      {games.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-green-400">{wins}</div>
            <div className="text-xs text-ink-400">Wins</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-ink-300">{draws}</div>
            <div className="text-xs text-ink-400">Draws</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-red-400">{losses}</div>
            <div className="text-xs text-ink-400">Losses</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search opponent */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            type="text"
            placeholder="Search opponent…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-chalk placeholder-ink-500 focus:outline-none focus:border-gold/50"
          />
        </div>

        {/* League filter */}
        <select
          value={leagueFilter}
          onChange={e => setLeagueFilter(e.target.value)}
          className="bg-ink-800 border border-ink-700 rounded-lg px-3 py-1.5 text-sm text-chalk focus:outline-none focus:border-gold/50"
        >
          <option value="all">All game types</option>
          <option value="casual">Casual</option>
          {Object.entries(LEAGUE_LABELS).filter(([k]) => k !== 'casual' && k !== 'calibration').map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Result filter */}
        <select
          value={resultFilter}
          onChange={e => setResultFilter(e.target.value)}
          className="bg-ink-800 border border-ink-700 rounded-lg px-3 py-1.5 text-sm text-chalk focus:outline-none focus:border-gold/50"
        >
          <option value="all">All results</option>
          <option value="win">Wins</option>
          <option value="draw">Draws</option>
          <option value="loss">Losses</option>
        </select>
      </div>

      {/* Games list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-ink-400" size={22} />
        </div>
      ) : games.length === 0 ? (
        <div className="card p-10 text-center text-ink-400 text-sm">No games found.</div>
      ) : (
        <div className="card divide-y divide-ink-700/60">
          {games.map(g => {
            if (!myId) return null;
            const isWhite    = g.white_player_id === myId;
            const opp        = isWhite ? g.black_player : g.white_player;
            const myResult   = g.result === '0.5-0.5' ? 'draw'
              : (isWhite ? g.result === '1-0' : g.result === '0-1') ? 'win' : 'loss';
            const rBefore    = isWhite ? g.white_rating_before : g.black_rating_before;
            const rAfter     = isWhite ? g.white_rating_after  : g.black_rating_after;
            const change     = rAfter && rBefore ? Math.round(rAfter - rBefore) : null;
            const isCasual   = g.league === 'casual';
            const leagueLabel = isCasual
              ? (g.is_rated ? 'Casual Rated' : 'Casual')
              : (LEAGUE_LABELS[g.league] ?? g.league);
            const resultColor = myResult === 'win' ? 'text-green-400' : myResult === 'loss' ? 'text-red-400' : 'text-ink-300';
            const resultBg    = myResult === 'win' ? 'bg-green-400/10' : myResult === 'loss' ? 'bg-red-400/10' : 'bg-ink-700/30';

            return (
              <div key={g.id} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-800/40 transition-colors">
                {/* Result pill */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${resultBg}`}>
                  <span className={`text-xs font-bold uppercase ${resultColor}`}>
                    {myResult === 'win' ? 'W' : myResult === 'loss' ? 'L' : 'D'}
                  </span>
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-chalk truncate">vs {opp?.full_name ?? 'Unknown'}</span>
                    <span className="text-xs text-ink-600">{isWhite ? '(White)' : '(Black)'}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-ink-500">{leagueLabel}</span>
                    {g.time_control && <span className="text-xs text-ink-600">· {g.time_control}</span>}
                    {g.played_at && <span className="text-xs text-ink-600">· {g.played_at.slice(0, 10)}</span>}
                  </div>
                </div>

                {/* Rating change */}
                <div className="text-right flex-shrink-0 w-14">
                  {change !== null ? (
                    <>
                      <div className={`text-sm font-bold ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {change >= 0 ? '+' : ''}{change}
                      </div>
                      <div className="text-xs text-ink-600">{Math.round(rAfter ?? 0)}</div>
                    </>
                  ) : (
                    <div className="text-xs text-ink-600">–</div>
                  )}
                </div>

                {/* Review link */}
                <Link
                  href={`/game/${g.id}/review`}
                  className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg border border-ink-700 text-ink-400 hover:text-gold hover:border-gold/40 transition-colors"
                >
                  Review
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {(page > 0 || hasMore) && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="btn-ghost p-2 disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-ink-400">Page {page + 1}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore}
            className="btn-ghost p-2 disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
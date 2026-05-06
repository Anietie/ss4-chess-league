'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Users, Trophy, Swords, Calendar, CheckCircle, Clock,
  ArrowRight, Loader2, AlertTriangle, Shuffle, PlayCircle
} from 'lucide-react';
import { leagueName } from '@/lib/utils';

interface AdminStats {
  season: { id: number; name: string; status: string } | null;
  totalPlayers: number;
  activePlayers: number;
  newPlayersThisSeason: number;
  returningPlayers: number;
  leagues: { league: string; count: number }[];
  pendingGames: number;
  completedGames: number;
  calibratingPlayers: number;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStats(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const statusColor: Record<string, string> = {
    registration: 'bg-blue-900/30 text-blue-300 border-blue-700/50',
    draft: 'bg-purple-900/30 text-purple-300 border-purple-700/50',
    active: 'bg-green-900/30 text-green-300 border-green-700/50',
    champions_league: 'bg-star/20 text-star border-star/40',
    complete: 'bg-ink-700 text-ink-300 border-ink-600',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gold" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-8 page-enter">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-chalk">Admin Dashboard</h1>
        <p className="text-ink-400 text-sm mt-1">League management overview</p>
      </div>

      {/* Season status banner */}
      {stats?.season && (
        <div className={`card p-5 border ${statusColor[stats.season.status] ?? 'border-ink-700'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Current Season</div>
              <div className="font-display text-xl font-bold text-chalk">
                {stats.season.name}
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize border ${statusColor[stats.season.status] ?? 'border-ink-600 text-ink-300'}`}>
              {stats.season.status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-ink-400 text-xs mb-2">
            <Users size={13} /> Total Players
          </div>
          <div className="text-2xl font-bold text-chalk">{stats?.totalPlayers ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-ink-400 text-xs mb-2">
            <Users size={13} /> Active
          </div>
          <div className="text-2xl font-bold text-green-400">{stats?.activePlayers ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-ink-400 text-xs mb-2">
            <Swords size={13} /> Pending Games
          </div>
          <div className="text-2xl font-bold text-amber-400">{stats?.pendingGames ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-ink-400 text-xs mb-2">
            <CheckCircle size={13} /> Completed
          </div>
          <div className="text-2xl font-bold text-chalk">{stats?.completedGames ?? 0}</div>
        </div>
      </div>

      {/* Season breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-xs text-ink-400 mb-3">Players This Season</div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-ink-300">New players</span>
              <span className="text-chalk font-semibold">{stats?.newPlayersThisSeason ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-300">Returning players</span>
              <span className="text-chalk font-semibold">{stats?.returningPlayers ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-300">Need calibration</span>
              <span className="text-amber-400 font-semibold">{stats?.calibratingPlayers ?? 0}</span>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-ink-400 mb-3">Leagues</div>
          <div className="space-y-2">
            {stats?.leagues?.map(l => (
              <div key={l.league} className="flex justify-between text-sm">
                <Link href={`/league/${l.league}`} className="text-ink-300 hover:text-gold transition-colors">
                  {leagueName(l.league)}
                </Link>
                <span className="text-chalk font-semibold">{l.count} players</span>
              </div>
            ))}
            {(!stats?.leagues || stats.leagues.length === 0) && (
              <p className="text-ink-500 text-sm">No leagues formed yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="font-display text-lg font-bold text-chalk mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/admin/draft" className="card-hover p-4 text-center space-y-2">
            <Shuffle size={20} className="mx-auto text-gold" />
            <div className="text-sm text-chalk font-medium">Run Draft</div>
            <div className="text-xs text-ink-400">Assign players to leagues</div>
          </Link>
          <Link href="/admin/fixtures" className="card-hover p-4 text-center space-y-2">
            <Calendar size={20} className="mx-auto text-gold" />
            <div className="text-sm text-chalk font-medium">Generate Fixtures</div>
            <div className="text-xs text-ink-400">League + SCEL brackets</div>
          </Link>
          <Link href="/admin/season" className="card-hover p-4 text-center space-y-2">
            <PlayCircle size={20} className="mx-auto text-gold" />
            <div className="text-sm text-chalk font-medium">Season Controls</div>
            <div className="text-xs text-ink-400">Advance & manage season</div>
          </Link>
          <Link href="/admin/players" className="card-hover p-4 text-center space-y-2">
            <Users size={20} className="mx-auto text-gold" />
            <div className="text-sm text-chalk font-medium">Manage Players</div>
            <div className="text-xs text-ink-400">Reactivate & manage</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
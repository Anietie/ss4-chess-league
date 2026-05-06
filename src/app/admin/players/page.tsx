'use client';

import { formatRating, leagueName } from '@/lib/utils';
import { Loader2, CheckCircle, Search, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PlayerRow {
  id: string;
  full_name: string;
  email: string;
  home_league: string;
  ss4_rating: number;
  rating_deviation: number;
  is_active: boolean;
  is_suspended: boolean;
  joining_season: number;
  games_played: number;
  calibration_complete: boolean;
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [filtered, setFiltered] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'suspended' | 'uncalibrated'>('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchPlayers();
  }, []);

  useEffect(() => {
    let list = players;
    if (search) {
      list = list.filter(p =>
        p.full_name.toLowerCase().includes(search.toLowerCase()) ||
        p.email.toLowerCase().includes(search.toLowerCase())
      );
    }
    switch (filter) {
      case 'active': list = list.filter(p => p.is_active); break;
      case 'inactive': list = list.filter(p => !p.is_active); break;
      case 'suspended': list = list.filter(p => p.is_suspended); break;
      case 'uncalibrated': list = list.filter(p => !p.calibration_complete && p.is_active); break;
    }
    setFiltered(list);
  }, [players, search, filter]);

  async function fetchPlayers() {
    try {
      const res = await fetch('/api/players?limit=200');
      const data = await res.json();
      setPlayers(data.players ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(playerId: string, makeActive: boolean) {
    setActionLoading(playerId);
    setError('');
    try {
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
        body: JSON.stringify({ is_active: makeActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess(`Player ${makeActive ? 'reactivated' : 'deactivated'} successfully.`);
      fetchPlayers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function reactivateAllReturning() {
    if (!confirm('Reactivate ALL inactive returning players for the new season?')) return;
    setError('');
    try {
      const res = await fetch('/api/admin/players/reactivate-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`${data.reactivated} returning players reactivated.`);
      fetchPlayers();
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gold" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-8 page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-chalk">Player Management</h1>
          <p className="text-ink-400 text-sm mt-1">{players.length} total players</p>
        </div>
        <button
          onClick={reactivateAllReturning}
          className="btn-gold gap-2"
        >
          <UserPlus size={14} />
          Reactivate All Returning Players
        </button>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="card p-4 bg-red-900/20 border-red-700/50 text-red-300 text-sm">{error}</div>
      )}
      {success && (
        <div className="card p-4 bg-green-900/20 border-green-700/50 text-green-300 text-sm flex items-center gap-2">
          <CheckCircle size={14} /> {success}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="input pl-9"
          />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as any)} className="input w-40">
          <option value="all">All Players</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
          <option value="uncalibrated">Needs Calibration</option>
        </select>
      </div>

      {/* Player table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-400 border-b border-ink-700 bg-ink-900">
              <th className="px-4 py-3 text-left">Player</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Email</th>
              <th className="px-4 py-3 text-left">League</th>
              <th className="px-4 py-3 text-center">Rating</th>
              <th className="px-4 py-3 text-center">Games</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-ink-700/50 hover:bg-ink-800/50">
                <td className="px-4 py-3">
                  <div className="text-chalk">{p.full_name}</div>
                  <div className="text-xs text-ink-500">S{p.joining_season}</div>
                </td>
                <td className="px-4 py-3 text-ink-400 hidden md:table-cell">{p.email}</td>
                <td className="px-4 py-3 text-ink-300">{leagueName(p.home_league)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`font-mono ${p.is_active ? 'text-gold' : 'text-ink-500'}`}>
                    {formatRating(p.ss4_rating, p.rating_deviation)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-ink-400">{p.games_played}</td>
                <td className="px-4 py-3 text-center">
                  {p.is_suspended ? (
                    <span className="text-xs text-red-400 bg-red-900/30 px-2 py-0.5 rounded-full">Suspended</span>
                  ) : p.is_active ? (
                    <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">Active</span>
                  ) : (
                    <span className="text-xs text-ink-400 bg-ink-700 px-2 py-0.5 rounded-full">Inactive</span>
                  )}
                  {!p.calibration_complete && p.is_active && (
                    <span className="text-xs text-amber-400 block mt-1">Needs calibration</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.is_active ? (
                    <button
                      onClick={() => toggleActive(p.id, false)}
                      disabled={actionLoading === p.id}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-800 hover:border-red-600 transition-colors"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleActive(p.id, true)}
                      disabled={actionLoading === p.id}
                      className="text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded border border-green-800 hover:border-green-600 transition-colors"
                    >
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-ink-400 text-sm">No players found.</div>
        )}
      </div>
    </div>
  );
}
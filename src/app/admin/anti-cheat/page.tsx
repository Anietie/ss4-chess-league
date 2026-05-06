'use client';

import { Loader2, CheckCircle, AlertTriangle, Shield, Eye, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface FlaggedGame {
  id: string;
  result: string;
  played_at: string;
  white_player: { id: string; full_name: string };
  black_player: { id: string; full_name: string };
  white_anticheat_score: number;
  black_anticheat_score: number;
  anticheat_flagged: boolean;
  competition_phase: string;
  league: string;
}

interface Violation {
  id: string;
  player_id: string;
  game_id: string;
  violation_type: string;
  severity: string;
  description: string;
  resolved_at: string | null;
  created_at: string;
  player?: { id: string; full_name: string };
}

export default function AdminAntiCheatPage() {
  const [flaggedGames, setFlaggedGames] = useState<FlaggedGame[]>([]);
  const [pendingViolations, setPendingViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [gamesRes, violationsRes] = await Promise.all([
        fetch('/api/admin/anti-cheat/flagged-games', {
          headers: { 'x-admin-secret': 'ss4-admin-2026-abc' },
        }),
        fetch('/api/admin/anti-cheat/pending-violations', {
          headers: { 'x-admin-secret': 'ss4-admin-2026-abc' },
        }),
      ]);
      const games = await gamesRes.json();
      const violations = await violationsRes.json();
      setFlaggedGames(games.flagged_games ?? []);
      setPendingViolations(violations.violations ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function resolveViolation(violationId: string, resolution: 'dismissed' | 'confirmed', severity?: string) {
    setResolving(violationId);
    setError('');
    try {
      const res = await fetch('/api/admin/anti-cheat/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
        body: JSON.stringify({ violation_id: violationId, resolution, severity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Violation ${resolution}. ${data.action_taken ?? ''}`);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResolving(null);
    }
  }

  function scoreColor(score: number): string {
    if (score >= 90) return 'text-red-400';
    if (score >= 75) return 'text-amber-400';
    return 'text-green-400';
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
      <div>
        <h1 className="font-display text-2xl font-bold text-chalk">Anti-Cheat Review</h1>
        <p className="text-ink-400 text-sm mt-1">Review flagged games and resolve violations</p>
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-ink-400 mb-1">Flagged Games</div>
          <div className="text-2xl font-bold text-amber-400">{flaggedGames.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-400 mb-1">Pending Reviews</div>
          <div className="text-2xl font-bold text-red-400">{pendingViolations.length}</div>
        </div>
      </div>

      {/* Pending violations */}
      {pendingViolations.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold text-chalk mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400" />
            Pending Violations
          </h2>
          <div className="space-y-3">
            {pendingViolations.map(v => (
              <div key={v.id} className="card p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-chalk">
                        {v.player?.full_name ?? v.player_id}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        v.severity === 'game_forfeit' 
                          ? 'bg-red-900/30 text-red-300' 
                          : 'bg-amber-900/30 text-amber-300'
                      }`}>
                        {v.severity.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-xs text-ink-400 mt-1">{v.description}</div>
                    <div className="text-xs text-ink-500 mt-1">
                      {new Date(v.created_at).toLocaleDateString()} ·{' '}
                      <Link href={`/game/${v.game_id}/review`} className="text-gold hover:underline">
                        View Game
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => resolveViolation(v.id, 'confirmed', 'game_forfeit')}
                    disabled={resolving === v.id}
                    className="btn-danger btn-sm gap-1.5"
                  >
                    <XCircle size={12} />
                    Confirm & Forfeit Game
                  </button>
                  <button
                    onClick={() => resolveViolation(v.id, 'confirmed', 'suspension')}
                    disabled={resolving === v.id}
                    className="btn-danger btn-sm gap-1.5"
                  >
                    <Shield size={12} />
                    Confirm & Suspend Player
                  </button>
                  <button
                    onClick={() => resolveViolation(v.id, 'confirmed', 'ban')}
                    disabled={resolving === v.id}
                    className="btn-danger btn-sm gap-1.5"
                  >
                    <Shield size={12} />
                    Confirm & Ban
                  </button>
                  <button
                    onClick={() => resolveViolation(v.id, 'dismissed')}
                    disabled={resolving === v.id}
                    className="btn-ghost btn-sm gap-1.5 ml-auto"
                  >
                    <CheckCircle size={12} />
                    Dismiss (False Flag)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flagged games */}
      <div>
        <h2 className="font-display text-lg font-bold text-chalk mb-3 flex items-center gap-2">
          <Eye size={16} className="text-amber-400" />
          Flagged Games
        </h2>
        {flaggedGames.length === 0 ? (
          <div className="card p-8 text-center text-ink-400 text-sm">
            <Shield size={32} className="mx-auto mb-3 text-green-400" />
            No flagged games. All clear.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-400 border-b border-ink-700 bg-ink-900">
                  <th className="px-4 py-3 text-left">Game</th>
                  <th className="px-4 py-3 text-center">Result</th>
                  <th className="px-4 py-3 text-center">White Score</th>
                  <th className="px-4 py-3 text-center">Black Score</th>
                  <th className="px-4 py-3 text-center">Date</th>
                  <th className="px-4 py-3 text-right">Review</th>
                </tr>
              </thead>
              <tbody>
                {flaggedGames.map(g => (
                  <tr key={g.id} className="border-b border-ink-700/50 hover:bg-ink-800/50">
                    <td className="px-4 py-3">
                      <span className="text-chalk">{g.white_player?.full_name}</span>
                      <span className="text-ink-500 mx-1.5">vs</span>
                      <span className="text-chalk">{g.black_player?.full_name}</span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-gold">{g.result}</td>
                    <td className={`px-4 py-3 text-center font-mono font-bold ${scoreColor(g.white_anticheat_score)}`}>
                      {g.white_anticheat_score}%
                    </td>
                    <td className={`px-4 py-3 text-center font-mono font-bold ${scoreColor(g.black_anticheat_score)}`}>
                      {g.black_anticheat_score}%
                    </td>
                    <td className="px-4 py-3 text-center text-ink-500 text-xs">
                      {g.played_at ? new Date(g.played_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/game/${g.id}/review`}
                        className="text-xs text-gold hover:underline"
                      >
                        Review Game →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
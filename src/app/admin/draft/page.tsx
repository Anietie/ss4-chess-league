'use client';

import { leagueName } from '@/lib/utils';
import { Loader2, RefreshCw, CheckCircle, AlertTriangle, Shuffle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface DraftPreview {
  assignments: {
    player_id: string;
    full_name: string;
    seed_rating: number;
    draft_position: number;
    assigned_league: string;
    is_returning: boolean;
    previous_league: string | null;
  }[];
  stats: {
    league: string;
    player_count: number;
    avg_rating: number;
    min_rating: number;
    max_rating: number;
    rating_spread: number;
  }[];
  balance: {
    balanced: boolean;
    worst_gap: number;
    details: string;
  };
  total_players: number;
  league_count: number;
}

export default function AdminDraftPage() {
  const [preview, setPreview] = useState<DraftPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [season, setSeason] = useState(1);

  useEffect(() => {
    fetchCurrentSeason();
  }, []);

  async function fetchCurrentSeason() {
    try {
      const res = await fetch('/api/admin/season?action=current');
      const data = await res.json();
      if (data.season?.id) setSeason(data.season.id);
    } catch {}
  }

  async function previewDraft() {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/draft?season=${season}&preview=true`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function commitDraft() {
    if (!confirm('Are you sure? This will assign all players to leagues and generate fixtures. This cannot be undone.')) return;
    setCommitting(true);
    setError('');
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
        body: JSON.stringify({ season }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Draft complete! ${data.total_players} players assigned to ${data.league_count} leagues. ${data.fixtures_created} fixtures generated.`);
      setPreview(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-8 page-enter">
      <div>
        <h1 className="font-display text-2xl font-bold text-chalk">Snake Draft</h1>
        <p className="text-ink-400 text-sm mt-1">Preview then commit player assignments</p>
      </div>

      {/* Controls */}
      <div className="card p-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-xs text-ink-400 block mb-1">Season</label>
            <input
              type="number"
              value={season}
              onChange={e => setSeason(Number(e.target.value))}
              className="input w-24"
              min={1}
            />
          </div>
          <button onClick={previewDraft} disabled={loading} className="btn-gold gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Preview Draft
          </button>
        </div>
        {preview && !preview.balance?.balanced && (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle size={14} />
            Imbalance detected
          </div>
        )}
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

      {/* Preview results */}
      {preview && (
        <>
          {/* Balance check */}
          <div className={`card p-4 border ${preview.balance?.balanced ? 'border-green-700/50' : 'border-amber-700/50'}`}>
            <div className="flex items-center gap-2 text-sm">
              {preview.balance?.balanced ? (
                <CheckCircle size={14} className="text-green-400" />
              ) : (
                <AlertTriangle size={14} className="text-amber-400" />
              )}
              <span className="text-chalk">{preview.balance?.details}</span>
            </div>
          </div>

          {/* League stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {preview.stats?.map(s => (
              <div key={s.league} className="card p-4">
                <div className="text-sm font-semibold text-chalk mb-3">{leagueName(s.league)}</div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-400">Players</span>
                    <span className="text-chalk">{s.player_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-400">Avg Rating</span>
                    <span className="text-chalk">{s.avg_rating}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-400">Range</span>
                    <span className="text-chalk">{s.min_rating} – {s.max_rating}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-400">Spread</span>
                    <span className="text-chalk">{s.rating_spread}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Full assignment list */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-700 bg-ink-900">
              <div className="text-sm font-semibold text-chalk">
                Draft Order ({preview.total_players} players → {preview.league_count} leagues)
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-400 border-b border-ink-700">
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Player</th>
                    <th className="px-4 py-2 text-center">Rating</th>
                    <th className="px-4 py-2 text-left">Assigned League</th>
                    <th className="px-4 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.assignments?.map(a => (
                    <tr key={a.player_id} className="border-b border-ink-700/50 hover:bg-ink-800/50">
                      <td className="px-4 py-2 text-ink-500">{a.draft_position}</td>
                      <td className="px-4 py-2 text-chalk">{a.full_name}</td>
                      <td className="px-4 py-2 text-center text-gold font-mono">{a.seed_rating}</td>
                      <td className="px-4 py-2 text-ink-300">{leagueName(a.assigned_league)}</td>
                      <td className="px-4 py-2 text-center">
                        {a.is_returning ? (
                          <span className="text-xs text-blue-400">Returning</span>
                        ) : (
                          <span className="text-xs text-green-400">New</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Commit button */}
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-chalk font-medium">Commit Draft</div>
                <div className="text-xs text-ink-400 mt-0.5">
                  This will update home_league for all players, create standings rows, and generate league fixtures.
                </div>
              </div>
              <button
                onClick={commitDraft}
                disabled={committing}
                className="btn-gold gap-2"
              >
                {committing ? <Loader2 size={14} className="animate-spin" /> : <Shuffle size={14} />}
                {committing ? 'Committing...' : 'Commit Draft'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
'use client';

import { Loader2, CheckCircle, ArrowRight, Trophy, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SeasonInfo {
  id: number;
  name: string;
  status: string;
  start_date: string;
  end_date: string | null;
}

const STATUS_FLOW = [
  { status: 'registration', label: 'Registration', icon: '📝' },
  { status: 'draft', label: 'Draft', icon: '🎯' },
  { status: 'active', label: 'Active (League + SCEL)', icon: '⚔️' },
  { status: 'champions_league', label: 'Champions League', icon: '👑' },
  { status: 'complete', label: 'Complete', icon: '🏆' },
];

export default function AdminSeasonPage() {
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [endingLeague, setEndingLeague] = useState(false);
  const [clAction, setClAction] = useState('');
  const [clWinnerId, setClWinnerId] = useState('');
  const [clRunnerUpId, setClRunnerUpId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchSeason();
  }, []);

  async function fetchSeason() {
    try {
      const res = await fetch('/api/admin/season?action=current');
      const data = await res.json();
      setSeason(data.season);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function advanceStatus() {
    if (!confirm(`Advance season from "${season?.status}" to the next stage?`)) return;
    setAdvancing(true);
    setError('');
    try {
      const res = await fetch('/api/admin/season', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
        body: JSON.stringify({ action: 'advance_status', season: season?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Season advanced: ${data.previous_status} → ${data.new_status}`);
      fetchSeason();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdvancing(false);
    }
  }

  async function endLeaguePhase() {
    if (!confirm('End the league phase? This will calculate final positions and determine Champions League qualifiers.')) return;
    setEndingLeague(true);
    setError('');
    try {
      const res = await fetch('/api/admin/season-end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
        body: JSON.stringify({ season: season?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`League phase ended. ${data.cup_qualifiers} Champions League qualifiers.`);
      fetchSeason();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEndingLeague(false);
    }
  }

  async function clActionHandler(action: string) {
    setClAction(action);
    setError('');
    try {
      const body: any = { action, season: season?.id };
      if (action === 'finalize') {
        body.cl_winner_id = clWinnerId;
        body.cl_runner_up_id = clRunnerUpId || null;
      }
      const res = await fetch('/api/champions-league', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`${action}: ${data.success ? 'Done!' : JSON.stringify(data)}`);
      fetchSeason();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setClAction('');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gold" size={28} />
      </div>
    );
  }

  const currentStatusIdx = STATUS_FLOW.findIndex(s => s.status === season?.status);

  return (
    <div className="space-y-8 page-enter">
      <div>
        <h1 className="font-display text-2xl font-bold text-chalk">Season Controls</h1>
        <p className="text-ink-400 text-sm mt-1">Manage the season lifecycle</p>
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

      {/* Status flow */}
      <div className="card p-5">
        <div className="text-sm font-semibold text-chalk mb-4">Season Progress</div>
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FLOW.map((s, i) => (
            <div key={s.status} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                i === currentStatusIdx
                  ? 'bg-gold/10 border-gold/30 text-gold'
                  : i < currentStatusIdx
                  ? 'bg-green-900/20 border-green-700/50 text-green-300'
                  : 'bg-ink-800 border-ink-700 text-ink-400'
              }`}>
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </div>
              {i < STATUS_FLOW.length - 1 && (
                <ArrowRight size={14} className="text-ink-600 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Current season info */}
      {season && (
        <div className="card p-5">
          <div className="text-sm font-semibold text-chalk mb-3">Current Season</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-ink-400">Name:</span>{' '}
              <span className="text-chalk">{season.name}</span>
            </div>
            <div>
              <span className="text-ink-400">Status:</span>{' '}
              <span className="text-chalk capitalize">{season.status.replace(/_/g, ' ')}</span>
            </div>
            <div>
              <span className="text-ink-400">Start:</span>{' '}
              <span className="text-chalk">{season.start_date}</span>
            </div>
            <div>
              <span className="text-ink-400">End:</span>{' '}
              <span className="text-chalk">{season.end_date ?? 'TBD'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-4">
        {/* Advance status */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-chalk font-medium">Advance Season Status</div>
              <div className="text-xs text-ink-400 mt-0.5">
                Moves to the next stage: {STATUS_FLOW[currentStatusIdx + 1]?.label ?? 'Complete'}
              </div>
            </div>
            <button
              onClick={advanceStatus}
              disabled={advancing || !season || season.status === 'complete'}
              className="btn-gold gap-2"
            >
              {advancing ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              Advance
            </button>
          </div>
        </div>

        {/* End league phase */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-chalk font-medium">End League Phase</div>
              <div className="text-xs text-ink-400 mt-0.5">
                Calculates final positions, determines CL qualifiers, and advances to Champions League stage.
              </div>
            </div>
            <button
              onClick={endLeaguePhase}
              disabled={endingLeague || season?.status !== 'active'}
              className="btn-gold gap-2"
            >
              {endingLeague ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />}
              End League Phase
            </button>
          </div>
        </div>

        {/* Champions League */}
        <div className="card p-5 space-y-4">
          <div>
            <div className="text-sm text-chalk font-medium">Champions League Management</div>
            <div className="text-xs text-ink-400 mt-0.5">
              Only available when season is in champions_league status.
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => clActionHandler('draw_groups')}
              disabled={clAction !== '' || season?.status !== 'champions_league'}
              className="btn-ghost gap-2 justify-center"
            >
              {clAction === 'draw_groups' ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
              Draw Groups
            </button>
            <button
              onClick={() => clActionHandler('generate_knockout')}
              disabled={clAction !== '' || season?.status !== 'champions_league'}
              className="btn-ghost gap-2 justify-center"
            >
              {clAction === 'generate_knockout' ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />}
              Generate Knockout
            </button>
            <button
              onClick={() => clActionHandler('finalize')}
              disabled={clAction !== '' || season?.status !== 'champions_league' || !clWinnerId}
              className="btn-ghost gap-2 justify-center"
            >
              {clAction === 'finalize' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Finalize
            </button>
          </div>
          {(season?.status === 'champions_league') && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <input
                type="text"
                placeholder="CL Winner Player ID"
                value={clWinnerId}
                onChange={e => setClWinnerId(e.target.value)}
                className="input"
              />
              <input
                type="text"
                placeholder="CL Runner-Up Player ID (optional)"
                value={clRunnerUpId}
                onChange={e => setClRunnerUpId(e.target.value)}
                className="input"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
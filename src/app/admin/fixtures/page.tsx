'use client';

import { leagueName } from '@/lib/utils';
import { Calendar, Loader2, CheckCircle, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';

interface LeagueInfo {
  league: string;
  playerCount: number;
  hasFixtures: boolean;
}

export default function AdminFixturesPage() {
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [scelGenerating, setScelGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [season, setSeason] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [scelData, setScelData] = useState<any>(null);

  useEffect(() => {
    fetchCurrentSeason();
    fetchLeagues();
  }, []);

  async function fetchCurrentSeason() {
      try {
        const res = await fetch('/api/admin/season?action=current', {
          headers: {
            'x-admin-secret': 'ss4-admin-2026-abc',
          },
        });
        const data = await res.json();
        if (data.season?.id) setSeason(data.season.id);
      } catch {}
    }

  async function fetchLeagues() {
      try {
        const res = await fetch('/api/admin/leagues', {
          headers: {
            'x-admin-secret': 'ss4-admin-2026-abc',
          },
        });
        const data = await res.json();
        setLeagues(data.leagues ?? []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

  async function generateLeagueFixtures(league: string) {
    if (!startDate) {
      setError('Please set a start date first.');
      return;
    }
    setGenerating(league);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/fixtures', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
        body: JSON.stringify({ season, league, start_date: startDate, time_control: '600+5' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Fixtures generated for ${leagueName(league)}: ${data.fixtures_created} games, ${data.rounds} rounds.`);
      fetchLeagues();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(null);
    }
  }

  async function generateAllFixtures() {
    if (!startDate) {
      setError('Please set a start date first.');
      return;
    }
    if (!confirm(`Generate fixtures for ALL leagues starting ${startDate}?`)) return;
    setError('');
    setSuccess('');
    let generated = 0;
    for (const l of leagues.filter(l => !l.hasFixtures)) {
      setGenerating(l.league);
      try {
        const res = await fetch('/api/fixtures', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': 'ss4-admin-2026-abc',
          },
          body: JSON.stringify({ season, league: l.league, start_date: startDate, time_control: '600+5' }),
        });
        if (res.ok) generated++;
      } catch {}
    }
    setGenerating(null);
    setSuccess(`Fixtures generated for ${generated} leagues.`);
    fetchLeagues();
  }

  async function generateScelBracket() {
    setScelGenerating(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/competitions/scel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
        body: JSON.stringify({ season, action: 'generate_bracket' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScelData(data);
      setSuccess(`SCEL bracket generated! ${data.participants} players, ${data.bracket_size}-player bracket, ${data.byes_awarded} byes awarded.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setScelGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gold" size={28} />
      </div>
    );
  }

  const allHaveFixtures = leagues.every(l => l.hasFixtures);

  return (
    <div className="space-y-8 page-enter">
      <div>
        <h1 className="font-display text-2xl font-bold text-chalk">Fixtures & SCEL</h1>
        <p className="text-ink-400 text-sm mt-1">Generate league fixtures and SCEL bracket</p>
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

      {/* Start date */}
      <div className="card p-5">
        <label className="text-xs text-ink-400 block mb-2">Season Start Date</label>
        <div className="flex gap-3 items-center">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="input w-48"
          />
          <button
            onClick={generateAllFixtures}
            disabled={!startDate || allHaveFixtures || generating !== null}
            className="btn-gold gap-2"
          >
            <Calendar size={14} />
            Generate All League Fixtures
          </button>
        </div>
      </div>

      {/* League fixtures */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-700 bg-ink-900">
          <div className="text-sm font-semibold text-chalk">League Fixtures</div>
        </div>
        <div className="divide-y divide-ink-700">
          {leagues.map(l => (
            <div key={l.league} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm text-chalk">{leagueName(l.league)}</div>
                <div className="text-xs text-ink-400">{l.playerCount} players</div>
              </div>
              {l.hasFixtures ? (
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <CheckCircle size={12} /> Generated
                </span>
              ) : (
                <button
                  onClick={() => generateLeagueFixtures(l.league)}
                  disabled={!startDate || generating === l.league}
                  className="btn-ghost btn-sm gap-1.5"
                >
                  {generating === l.league ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Calendar size={12} />
                  )}
                  Generate
                </button>
              )}
            </div>
          ))}
          {leagues.length === 0 && (
            <div className="px-4 py-8 text-center text-ink-400 text-sm">
              No leagues formed yet. Run the draft first.
            </div>
          )}
        </div>
      </div>

      {/* SCEL Bracket */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-chalk">SCEL Bracket</div>
            <div className="text-xs text-ink-400 mt-0.5">
              SS4 Chess Elimination League — single elimination bracket
            </div>
          </div>
          <button
            onClick={generateScelBracket}
            disabled={scelGenerating}
            className="btn-gold gap-2"
          >
            {scelGenerating ? <Loader2 size={14} className="animate-spin" /> : <Swords size={14} />}
            Generate SCEL Bracket
          </button>
        </div>

        {scelData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-ink-800 rounded-lg p-3 text-center">
              <div className="text-xs text-ink-400">Participants</div>
              <div className="text-lg font-bold text-chalk">{scelData.participants}</div>
            </div>
            <div className="bg-ink-800 rounded-lg p-3 text-center">
              <div className="text-xs text-ink-400">Bracket Size</div>
              <div className="text-lg font-bold text-chalk">{scelData.bracket_size}</div>
            </div>
            <div className="bg-ink-800 rounded-lg p-3 text-center">
              <div className="text-xs text-ink-400">Rounds</div>
              <div className="text-lg font-bold text-chalk">{scelData.total_rounds}</div>
            </div>
            <div className="bg-ink-800 rounded-lg p-3 text-center">
              <div className="text-xs text-ink-400">Byes</div>
              <div className="text-lg font-bold text-chalk">{scelData.byes_awarded}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
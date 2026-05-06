'use client';

import { Loader2, CheckCircle, Calendar, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function AdminRegistrationPage() {
  const [season, setSeason] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    registration_start: '',
    registration_end: '',
    season_start: '',
  });

  useEffect(() => {
    fetchSeason();
  }, []);

  async function fetchSeason() {
    try {
      const res = await fetch('/api/admin/season?action=current', {
        headers: { 'x-admin-secret': 'ss4-admin-2026-abc' },
      });
      const data = await res.json();
      if (data.season) {
        setSeason(data.season);
        setForm({
          registration_start: data.season.registration_start?.split('T')[0] || '',
          registration_end: data.season.registration_end?.split('T')[0] || '',
          season_start: data.season.start_date?.split('T')[0] || '',
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveDates() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/season', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
        body: JSON.stringify({
          action: 'update_dates',
          season: season?.id,
          registration_start: form.registration_start,
          registration_end: form.registration_end,
          season_start: form.season_start || form.registration_start,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Registration dates updated successfully!');
      fetchSeason();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function openRegistration() {
    if (!confirm('Open registration now?')) return;
    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/admin/season', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
        body: JSON.stringify({
          action: 'update_dates',
          season: season?.id,
          registration_start: today,
          registration_end: form.registration_end || '',
          season_start: form.season_start || today,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Registration is now OPEN!');
      fetchSeason();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function closeRegistration() {
    if (!confirm('Close registration? This will prevent new sign-ups.')) return;
    setSaving(true);
    try {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const res = await fetch('/api/admin/season', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'ss4-admin-2026-abc',
        },
        body: JSON.stringify({
          action: 'update_dates',
          season: season?.id,
          registration_end: yesterday,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Registration is now CLOSED.');
      fetchSeason();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-orange-500" size={28} />
    </div>
  );

  return (
    <div className="space-y-8 page-enter">
      <div>
        <h1 className="font-display text-2xl font-bold text-chalk">Registration Settings</h1>
        <p className="text-ink-400 text-sm mt-1">Manage registration window and season dates</p>
      </div>

      {error && <div className="card p-4 bg-red-900/20 border-red-700/50 text-red-300 text-sm">{error}</div>}
      {success && (
        <div className="card p-4 bg-green-900/20 border-green-700/50 text-green-300 text-sm flex items-center gap-2">
          <CheckCircle size={14} /> {success}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={openRegistration} disabled={saving} className="card-hover p-4 text-center border border-green-700/50 hover:border-green-500">
          <div className="text-2xl mb-2">📝</div>
          <div className="text-sm font-medium text-green-400">Open Registration Now</div>
          <div className="text-xs text-ink-400 mt-1">Sets start date to today</div>
        </button>
        <button onClick={closeRegistration} disabled={saving} className="card-hover p-4 text-center border border-red-700/50 hover:border-red-500">
          <div className="text-2xl mb-2">🔒</div>
          <div className="text-sm font-medium text-red-400">Close Registration</div>
          <div className="text-xs text-ink-400 mt-1">Sets end date to yesterday</div>
        </button>
      </div>

      {/* Date Form */}
      <div className="card p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-chalk flex items-center gap-2">
          <Calendar size={16} className="text-orange-500" />
          Season Dates
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="section-label block mb-1.5">Registration Opens</label>
            <input
              type="date"
              value={form.registration_start}
              onChange={e => setForm(f => ({ ...f, registration_start: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="section-label block mb-1.5">Registration Closes</label>
            <input
              type="date"
              value={form.registration_end}
              onChange={e => setForm(f => ({ ...f, registration_end: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="section-label block mb-1.5">Season Starts</label>
            <input
              type="date"
              value={form.season_start}
              onChange={e => setForm(f => ({ ...f, season_start: e.target.value }))}
              className="input"
            />
          </div>
        </div>

        {/* Status Display */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-ink-400" />
            <span className="text-ink-400">Status:</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
              season?.status === 'registration' ? 'bg-green-900/30 text-green-400' :
              season?.status === 'draft' ? 'bg-blue-900/30 text-blue-400' :
              season?.status === 'active' ? 'bg-orange-900/30 text-orange-400' :
              'bg-ink-700 text-ink-300'
            }`}>
              {season?.status?.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-ink-400">Registration:</span>
            {season?.status === 'registration' ? (
              <span className="text-green-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Open
              </span>
            ) : (
              <span className="text-red-400">Closed</span>
            )}
          </div>
        </div>

        <button onClick={saveDates} disabled={saving} className="btn-gold">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          Save Dates
        </button>
      </div>
    </div>
  );
}
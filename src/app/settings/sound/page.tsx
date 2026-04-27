"use client";
import { ArrowLeft, Volume2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function SoundSettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/settings/sound")
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading sound settings:", err);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/sound", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
      }
    } catch (err) {
      console.error("Error saving settings:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-20">Loading...</div>;
  if (!settings)
    return (
      <div className="text-center py-20 text-red-400">
        Failed to load settings
      </div>
    );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-ink-400 hover:text-chalk transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-chalk">
            Sound Settings
          </h1>
          <p className="text-sm text-ink-400 mt-1">
            Customize your audio experience
          </p>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        {/* Master volume */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-chalk font-medium">
            <Volume2 size={18} className="text-gold" />
            Master Volume
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              value={settings.sound_volume}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  sound_volume: parseInt(e.target.value),
                })
              }
              disabled={!settings.sound_enabled}
              className="flex-1 h-2 bg-ink-700 rounded-lg appearance-none cursor-pointer accent-gold"
            />
            <span className="text-sm font-mono text-gold w-12 text-right">
              {settings.sound_volume}%
            </span>
          </div>
          <p className="text-xs text-ink-400">
            Enable/disable all sounds below
          </p>
        </div>

        {/* Sound toggles */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.sound_enabled}
              onChange={(e) =>
                setSettings({ ...settings, sound_enabled: e.target.checked })
              }
              className="w-4 h-4 accent-gold"
            />
            <span className="text-chalk font-medium">Enable Sounds</span>
          </label>
        </div>

        <div className="border-t border-ink-700 pt-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer opacity-90 disabled:opacity-50">
            <input
              type="checkbox"
              checked={settings.sound_move}
              onChange={(e) =>
                setSettings({ ...settings, sound_move: e.target.checked })
              }
              disabled={!settings.sound_enabled}
              className="w-4 h-4 accent-gold"
            />
            <span className="text-chalk">Move Sound</span>
            <span className="text-xs text-ink-400 ml-auto">Plays on move</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer opacity-90 disabled:opacity-50">
            <input
              type="checkbox"
              checked={settings.sound_capture}
              onChange={(e) =>
                setSettings({ ...settings, sound_capture: e.target.checked })
              }
              disabled={!settings.sound_enabled}
              className="w-4 h-4 accent-gold"
            />
            <span className="text-chalk">Capture Sound</span>
            <span className="text-xs text-ink-400 ml-auto">
              Plays on capture
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer opacity-90 disabled:opacity-50">
            <input
              type="checkbox"
              checked={settings.sound_check}
              onChange={(e) =>
                setSettings({ ...settings, sound_check: e.target.checked })
              }
              disabled={!settings.sound_enabled}
              className="w-4 h-4 accent-gold"
            />
            <span className="text-chalk">Check Sound</span>
            <span className="text-xs text-ink-400 ml-auto">Plays on check</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer opacity-90 disabled:opacity-50">
            <input
              type="checkbox"
              checked={settings.sound_game_end}
              onChange={(e) =>
                setSettings({ ...settings, sound_game_end: e.target.checked })
              }
              disabled={!settings.sound_enabled}
              className="w-4 h-4 accent-gold"
            />
            <span className="text-chalk">Game End Sound</span>
            <span className="text-xs text-ink-400 ml-auto">
              Plays on game finish
            </span>
          </label>
        </div>

        {success && (
          <div className="bg-green-900/20 text-green-400 p-3 rounded-lg text-sm">
            ✓ Settings saved successfully
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-ink-700">
          <Link href="/dashboard" className="btn-ghost">
            Cancel
          </Link>
          <button onClick={handleSave} disabled={saving} className="btn-gold">
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

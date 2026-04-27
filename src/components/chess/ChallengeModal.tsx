"use client";
import { Zap } from "lucide-react";
import { useState } from "react";

interface ChallengeModalProps {
  opponentId: string;
  opponentName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ChallengeModal({
  opponentId,
  opponentName,
  onClose,
  onSuccess,
}: ChallengeModalProps) {
  const [isRated, setIsRated] = useState(false);
  const [timeControl, setTimeControl] = useState("600+5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChallenge = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/casual-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opponent_id: opponentId,
          is_rated: isRated,
          time_control: timeControl,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create challenge");
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="card p-6 max-w-sm mx-4 space-y-4">
        <div className="flex items-center gap-2">
          <Zap size={20} className="text-gold" />
          <h2 className="font-display text-xl font-bold text-chalk">
            Challenge {opponentName}
          </h2>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-chalk mb-2">Game Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setIsRated(false)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  !isRated
                    ? "bg-gold text-navy"
                    : "bg-ink-700 text-ink-300 hover:bg-ink-600"
                }`}
              >
                Casual
              </button>
              <button
                onClick={() => setIsRated(true)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  isRated
                    ? "bg-gold text-navy"
                    : "bg-ink-700 text-ink-300 hover:bg-ink-600"
                }`}
              >
                Rated
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-chalk mb-2">
              Time Control
            </label>
            <select
              value={timeControl}
              onChange={(e) => setTimeControl(e.target.value)}
              className="w-full px-3 py-2 bg-ink-700 text-chalk rounded-lg border border-ink-600 text-sm"
            >
              <option value="300+0">Blitz 5m</option>
              <option value="600+5">Rapid 10m+5s</option>
              <option value="900+10">Rapid 15m+10s</option>
              <option value="1800+15">Classical 30m+15s</option>
            </select>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 p-2 rounded">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} disabled={loading} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleChallenge}
            disabled={loading}
            className="btn-gold"
          >
            {loading ? "Sending..." : "Send Challenge"}
          </button>
        </div>
      </div>
    </div>
  );
}

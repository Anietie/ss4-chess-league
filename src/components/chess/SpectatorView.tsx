"use client";
import { Check, Copy, Eye } from "lucide-react";
import { useState } from "react";

interface SpectatorViewProps {
  gameId: string;
  isSpectating: boolean;
  isLiveGame: boolean;
}

export function SpectatorView({
  gameId,
  isSpectating,
  isLiveGame,
}: SpectatorViewProps) {
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const spectateUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/game/${gameId}?spectate=true`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(spectateUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isLiveGame) {
    return null;
  }

  if (isSpectating) {
    return (
      <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 mb-4 text-sm text-blue-300 flex items-center gap-2">
        <Eye size={14} />
        <span>You are spectating this game</span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowShareModal(true)}
        className="text-xs text-ink-400 hover:text-gold transition-colors flex items-center gap-1 mb-2"
      >
        <Eye size={12} />
        Share spectate link
      </button>

      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="card p-4 max-w-sm mx-4 space-y-3">
            <h3 className="font-semibold text-chalk">Share Spectate Link</h3>
            <div className="flex gap-2 bg-ink-900 rounded p-2">
              <input
                type="text"
                value={spectateUrl}
                readOnly
                className="flex-1 bg-transparent text-xs text-ink-400 outline-none"
              />
              <button
                onClick={handleCopyLink}
                className="text-gold hover:text-chalk transition-colors"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-xs text-ink-400">
              Share this link to let others watch your game in real-time.
            </p>
            <button
              onClick={() => setShowShareModal(false)}
              className="w-full btn-ghost text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

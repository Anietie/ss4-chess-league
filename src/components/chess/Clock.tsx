'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  initialMs: number;       // starting milliseconds
  incrementMs?: number;    // increment per move (e.g. 5000 for 5s)
  isRunning: boolean;
  serverTimeMs?: number;   // latest server timestamp for sync (optional)
  onFlag?: () => void;     // called when clock hits 0
  side: 'white' | 'black';
  label?: string;
}

function formatTime(ms: number): string {
  if (ms <= 0) return '0:00.0';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (ms < 20_000) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function Clock({ initialMs, incrementMs = 0, isRunning, serverTimeMs, onFlag, side, label }: Props) {
  const [remaining, setRemaining] = useState(initialMs);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTickRef = useRef<number>(Date.now());

  // Sync to server time when provided
  useEffect(() => {
    if (serverTimeMs !== undefined && serverTimeMs !== remaining) {
      setRemaining(serverTimeMs);
    }
  }, [serverTimeMs]);

  useEffect(() => {
    setRemaining(initialMs);
  }, [initialMs]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    lastTickRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      setRemaining(prev => {
        const next = prev - elapsed;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onFlag?.();
          return 0;
        }
        return next;
      });
    }, 100);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, onFlag]);

  const isLow  = remaining <= 30_000;
  const isCrit = remaining <= 10_000;
  const isEmpty = remaining <= 0;

  const clockClass = !isRunning
    ? 'clock-inactive'
    : isCrit
    ? 'clock-low'
    : isLow
    ? 'font-mono text-2xl font-bold tabular-nums text-orange-400'
    : 'clock-active';

  return (
    <div className={`
      flex flex-col items-center justify-center px-5 py-3 rounded-xl
      border transition-all duration-200
      ${isRunning ? 'bg-ink-700 border-gold/50 shadow-lg shadow-gold/10' : 'bg-ink-900 border-ink-700'}
      ${isEmpty ? 'border-red-500 bg-red-900/30' : ''}
    `}>
      {label && <div className="text-xs text-ink-500 mb-1 uppercase tracking-wider">{label}</div>}
      <div className={clockClass}>{formatTime(remaining)}</div>
      {incrementMs > 0 && (
        <div className="text-[10px] text-ink-500 mt-0.5">+{incrementMs / 1000}s</div>
      )}
    </div>
  );
}
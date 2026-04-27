'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface ClockHandle {
  /** Add the configured increment to the remaining time (call after player moves). */
  addIncrement: () => void;
  /** Read the current remaining ms without triggering a render. */
  getRemaining: () => number;
}

interface Props {
  initialMs: number;         // starting milliseconds
  incrementMs?: number;      // increment per move (e.g. 5000 for 5 s)
  isRunning: boolean;
  /**
   * When provided, the clock snaps to this value only if the drift exceeds
   * DRIFT_THRESHOLD — prevents jitter from frequent server pings.
   */
  serverTimeMs?: number;
  onFlag?: () => void;       // called exactly once when the clock hits 0
  side: 'white' | 'black';
  label?: string;
}

// Only snap to server time when drift exceeds this many ms.
const DRIFT_THRESHOLD = 500;

function formatTime(ms: number): string {
  if (ms <= 0) return '0:00.0';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // Show tenths of a second when under 20 s
  if (ms < 20_000) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export const Clock = forwardRef<ClockHandle, Props>(function Clock(
  { initialMs, incrementMs = 0, isRunning, serverTimeMs, onFlag, side, label },
  ref,
) {
  const [remaining, setRemaining] = useState(initialMs);

  // Mirror of `remaining` that is always current — safe to read inside
  // callbacks without stale-closure issues.
  const remainingRef = useRef(initialMs);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(0);
  const flaggedRef   = useRef(false);  // guard: fire onFlag exactly once

  // Keep onFlag behind a ref so we never need to re-create the interval
  // just because the parent passed a new inline function reference.
  const onFlagRef = useRef(onFlag);
  useEffect(() => { onFlagRef.current = onFlag; }, [onFlag]);

  // ── Imperative handle ────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    addIncrement() {
      if (incrementMs <= 0) return;
      setRemaining(prev => {
        const next = prev + incrementMs;
        remainingRef.current = next;
        return next;
      });
    },
    getRemaining: () => remainingRef.current,
  }), [incrementMs]);

  // ── Reset when a new game begins (initialMs changes) ────────────────────
  useEffect(() => {
    flaggedRef.current = false;
    setRemaining(initialMs);
    remainingRef.current = initialMs;
  }, [initialMs]);

  // ── Server sync ──────────────────────────────────────────────────────────
  // Only snap when drift is significant to avoid visual jitter.
  useEffect(() => {
    if (serverTimeMs === undefined) return;
    if (Math.abs(serverTimeMs - remainingRef.current) > DRIFT_THRESHOLD) {
      setRemaining(serverTimeMs);
      remainingRef.current = serverTimeMs;
    }
  }, [serverTimeMs]);

  // ── Main tick loop ───────────────────────────────────────────────────────
  useEffect(() => {
    // Always clear any existing interval first.
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isRunning) return;

    // Stamp the start *after* clearing so there is zero phantom elapsed on the
    // first tick — avoids the "big jump on resume" bug.
    lastTickRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const now     = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      setRemaining(prev => {
        const next = prev - elapsed;
        remainingRef.current = next;

        if (next <= 0) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          if (!flaggedRef.current) {
            flaggedRef.current = true;
            // Schedule outside the setter so React does not complain about
            // state updates during rendering.
            setTimeout(() => onFlagRef.current?.(), 0);
          }
          return 0;
        }
        return next;
      });
    }, 100);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]); // only isRunning — onFlag and incrementMs handled via refs

  // ── Derived display states ───────────────────────────────────────────────
  const isLow   = remaining <= 30_000;
  const isCrit  = remaining <= 10_000;
  const isEmpty = remaining <= 0;

  const clockClass = !isRunning
    ? 'clock-inactive'
    : isCrit
    ? 'clock-low'
    : isLow
    ? 'font-mono text-2xl font-bold tabular-nums text-orange-400'
    : 'clock-active';

  return (
    <div
      className={[
        'flex flex-col items-center justify-center px-5 py-3 rounded-xl border transition-all duration-200',
        isRunning
          ? 'bg-ink-700 border-gold/50 shadow-lg shadow-gold/10'
          : 'bg-ink-900 border-ink-700',
        isEmpty ? 'border-red-500 bg-red-900/30' : '',
      ].join(' ')}
    >
      {label && (
        <div className="text-xs text-ink-500 mb-1 uppercase tracking-wider">
          {label}
        </div>
      )}
      <div className={clockClass}>{formatTime(remaining)}</div>
      {incrementMs > 0 && (
        <div className="text-[10px] text-ink-500 mt-0.5">
          +{incrementMs / 1000}s
        </div>
      )}
    </div>
  );
});
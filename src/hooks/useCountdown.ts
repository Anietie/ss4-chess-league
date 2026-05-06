// src/hooks/useCountdown.ts
'use client';
import { useEffect, useState, useCallback } from 'react';

export interface CountdownState {
  status: 'upcoming' | 'open' | 'closing_soon' | 'closed' | 'none';
  label: string;
  timeLeft: string;
  isOpen: boolean;
  isClosed: boolean;
  windowStart: Date | null;
  windowEnd: Date | null;
  secondsToStart: number;
  secondsToEnd: number;
}

interface RoundWindow {
  window_start: string;
  window_end: string;
  status: string;
}

export function useCountdown(window: RoundWindow | null | undefined): CountdownState {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!window || !window.window_start || !window.window_end) {
    return {
      status: 'none',
      label: 'No window scheduled',
      timeLeft: '--:--:--',
      isOpen: false,
      isClosed: false,
      windowStart: null,
      windowEnd: null,
      secondsToStart: 0,
      secondsToEnd: 0,
    };
  }

  const start = new Date(window.window_start);
  const end = new Date(window.window_end);
  const diffToStart = start.getTime() - now.getTime();
  const diffToEnd = end.getTime() - now.getTime();

  // Already closed by status
  if (window.status === 'closed') {
    return {
      status: 'closed',
      label: 'Window closed',
      timeLeft: '00:00:00',
      isOpen: false,
      isClosed: true,
      windowStart: start,
      windowEnd: end,
      secondsToStart: 0,
      secondsToEnd: 0,
    };
  }

  if (diffToStart > 0) {
    // Window hasn't started yet
    const days = Math.floor(diffToStart / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffToStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffToStart % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffToStart % (1000 * 60)) / 1000);

    let label: string;
    if (days > 0) {
      label = `Starts in ${days}d ${hours}h`;
    } else if (hours > 0) {
      label = `Starts in ${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      label = `Starts in ${minutes}m ${seconds}s`;
    } else {
      label = `Starts in ${seconds}s`;
    }

    return {
      status: 'upcoming',
      label,
      timeLeft: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      isOpen: false,
      isClosed: false,
      windowStart: start,
      windowEnd: end,
      secondsToStart: Math.floor(diffToStart / 1000),
      secondsToEnd: Math.floor(diffToEnd / 1000),
    };
  }

  if (diffToEnd > 0) {
    // Window is open
    const minutesLeft = Math.floor(diffToEnd / (1000 * 60));
    const seconds = Math.floor((diffToEnd % (1000 * 60)) / 1000);
    const closingSoon = diffToEnd < 15 * 60 * 1000; // 15 minutes

    let label: string;
    if (closingSoon) {
      label = `Closes in ${minutesLeft}:${String(seconds).padStart(2, '0')}`;
    } else {
      label = 'Window open — join now!';
    }

    return {
      status: closingSoon ? 'closing_soon' : 'open',
      label,
      timeLeft: `${String(Math.floor(minutesLeft / 60)).padStart(2, '0')}:${String(minutesLeft % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      isOpen: true,
      isClosed: false,
      windowStart: start,
      windowEnd: end,
      secondsToStart: 0,
      secondsToEnd: Math.floor(diffToEnd / 1000),
    };
  }

  // Window ended
  return {
    status: 'closed',
    label: 'Window closed',
    timeLeft: '00:00:00',
    isOpen: false,
    isClosed: true,
    windowStart: start,
    windowEnd: end,
    secondsToStart: 0,
    secondsToEnd: 0,
  };
}
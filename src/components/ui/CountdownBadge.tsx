// src/components/ui/CountdownBadge.tsx
'use client';
import { useCountdown } from '@/hooks/useCountdown';
import { Clock, Play, AlertTriangle, XCircle } from 'lucide-react';

interface Props {
  window: { window_start: string; window_end: string; status: string } | null | undefined;
  roundNumber?: number;
  className?: string;
  compact?: boolean;
}

export function CountdownBadge({ window, roundNumber, className = '', compact = false }: Props) {
  const countdown = useCountdown(window);

  if (countdown.status === 'none') return null;

  const config = {
    upcoming: {
      icon: <Clock size={compact ? 11 : 14} />,
      bg: 'bg-blue-900/30 border-blue-700/50',
      text: 'text-blue-300',
    },
    open: {
      icon: <Play size={compact ? 11 : 14} className="animate-pulse" />,
      bg: 'bg-green-900/30 border-green-700/50',
      text: 'text-green-300',
    },
    closing_soon: {
      icon: <AlertTriangle size={compact ? 11 : 14} />,
      bg: 'bg-amber-900/30 border-amber-700/50',
      text: 'text-amber-300',
    },
    closed: {
      icon: <XCircle size={compact ? 11 : 14} />,
      bg: 'bg-red-900/30 border-red-700/50',
      text: 'text-red-300',
    },
  }[countdown.status];

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.bg} ${config.text} text-xs font-medium ${className}`}>
      {config.icon}
      <span>
        {roundNumber ? `R${roundNumber}: ` : ''}
        {countdown.label}
      </span>
    </div>
  );
}
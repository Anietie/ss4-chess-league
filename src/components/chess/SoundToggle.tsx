'use client';
import { Volume2, VolumeX } from 'lucide-react';

interface Props {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}

export function SoundToggle({ enabled, onToggle, className = '' }: Props) {
  return (
    <button
      onClick={onToggle}
      title={enabled ? 'Mute sounds' : 'Unmute sounds'}
      className={`p-2 rounded-lg transition-colors ${
        enabled
          ? 'text-gold hover:text-gold/80 hover:bg-ink-800'
          : 'text-ink-500 hover:text-ink-300 hover:bg-ink-800'
      } ${className}`}
    >
      {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
    </button>
  );
}
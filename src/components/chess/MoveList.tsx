'use client';
import { useEffect, useRef } from 'react';

interface Props {
  moves: string[];           // san move array e.g. ['e4', 'e5', 'Nf3', ...]
  currentIndex: number;      // 0 = start position, 1 = after move 0
  onSelect?: (index: number) => void;
  showResult?: string;       // '1-0', '0-1', '0.5-0.5' etc.
}

export function MoveList({ moves, currentIndex, onSelect, showResult }: Props) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  const pairs: [string, string | undefined, number, number][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([moves[i], moves[i + 1], i + 1, i + 2]);
  }

  if (!moves.length) return (
    <div className="text-ink-500 text-xs italic text-center py-6">No moves yet.</div>
  );

  return (
    <div className="font-mono text-sm overflow-y-auto max-h-full no-scrollbar">
      <div className="grid grid-cols-[28px_1fr_1fr] gap-x-1">
        {pairs.map(([white, black, wIdx, bIdx]) => (
          <>
            <span key={`n-${wIdx}`} className="text-ink-500 py-0.5 text-right pr-1 select-none text-xs leading-6">
              {Math.ceil(wIdx / 1)}.
            </span>
            <button
              key={`w-${wIdx}`}
              ref={currentIndex === wIdx ? activeRef : null}
              onClick={() => onSelect?.(wIdx)}
              className={`text-left px-1.5 py-0.5 rounded leading-6 transition-colors
                ${currentIndex === wIdx ? 'bg-gold/25 text-gold font-bold' : 'text-chalk hover:bg-ink-700'}`}
            >
              {white}
            </button>
            <button
              key={`b-${bIdx}`}
              ref={currentIndex === bIdx ? activeRef : null}
              onClick={() => black && onSelect?.(bIdx)}
              disabled={!black}
              className={`text-left px-1.5 py-0.5 rounded leading-6 transition-colors
                ${currentIndex === bIdx ? 'bg-gold/25 text-gold font-bold' : 'text-chalk-700 hover:bg-ink-700'}
                ${!black ? 'opacity-0 pointer-events-none' : ''}`}
            >
              {black ?? ''}
            </button>
          </>
        ))}
      </div>
      {showResult && (
        <div className="text-center mt-3 pt-2 border-t border-ink-700">
          <span className="font-mono font-bold text-gold text-sm">{showResult}</span>
          <div className="text-xs text-ink-500 mt-0.5">
            {showResult === '1-0' ? 'White wins' : showResult === '0-1' ? 'Black wins' : showResult === '0.5-0.5' ? 'Draw' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
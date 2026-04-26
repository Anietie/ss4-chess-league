import Link from 'next/link';
import { formatRating } from '@/lib/utils';

interface StandingRow {
  player_id?: string;
  player?: { id: string; full_name: string; ss4_rating: number; rating_deviation: number; is_provisional?: boolean };
  points: number;
  wins: number;
  draws: number;
  losses: number;
  games_played: number;
}

interface Props {
  rows: StandingRow[];
  showPromotion?: boolean;
  showRelegation?: boolean;
}

export function StandingsTable({ rows, showPromotion, showRelegation }: Props) {
  if (!rows.length) return <div className="card p-8 text-center text-ink-400 text-sm">No standings data yet.</div>;

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink-400 border-b border-ink-700 bg-ink-900">
            <th className="px-3 py-3 text-left w-8">#</th>
            <th className="px-3 py-3 text-left">Player</th>
            <th className="px-3 py-3 text-center">GP</th>
            <th className="px-3 py-3 text-center">W</th>
            <th className="px-3 py-3 text-center">D</th>
            <th className="px-3 py-3 text-center">L</th>
            <th className="px-3 py-3 text-center font-bold text-chalk">Pts</th>
            <th className="px-3 py-3 text-right hidden md:table-cell">Rating</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isPromotion = showPromotion && i < 2;
            const isRelegation = showRelegation && i >= rows.length - 2;
            const p = row.player;
            return (
              <tr
                key={p?.id ?? i}
                className={[
                  'border-b border-ink-700/50 transition-colors hover:bg-ink-700/50',
                  isPromotion ? 'bg-green-900/10' : '',
                  isRelegation ? 'bg-red-900/10' : '',
                ].join(' ')}
              >
                <td className="px-3 py-3 text-ink-500 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {isPromotion && <span className="text-green-400 text-xs">↑</span>}
                    {isRelegation && <span className="text-red-400 text-xs">↓</span>}
                    <span>{i + 1}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {p ? (
                    <Link href={`/profile/${p.id}`} className="font-medium text-chalk hover:text-gold transition-colors">
                      {p.full_name}
                    </Link>
                  ) : <span className="text-ink-400">Unknown</span>}
                </td>
                <td className="px-3 py-3 text-center text-ink-400">{row.games_played}</td>
                <td className="px-3 py-3 text-center text-green-400">{row.wins}</td>
                <td className="px-3 py-3 text-center text-ink-300">{row.draws}</td>
                <td className="px-3 py-3 text-center text-red-400">{row.losses}</td>
                <td className="px-3 py-3 text-center font-bold text-gold">{row.points}</td>
                <td className="px-3 py-3 text-right font-mono text-ink-300 hidden md:table-cell">
                  {p ? formatRating(p.ss4_rating, p.rating_deviation) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(showPromotion || showRelegation) && (
        <div className="px-4 py-2 bg-ink-900 border-t border-ink-700 flex gap-4 text-xs text-ink-500">
          {showPromotion && <span className="flex items-center gap-1"><span className="text-green-400">↑</span> Promotion zone</span>}
          {showRelegation && <span className="flex items-center gap-1"><span className="text-red-400">↓</span> Relegation zone</span>}
        </div>
      )}
    </div>
  );
}
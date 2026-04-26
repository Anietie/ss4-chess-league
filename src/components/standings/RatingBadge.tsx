import { formatRating } from '@/lib/utils';

interface Props {
  rating: number;
  rd: number;
  league?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function RatingBadge({ rating, rd, league, size = 'md' }: Props) {
  const provisional = rd > 100;
  const leagueColour = league === 'league_1'
    ? 'text-gold' : league === 'league_2'
    ? 'text-silver' : league === 'champions_league'
    ? 'text-star' : 'text-ink-300';
  const sizeClass = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-2xl' : 'text-sm';

  return (
    <span className={`font-mono font-bold tabular-nums ${sizeClass} ${leagueColour}`}
      title={provisional ? `Provisional rating (RD: ${Math.round(rd)})` : `Established rating (RD: ${Math.round(rd)})`}>
      {formatRating(rating, rd)}
    </span>
  );
}
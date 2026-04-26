import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Shows rating with ? suffix if provisional (RD > 100) */
export function formatRating(rating: number, rd: number): string {
  return rd > 100 ? `${Math.round(rating)}?` : `${Math.round(rating)}`;
}

/** League display name */
export function leagueName(league: string): string {
  const map: Record<string, string> = {
    league_1: 'League 1',
    league_2: 'League 2',
    league_3: 'League 3',
    champions_league: 'Champions League',
    continental_shield: 'Continental Shield',
    open_cup: 'Open Cup',
    blitz: 'Blitz Invitational',
    newcomer_shield: 'Newcomer Shield',
  };
  return map[league] ?? league;
}

/** League colours for Tailwind classes */
export function leagueColour(league: string): { primary: string; accent: string } {
  if (league === 'league_1') return { primary: 'navy', accent: 'gold' };
  if (league === 'league_2') return { primary: 'red', accent: 'silver' };
  return { primary: 'gray', accent: 'white' };
}

/** Result display: '1-0' → 'White wins', etc. */
export function formatResult(result: string): string {
  const map: Record<string, string> = {
    '1-0': '1 – 0',
    '0-1': '0 – 1',
    '0.5-0.5': '½ – ½',
    forfeit_white: 'Forfeit (White)',
    forfeit_both: 'Double Forfeit',
    '*': 'In Progress',
  };
  return map[result] ?? result;
}

/** Points for a result from one player's perspective */
export function resultPoints(result: string, side: 'white' | 'black'): number {
  if (result === '0.5-0.5') return 1;
  if (result === '1-0') return side === 'white' ? 3 : 0;
  if (result === '0-1') return side === 'black' ? 3 : 0;
  return 0;
}

/** Season label: 1 → 'Season 1 (Apr–Jul 2026)' */
export function seasonLabel(seasonId: number): string {
  const labels: Record<number, string> = {
    1: 'Season 1 (Apr–Jul 2026)',
    2: 'Season 2 (Aug–Nov 2026)',
    3: 'Season 3 (Jan–Apr 2027)',
  };
  return labels[seasonId] ?? `Season ${seasonId}`;
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

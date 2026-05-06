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
    league_1: 'League 1', league_2: 'League 2', league_3: 'League 3', league_4: 'League 4',
    league_5: 'League 5', league_6: 'League 6', league_7: 'League 7', league_8: 'League 8',
    champions_league: 'Champions League',
    scel: 'SCEL',
    open_cup: 'SCEL', // Legacy
    continental_shield: 'Continental Shield',
    blitz: 'Blitz Invitational',
    newcomer_shield: 'Newcomer Shield',
    casual: 'Casual',
    calibration: 'Calibration',
    unassigned: 'Unassigned',
  };
  return map[league] ?? league.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** League pill CSS class */
export function leaguePillClass(league: string): string {
  const n = parseInt(league.replace('league_', ''));
  if (n === 1) return 'league-pill-l1';
  if (n === 2) return 'league-pill-l2';
  if (league === 'champions_league') return 'league-pill-cl';
  if (league === 'scel') return 'league-pill-scel';
  return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-ink-700 text-ink-300 border border-ink-600';
}

/** Competition phase display name */
export function phaseName(phase: string): string {
  const map: Record<string, string> = {
    league_phase: 'League Phase',
    // SCEL
    scel_round_128: 'SCEL Round of 128',
    scel_round_64: 'SCEL Round of 64',
    scel_round_32: 'SCEL Round of 32',
    scel_round_16: 'SCEL Round of 16',
    scel_quarterfinal: 'SCEL Quarter-Final',
    scel_semifinal: 'SCEL Semi-Final',
    scel_final: 'SCEL Final',
    // Champions League
    cl_group_stage: 'CL Group Stage',
    cl_round_of_32: 'CL Round of 32',
    cl_round_of_16: 'CL Round of 16',
    cl_quarterfinal: 'CL Quarter-Final',
    cl_semifinal: 'CL Semi-Final',
    cl_final: 'CL Final',
    // Other
    armageddon: 'Armageddon',
    calibration: 'Calibration',
    casual: 'Casual',
  };
  return map[phase] ?? phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Result display */
export function formatResult(result: string): string {
  const map: Record<string, string> = {
    '1-0': '1 – 0', '0-1': '0 – 1',
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

/** Season label */
export function seasonLabel(seasonId: number): string {
  return `Season ${seasonId}`;
}

/** Next power of 2 ≥ n */
export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
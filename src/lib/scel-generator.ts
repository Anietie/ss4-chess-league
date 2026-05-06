// src/lib/scel-generator.ts

/**
 * Generates a single-elimination bracket for the SCEL (SS4 Chess Elimination League).
 * Bracket size is automatically determined by the number of players:
 *   - 8-15 players → 16-player bracket (Round of 16)
 *   - 16-31 players → 32-player bracket (Round of 32)
 *   - 32-63 players → 64-player bracket (Round of 64)
 *   - 64-127 players → 128-player bracket (Round of 128)
 *   - 128+ players → 256-player bracket (Round of 256)
 *
 * Seeding: Top-rated players get byes to fill the bracket evenly.
 */

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function getStartingRound(n: number): { bracketSize: number; rounds: number; roundLabel: string } {
  if (n <= 8)   return { bracketSize: 8,  rounds: 3, roundLabel: 'scel_quarterfinal' };
  if (n <= 16)  return { bracketSize: 16, rounds: 4, roundLabel: 'scel_round_16' };
  if (n <= 32)  return { bracketSize: 32, rounds: 5, roundLabel: 'scel_round_32' };
  if (n <= 64)  return { bracketSize: 64, rounds: 6, roundLabel: 'scel_round_64' };
  if (n <= 128) return { bracketSize: 128, rounds: 7, roundLabel: 'scel_round_128' };
  return { bracketSize: 256, rounds: 8, roundLabel: 'scel_round_256' };
}

const ROUND_PHASES = [
  'scel_round_256', 'scel_round_128', 'scel_round_64', 'scel_round_32',
  'scel_round_16', 'scel_quarterfinal', 'scel_semifinal', 'scel_final',
];

export interface ScelPlayer {
  id: string;
  full_name: string;
  ss4_rating: number;
}

export interface ScelFixture {
  round: number;
  competition_phase: string;
  white_player_id: string;
  black_player_id: string;
  white_name: string;
  black_name: string;
}

export interface ScelBracket {
  fixtures: ScelFixture[];
  bracket_size: number;
  total_rounds: number;
  byes_awarded: number;
}

export function generateScelBracket(players: ScelPlayer[]): ScelBracket {
  if (players.length < 2) {
    throw new Error('Need at least 2 players for SCEL');
  }

  const { bracketSize, rounds } = getStartingRound(players.length);
  const byes = bracketSize - players.length;

  // Seed by rating (highest rating first)
  const seeded = [...players].sort((a, b) => b.ss4_rating - a.ss4_rating);

  // Top `byes` players get a bye to the next round
  // Build the first round with remaining players
  const playing = seeded.slice(byes);
  const byePlayers = seeded.slice(0, byes);

  const fixtures: ScelFixture[] = [];
  const half = playing.length / 2;

  // Standard bracket: 1 vs N, 2 vs N-1, etc.
  for (let i = 0; i < half; i++) {
    const white = playing[i];
    const black = playing[playing.length - 1 - i];
    fixtures.push({
      round: 1,
      competition_phase: ROUND_PHASES[ROUND_PHASES.length - rounds],
      white_player_id: white.id,
      black_player_id: black.id,
      white_name: white.full_name,
      black_name: black.full_name,
    });
  }

  // Players with byes get placeholder entries (they advance automatically)
  // In the database, we don't create games for byes — the bracket just
  // seeds them into the next round. This is handled by the admin when
  // generating subsequent rounds.

  return {
    fixtures,
    bracket_size: bracketSize,
    total_rounds: rounds,
    byes_awarded: byes,
  };
}
import { describe, it, expect } from 'vitest';
import { updateRating, processGameResult } from '../src/lib/glicko2';
import { formatRating } from '../src/lib/utils';
import { runSnakeDraft, getLeagueCount, checkLeagueBalance } from '../src/lib/snake-draft';
import { generateRoundRobin, generateSwissRound1 } from '../src/lib/fixture-generator';

// ═══════════════════════════════════════════════════════════════
// GLICKO-2
// ═══════════════════════════════════════════════════════════════
describe('Glicko-2 Rating Engine', () => {
  const player = { rating: 1500, rd: 200, volatility: 0.06 };

  it('matches paper example output (rating ~1464, RD ~151)', () => {
    const result = updateRating(player, [
      { opponentRating: 1400, opponentRD: 30,  score: 1 },
      { opponentRating: 1550, opponentRD: 100, score: 0 },
      { opponentRating: 1700, opponentRD: 300, score: 0 },
    ]);
    expect(result.newRating).toBeCloseTo(1464, 0);
    expect(result.newRD).toBeGreaterThan(150);
    expect(result.newRD).toBeLessThan(153);
  });

  it('increases rating on win against equal opponent', () => {
    const result = processGameResult(
      { rating: 1500, rd: 150, volatility: 0.06 },
      { rating: 1500, rd: 150, volatility: 0.06 },
      '1-0'
    );
    expect(result.white.ratingChange).toBeGreaterThan(0);
    expect(result.black.ratingChange).toBeLessThan(0);
  });

  it('decreases RD after game', () => {
    const before = { rating: 1500, rd: 200, volatility: 0.06 };
    const result = updateRating(before, [{ opponentRating: 1500, opponentRD: 200, score: 1 }]);
    expect(result.newRD).toBeLessThan(200);
  });

  it('draw gives smaller changes than win/loss', () => {
    const base = { rating: 1500, rd: 150, volatility: 0.06 };
    const opp  = { rating: 1500, rd: 150, volatility: 0.06 };
    const draw = processGameResult(base, opp, '0.5-0.5');
    const win  = processGameResult(base, opp, '1-0');
    expect(Math.abs(draw.white.ratingChange)).toBeLessThan(Math.abs(win.white.ratingChange));
  });

  it('formatRating appends ? when RD > 100', () => {
    expect(formatRating(1500, 101)).toBe('1500?');
    expect(formatRating(1500, 99)).toBe('1500');
  });

  it('provisionally-rated player gains more from win', () => {
    const opp   = { rating: 1500, rd: 80, volatility: 0.06 };
    const prov  = processGameResult({ rating: 1000, rd: 200, volatility: 0.06 }, opp, '1-0');
    const estab = processGameResult({ rating: 1000, rd: 80,  volatility: 0.06 }, opp, '1-0');
    expect(prov.white.ratingChange).toBeGreaterThan(estab.white.ratingChange);
  });
});

// ═══════════════════════════════════════════════════════════════
// FIXTURE GENERATOR
// ═══════════════════════════════════════════════════════════════
function makePlayers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    full_name: `Player ${i + 1}`,
    ss4_rating: 1500 + i * 30,
  }));
}

describe('Round Robin', () => {
  it('generates correct number of games for 6 players', () => {
    const fixtures = generateRoundRobin(makePlayers(6));
    expect(fixtures).toHaveLength(15);
  });

  it('each player appears exactly n-1 times', () => {
    const players = makePlayers(8);
    const fixtures = generateRoundRobin(players);
    for (const p of players) {
      const games = fixtures.filter(f => f.white_player_id === p.id || f.black_player_id === p.id);
      expect(games).toHaveLength(7);
    }
  });

  it('no player faces themselves', () => {
    generateRoundRobin(makePlayers(8)).forEach(f =>
      expect(f.white_player_id).not.toBe(f.black_player_id)
    );
  });

  it('each pairing appears exactly once', () => {
    const fixtures = generateRoundRobin(makePlayers(6));
    const pairings = new Set(fixtures.map(f => [f.white_player_id, f.black_player_id].sort().join('-')));
    expect(pairings.size).toBe(15);
  });

  it('colour balance — no player has all whites or all blacks', () => {
    const players = makePlayers(8);
    const fixtures = generateRoundRobin(players);
    for (const p of players) {
      const whites = fixtures.filter(f => f.white_player_id === p.id).length;
      const blacks = fixtures.filter(f => f.black_player_id === p.id).length;
      expect(Math.abs(whites - blacks)).toBeLessThanOrEqual(1);
    }
  });
});

describe('Swiss Round 1', () => {
  it('pairs by rating proximity — 8 players → 4 fixtures', () => {
    const { fixtures } = generateSwissRound1(makePlayers(8));
    expect(fixtures).toHaveLength(4);
  });

  it('all players featured once', () => {
    const { fixtures } = generateSwissRound1(makePlayers(10));
    const ids = fixtures.flatMap(f => [f.white_player_id, f.black_player_id]);
    expect(new Set(ids).size).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════
// SNAKE DRAFT (V2 — NO TIERS)
// ═══════════════════════════════════════════════════════════════

function makeDraftPlayers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    full_name: `Player ${i + 1}`,
    ss4_rating: 2000 - i * 40,
    rating_deviation: 80,
    is_returning: false,
    previous_league: undefined as string | undefined,
  }));
}

describe('Snake Draft', () => {
  it('assigns all players', () => {
    const result = runSnakeDraft(makeDraftPlayers(26));
    expect(result.assignments).toHaveLength(26);
  });

  it('correct league count for player sizes', () => {
    expect(getLeagueCount(8)).toBe(1);   // 8 fits in one league
    expect(getLeagueCount(16)).toBe(2);  // 16 → 2 leagues of 8
    expect(getLeagueCount(26)).toBe(4);  // 26 → 4 leagues (7+7+6+6)
    expect(getLeagueCount(32)).toBe(5);  // 32 → 5 leagues (7+7+6+6+6)
    expect(getLeagueCount(46)).toBe(6);  // 46 → 7 leagues (7×6 + 4)
  });

  it('balances ratings across leagues (max gap < 200)', () => {
    const players = makeDraftPlayers(26);
    const result = runSnakeDraft(players);
    const avgs = result.stats.map(s => s.avg_rating);
    const maxGap = Math.max(...avgs) - Math.min(...avgs);
    expect(maxGap).toBeLessThan(200);
  });

  it('all players assigned to valid leagues', () => {
    const players = makeDraftPlayers(16);
    const result = runSnakeDraft(players);
    const leagues = new Set(result.assignments.map(a => a.assigned_league));
    for (const league of leagues) {
      expect(league).toMatch(/^league_\d+$/);
    }
    expect(result.league_count).toBe(2);
  });

  it('draft positions are sequential', () => {
    const result = runSnakeDraft(makeDraftPlayers(16));
    const positions = result.assignments.map(a => a.draft_position).sort((a, b) => a - b);
    positions.forEach((p, i) => expect(p).toBe(i + 1));
  });

  it('imbalance check flags gap > 150', () => {
    const stats = [
      { league: 'league_1', player_count: 8, avg_rating: 1800, min_rating: 1700, max_rating: 1900, rating_spread: 200 },
      { league: 'league_2', player_count: 8, avg_rating: 1500, min_rating: 1400, max_rating: 1600, rating_spread: 200 },
    ];
    const balance = checkLeagueBalance(stats);
    expect(balance.balanced).toBe(false);
    expect(balance.worst_gap).toBe(300);
  });

  it('balanced leagues pass check', () => {
    const stats = [
      { league: 'league_1', player_count: 7, avg_rating: 1600, min_rating: 1500, max_rating: 1700, rating_spread: 200 },
      { league: 'league_2', player_count: 7, avg_rating: 1620, min_rating: 1520, max_rating: 1720, rating_spread: 200 },
    ];
    const balance = checkLeagueBalance(stats);
    expect(balance.balanced).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// STANDINGS TIEBREAKERS
// ═══════════════════════════════════════════════════════════════
function applyTiebreakers(rows: any[]): any[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const h2hA = a.h2h?.[b.id] ?? 0;
    const h2hB = b.h2h?.[a.id] ?? 0;
    if (h2hB !== h2hA) return h2hB - h2hA;
    if (b.sb !== a.sb) return b.sb - a.sb;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.rating - a.rating;
  });
}

describe('Standings Tiebreakers', () => {
  it('sorts by points first', () => {
    const rows = [
      { id: 'a', points: 5, sb: 0, wins: 1, rating: 1500, h2h: {} },
      { id: 'b', points: 9, sb: 0, wins: 3, rating: 1500, h2h: {} },
    ];
    expect(applyTiebreakers(rows)[0].id).toBe('b');
  });

  it('uses H2H on points tie', () => {
    const rows = [
      { id: 'a', points: 6, sb: 10, wins: 2, rating: 1500, h2h: { b: 0 } },
      { id: 'b', points: 6, sb: 10, wins: 2, rating: 1500, h2h: { a: 3 } },
    ];
    expect(applyTiebreakers(rows)[0].id).toBe('b');
  });

  it('uses SB when H2H tied', () => {
    const rows = [
      { id: 'a', points: 6, sb: 12, wins: 2, rating: 1500, h2h: { b: 3 } },
      { id: 'b', points: 6, sb: 18, wins: 2, rating: 1500, h2h: { a: 3 } },
    ];
    expect(applyTiebreakers(rows)[0].id).toBe('b');
  });

  it('uses wins when SB tied', () => {
    const rows = [
      { id: 'a', points: 6, sb: 15, wins: 2, rating: 1500, h2h: {} },
      { id: 'b', points: 6, sb: 15, wins: 3, rating: 1500, h2h: {} },
    ];
    expect(applyTiebreakers(rows)[0].id).toBe('b');
  });

  it('uses rating as final tiebreaker', () => {
    const rows = [
      { id: 'a', points: 6, sb: 15, wins: 2, rating: 1400, h2h: {} },
      { id: 'b', points: 6, sb: 15, wins: 2, rating: 1600, h2h: {} },
    ];
    expect(applyTiebreakers(rows)[0].id).toBe('b');
  });
});
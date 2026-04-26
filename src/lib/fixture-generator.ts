/**
 * SS4 Chess League — Fixture Generator
 * Supports Round-Robin (Berger/circle method) and Swiss (Dutch system).
 */

export interface FixturePlayer { id: string; full_name: string; ss4_rating: number; }
export interface Fixture {
  round: number;
  white_player_id: string; black_player_id: string;
  white_name: string; black_name: string;
  day_offset: number; time_control: string;
}
export interface SwissStanding {
  player_id: string; points: number; buchholz: number; rating: number;
  opponents_faced: string[]; colors: ('white'|'black')[];
}

// ── ROUND-ROBIN (Circle / Berger method) ──────────────────────────────────
function rotate<T>(arr: T[], n: number): T[] {
  const p = n % arr.length;
  return [...arr.slice(p), ...arr.slice(0, p)];
}

export function generateRoundRobin(
  players: FixturePlayer[], startOffset = 0, daysPerRound = 2, timeControl = '600+5'
): Fixture[] {
  if (players.length < 2) return [];
  const ids = players.map(p => p.id);
  const sched = ids.length % 2 === 1 ? [...ids, 'BYE'] : [...ids];
  const numRounds = sched.length - 1;
  const colorBal: Record<string, number> = {};
  ids.forEach(id => colorBal[id] = 0);

  const fixtures: Fixture[] = [];

  for (let round = 0; round < numRounds; round++) {
    const rotated = [sched[0], ...rotate(sched.slice(1), round)];
    const half = rotated.length / 2;

    for (let i = 0; i < half; i++) {
      const p1 = rotated[i], p2 = rotated[rotated.length - 1 - i];
      if (p1 === 'BYE' || p2 === 'BYE') continue;

      // Assign colours to balance
      let white = p1, black = p2;
      if (colorBal[p1] > colorBal[p2]) { white = p2; black = p1; }
      else if (colorBal[p2] > colorBal[p1]) { white = p1; black = p2; }
      else { white = round % 2 === 0 ? p1 : p2; black = white === p1 ? p2 : p1; }

      colorBal[white]++;
      colorBal[black]--;

      const wp = players.find(p => p.id === white)!;
      const bp = players.find(p => p.id === black)!;
      fixtures.push({
        round: round + 1, white_player_id: white, black_player_id: black,
        white_name: wp.full_name, black_name: bp.full_name,
        day_offset: startOffset + round * daysPerRound, time_control: timeControl,
      });
    }
  }
  return fixtures;
}

// ── SWISS ─────────────────────────────────────────────────────────────────
export function generateSwissRound1(
  players: FixturePlayer[], dayOffset = 0, timeControl = '600+5'
): { fixtures: Fixture[]; standings: SwissStanding[] } {
  const sorted = [...players].sort((a, b) => b.ss4_rating - a.ss4_rating);
  const half = Math.floor(sorted.length / 2);
  const fixtures: Fixture[] = [];

  for (let i = 0; i < half; i++) {
    const w = sorted[i], b = sorted[half + i] || sorted[sorted.length - 1];
    if (!b || w.id === b.id) continue;
    fixtures.push({
      round: 1, white_player_id: w.id, black_player_id: b.id,
      white_name: w.full_name, black_name: b.full_name,
      day_offset: dayOffset, time_control: timeControl,
    });
  }

  const standings: SwissStanding[] = players.map(p => ({
    player_id: p.id, points: 0, buchholz: 0, rating: p.ss4_rating,
    opponents_faced: [], colors: [],
  }));
  return { fixtures, standings };
}

export function generateSwissNextRound(
  players: FixturePlayer[], standings: SwissStanding[],
  roundNum: number, dayOffset = 0, timeControl = '600+5'
): Fixture[] {
  const sorted = [...standings].sort((a, b) => b.points !== a.points ? b.points - a.points : b.rating - a.rating);
  const fixtures: Fixture[] = [];
  const paired = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const p1 = sorted[i];
    if (paired.has(p1.player_id)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const p2 = sorted[j];
      if (paired.has(p2.player_id) || p1.opponents_faced.includes(p2.player_id)) continue;

      const p1w = p1.colors.filter(c => c === 'white').length;
      const p2w = p2.colors.filter(c => c === 'white').length;
      const whiteId = p1w <= p2w ? p1.player_id : p2.player_id;
      const blackId = whiteId === p1.player_id ? p2.player_id : p1.player_id;

      const wp = players.find(p => p.id === whiteId)!;
      const bp = players.find(p => p.id === blackId)!;
      fixtures.push({
        round: roundNum, white_player_id: whiteId, black_player_id: blackId,
        white_name: wp.full_name, black_name: bp.full_name,
        day_offset: dayOffset, time_control: timeControl,
      });
      paired.add(p1.player_id); paired.add(p2.player_id);
      break;
    }
  }
  return fixtures;
}

// ── CHAMPIONS LEAGUE GROUP DRAW ───────────────────────────────────────────
export interface CLQualifier {
  player_id: string; full_name: string; from_league: string;
  domestic_finish: number; ss4_rating: number; seeding_pot: number;
}
export interface CLGroupDraw {
  groupA: string[]; groupB: string[]; fixtures: Fixture[];
}

function seededShuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  let seed = Date.now();
  for (let i = result.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(seed) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function drawCLGroups(qualifiers: CLQualifier[]): CLGroupDraw {
  const pot1 = qualifiers.filter(q => q.seeding_pot === 1);
  const rest = seededShuffle(qualifiers.filter(q => q.seeding_pot !== 1));

  const groupA: CLQualifier[] = pot1[0] ? [pot1[0]] : [];
  const groupB: CLQualifier[] = pot1[1] ? [pot1[1]] : [];

  for (const q of rest) {
    const aHas = groupA.some(p => p.from_league === q.from_league);
    const bHas = groupB.some(p => p.from_league === q.from_league);
    if (!aHas && groupA.length < 4)      groupA.push(q);
    else if (!bHas && groupB.length < 4)  groupB.push(q);
    else if (groupA.length < 4)           groupA.push(q);
    else                                   groupB.push(q);
  }

  const toFP = (arr: CLQualifier[]) => arr.map(q => ({ id: q.player_id, full_name: q.full_name, ss4_rating: q.ss4_rating }));
  const fixturesA = generateRoundRobin(toFP(groupA), 0, 2, '900+10');
  const fixturesB = generateRoundRobin(toFP(groupB), 0, 2, '900+10');

  return { groupA: groupA.map(q => q.player_id), groupB: groupB.map(q => q.player_id), fixtures: [...fixturesA, ...fixturesB] };
}

// ── TIME CONTROLS ─────────────────────────────────────────────────────────
export const TIME_CONTROLS: Record<string, string> = {
  premier_phase1: '600+5', development_phase1: '600+5',
  playoff: '900+10', cl_group: '900+10',
  cl_knockout: '1500+10', cl_final: '1800+15',
  continental_shield: '600+5', open_cup: '600+5',
  blitz: '180+2', armageddon_white: '300+0', armageddon_black: '240+0',
};

export function parseTimeControl(tc: string) {
  const [b, i] = tc.split('+').map(Number);
  return { base: (b || 600) * 1000, increment: (i || 0) * 1000 };
}

export function generateSingleElimination(players: { id: string; full_name: string; ss4_rating: number }[]) {
  const fixtures: any[] = [];
  let round = 1;
  let currentRound = [...players];
 
  // Pad to next power of 2 with byes
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(currentRound.length)));
  while (currentRound.length < nextPow2) currentRound.push(null as any); // null = bye
 
  while (currentRound.length > 1) {
    const nextRound: any[] = [];
    for (let i = 0; i < currentRound.length; i += 2) {
      const p1 = currentRound[i];
      const p2 = currentRound[i + 1];
      if (!p2) {
        // Bye — p1 advances automatically
        nextRound.push(p1);
        continue;
      }
      fixtures.push({
        round,
        white_player_id: p1.id,
        black_player_id: p2.id,
        white_name: p1.full_name,
        black_name: p2.full_name,
        day_offset: (round - 1) * 3,
      });
      nextRound.push(null); // winner TBD
    }
    currentRound = nextRound;
    round++;
  }
  return fixtures;
}
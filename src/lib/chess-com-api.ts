export interface SeedingResult {
  success: boolean;
  rapid_rating?: number;
  source: 'chess_com_api' | 'lichess_api' | 'bot_calibration' | 'default';
  error?: string;
}

export async function fetchChessComRating(username: string): Promise<SeedingResult> {
  try {
    const res = await fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}/stats`, {
      headers: { 'User-Agent': 'SS4 Chess League / admin@ss4chess.com' },
      next: { revalidate: 0 },
    });
    if (!res.ok) return { success: false, source: 'chess_com_api', error: `HTTP ${res.status}` };
    const data = await res.json();
    if (!data.chess_rapid?.last?.rating) return { success: false, source: 'chess_com_api', error: 'No rapid rating found' };
    return { success: true, rapid_rating: data.chess_rapid.last.rating, source: 'chess_com_api' };
  } catch (err) {
    return { success: false, source: 'chess_com_api', error: String(err) };
  }
}

export async function fetchLichessRating(username: string): Promise<SeedingResult> {
  try {
    const res = await fetch(`https://lichess.org/api/user/${username.toLowerCase()}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 },
    });
    if (!res.ok) return { success: false, source: 'lichess_api', error: `HTTP ${res.status}` };
    const data = await res.json();
    const rating = data.perfs?.rapid?.rating;
    if (!rating) return { success: false, source: 'lichess_api', error: 'No rapid rating on Lichess' };
    return { success: true, rapid_rating: rating, source: 'lichess_api' };
  } catch (err) {
    return { success: false, source: 'lichess_api', error: String(err) };
  }
}

export const BOT_LEVELS = [
  { level: 0,  elo: 600,  name: 'Kofi'      },  // friendly beginner, learns as he goes
  { level: 1,  elo: 800,  name: 'Amara'     },  // curious, makes bold but risky moves
  { level: 2,  elo: 950,  name: 'Tunde'     },  // street-smart, unpredictable openings
  { level: 3,  elo: 1100, name: 'Zara'      },  // sharp tactician, loves the attack
  { level: 4,  elo: 1250, name: 'Emeka'     },  // solid positional player, hard to crack
  { level: 5,  elo: 1400, name: 'Fatima'    },  // calculating, rarely blunders
  { level: 6,  elo: 1550, name: 'Kwame'     },  // aggressive, punishes mistakes fast
  { level: 7,  elo: 1700, name: 'Nadia'     },  // technical master, precise endgames
  { level: 8,  elo: 1850, name: 'Obinna'    },  // deep preparation, knows theory cold
  { level: 9,  elo: 2000, name: 'Sanaa'     },  // elite tactician, sees 10 moves ahead
  { level: 10, elo: 2200, name: 'The Oracle' }, // near-perfect play, almost unbeatable
];

export interface CalibrationGame {
  game_number: number;
  bot_level: number;
  bot_elo: number;
  result: 'win' | 'loss' | 'draw' | null;
}

export function getNextBotLevel(games: CalibrationGame[]): number {
  if (!games.length) return 3;
  const last = games[games.length - 1];
  if (last.result === 'win')  return Math.min(last.bot_level + 2, BOT_LEVELS.length - 1);
  if (last.result === 'loss') return Math.max(last.bot_level - 2, 0);
  return last.bot_level;
}

export function calculateCalibrationRating(games: CalibrationGame[]): number {
  if (games.length < 5) return 1000;
  const weights = [1, 1, 1, 2, 2];
  let wSum = 0, wTotal = 0;
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const w = weights[i] || 1;
    let adj = g.bot_elo;
    if (g.result === 'win')  adj += 150;
    if (g.result === 'loss') adj -= 150;
    wSum += adj * w;
    wTotal += w;
  }
  return Math.max(600, Math.min(Math.round(wSum / wTotal), 2400));
}
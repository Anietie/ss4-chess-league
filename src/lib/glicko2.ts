/**
 * SS4 Chess League — Glicko-2 Rating Engine
 * Based on Mark Glickman's 2013 paper: http://www.glicko.net/glicko/glicko2.pdf
 */

const CONVERSION_FACTOR = 173.7178;
const TAU = 0.5; // system constant — controls volatility change speed

export interface GlickoPlayer {
  rating: number;
  rd: number;
  volatility: number;
}
export interface GlickoResult {
  opponentRating: number;
  opponentRD: number;
  score: number; // 1=win, 0.5=draw, 0=loss
}
export interface GlickoUpdate {
  newRating: number;
  newRD: number;
  newVolatility: number;
  ratingChange: number;
  rdChange: number;
}

function toScale(r: number, rd: number) {
  return { mu: (r - 1500) / CONVERSION_FACTOR, phi: rd / CONVERSION_FACTOR };
}
function fromScale(mu: number, phi: number) {
  return { rating: CONVERSION_FACTOR * mu + 1500, rd: CONVERSION_FACTOR * phi };
}
function g(phi: number) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}
function E(mu: number, mu_j: number, phi_j: number) {
  return 1 / (1 + Math.exp(-g(phi_j) * (mu - mu_j)));
}

export function updateRating(player: GlickoPlayer, results: GlickoResult[]): GlickoUpdate {
  const { mu, phi } = toScale(player.rating, player.rd);
  const sigma = player.volatility;

  if (results.length === 0) {
    const phi_new = Math.min(Math.sqrt(phi * phi + sigma * sigma), 350 / CONVERSION_FACTOR);
    const { rating, rd } = fromScale(mu, phi_new);
    return { newRating: rating, newRD: rd, newVolatility: sigma, ratingChange: 0, rdChange: rd - player.rd };
  }

  const opponents = results.map(r => {
    const { mu: mu_j, phi: phi_j } = toScale(r.opponentRating, r.opponentRD);
    return { mu_j, phi_j, score: r.score };
  });

  let v_inv = 0, delta_sum = 0;
  for (const opp of opponents) {
    const g_phi = g(opp.phi_j);
    const e_val = E(mu, opp.mu_j, opp.phi_j);
    v_inv += g_phi * g_phi * e_val * (1 - e_val);
    delta_sum += g_phi * (opp.score - e_val);
  }
  const v = 1 / v_inv;
  const delta = v * delta_sum;

  // Illinois algorithm for new volatility
  const epsilon = 1e-6;
  const a = Math.log(sigma * sigma);
  const delta_sq = delta * delta, phi_sq = phi * phi;

  function f(x: number) {
    const ex = Math.exp(x);
    return ex * (delta_sq - phi_sq - v - ex) / (2 * (phi_sq + v + ex) ** 2) - (x - a) / (TAU * TAU);
  }

  let A = a;
  let B = delta_sq > phi_sq + v ? Math.log(delta_sq - phi_sq - v) : (() => {
    let k = 1; while (f(a - k * TAU) < 0) k++; return a - k * TAU;
  })();

  let fA = f(A), fB = f(B);
  while (Math.abs(B - A) > epsilon) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else { fA /= 2; }
    B = C; fB = fC;
  }

  const sigma_new = Math.exp(A / 2);
  const phi_star = Math.sqrt(phi * phi + sigma_new * sigma_new);
  const phi_new = 1 / Math.sqrt(1 / (phi_star * phi_star) + 1 / v);
  const mu_new = mu + phi_new * phi_new * delta_sum;
  const { rating: newRating, rd: newRD } = fromScale(mu_new, phi_new);

  return {
    newRating: Math.round(newRating * 10) / 10,
    newRD: Math.min(Math.round(newRD * 10) / 10, 350),
    newVolatility: Math.round(sigma_new * 1e6) / 1e6,
    ratingChange: Math.round((newRating - player.rating) * 10) / 10,
    rdChange: Math.round((newRD - player.rd) * 10) / 10,
  };
}

export function processGameResult(
  white: GlickoPlayer, black: GlickoPlayer, result: '1-0' | '0-1' | '0.5-0.5'
) {
  const ws = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5;
  const bs = 1 - ws;
  return {
    white: updateRating(white, [{ opponentRating: black.rating, opponentRD: black.rd, score: ws }]),
    black: updateRating(black, [{ opponentRating: white.rating, opponentRD: white.rd, score: bs }]),
  };
}

export function formatRating(rating: number, rd: number): string {
  return rd > 100 ? `${Math.round(rating)}?` : `${Math.round(rating)}`;
}

export function expectedScore(white: GlickoPlayer, black: GlickoPlayer): number {
  const { mu: mw, phi: pw } = toScale(white.rating, white.rd);
  const { mu: mb, phi: pb } = toScale(black.rating, black.rd);
  return E(mw, mb, pb);
}

export function performanceRating(games: { opponentRating: number; score: number }[]): number {
  if (!games.length) return 1000;
  const avg = games.reduce((s, g) => s + g.opponentRating, 0) / games.length;
  const rate = games.reduce((s, g) => s + g.score, 0) / games.length;
  const adj = rate === 1 ? 800 : rate === 0 ? -800 : -400 * Math.log(1 / rate - 1) / Math.log(10);
  return Math.round(avg + adj);
}

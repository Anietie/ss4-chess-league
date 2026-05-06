/**
 * stockfish-analysis.js
 *
 * Server-side Stockfish — two modes:
 *
 * 1. INCREMENTAL: One engine per active game. Analyses each position as moves
 *    are played. By game end, review data is ready — instant load, no client WASM.
 *
 * 2. BATCH fallback: For old games or if incremental failed.
 *
 * Both use depth 20 — deterministic, ~50-200ms per position on native Stockfish.
 */

'use strict';

const { Chess } = require('chess.js');
const Stockfish = require('stockfish');

const DEPTH   = 20;
const MULTIPV = 3;

// ── UCI engine wrapper ────────────────────────────────────────────────────────

class ServerStockfish {
  constructor() {
    this.engine  = null;
    this.ready   = false;
    this.pending = null;
    this.busy    = false;
  }

  async init() {
    return new Promise((resolve, reject) => {
      try {
        this.engine = Stockfish();
        const timeout = setTimeout(() => reject(new Error('uciok timeout')), 8000);
        this.engine.onmessage = (raw) => {
          const line = typeof raw === 'object' ? raw.data : raw;
          if (line === 'uciok') {
            clearTimeout(timeout);
            this.engine.onmessage = (r) => this._onLine(typeof r === 'object' ? r.data : r);
            this.ready = true;
            resolve();
          }
        };
        this.engine.onerror = reject;
        this.engine.postMessage('uci');
      } catch (err) { reject(err); }
    });
  }

  _onLine(line) {
    if (!this.pending) return;
    if (line.startsWith('info depth')) {
      this.pending.lines.push(line);
    } else if (line.startsWith('bestmove')) {
      const p = this.pending;
      this.pending = null;
      this.busy    = false;
      p.resolve({ lines: p.lines, bestmoveLine: line });
    }
  }

  send(cmd) { this.engine?.postMessage(cmd); }

  evaluatePosition(fen) {
    return new Promise((resolve, reject) => {
      if (!this.ready) return reject(new Error('Engine not ready'));
      if (this.busy)   return reject(new Error('Engine busy'));
      this.busy = true;

      const timeout = setTimeout(() => {
        this.pending = null;
        this.busy    = false;
        reject(new Error(`Timeout: ${fen.slice(0, 40)}`));
      }, DEPTH * 500 + 8000);

      this.pending = {
        lines: [],
        resolve: (r) => { clearTimeout(timeout); resolve(r); },
        reject:  (e) => { clearTimeout(timeout); reject(e); },
      };

      this.send(`setoption name MultiPV value ${MULTIPV}`);
      this.send('ucinewgame');
      this.send(`position fen ${fen}`);
      this.send(`go depth ${DEPTH}`);
    });
  }

  terminate() {
    try { this.engine?.postMessage('quit'); } catch {}
    this.engine  = null;
    this.ready   = false;
    this.busy    = false;
    this.pending = null;
  }
}

// ── Parse UCI output ──────────────────────────────────────────────────────────

function parseLines(lines, bestmoveLine) {
  const topMoves = {};
  let bestScore = 0, bestMate = null;

  for (const line of lines) {
    const mpvM   = line.match(/multipv (\d+)/);
    const pvM    = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
    const scoreM = line.match(/score cp (-?\d+)/);
    const mateM  = line.match(/score mate (-?\d+)/);

    if (mpvM && pvM) topMoves[parseInt(mpvM[1])] = pvM[1];
    if (!mpvM || mpvM[1] === '1') {
      if (scoreM) { bestScore = parseInt(scoreM[1]); bestMate = null; }
      if (mateM)  { bestMate  = parseInt(mateM[1]);  bestScore = bestMate > 0 ? 30000 : -30000; }
    }
  }

  const fallback = bestmoveLine.split(' ')[1] ?? '';
  const bestMove = topMoves[1] ?? fallback;
  const top3     = [topMoves[1], topMoves[2], topMoves[3]].filter(Boolean);
  if (bestMove && !top3.includes(bestMove)) top3.unshift(bestMove);
  return { score: bestScore, mate: bestMate, bestMove, top3 };
}

function toWhitePerspective(score, fen) {
  return fen.split(' ')[1] === 'w' ? score : -score;
}

// ── Incremental engine pool (one per active game) ─────────────────────────────

const gameEngines = new Map(); // gameId → { sf, queue, results, processing }

async function _processQueue(entry) {
  if (entry.processing || entry.queue.length === 0) return;
  entry.processing = true;
  while (entry.queue.length > 0) {
    const { fen, ply, resolve } = entry.queue.shift();
    try {
      const { lines, bestmoveLine } = await entry.sf.evaluatePosition(fen);
      const parsed = parseLines(lines, bestmoveLine);
      const score  = toWhitePerspective(parsed.score, fen);
      const result = { ply, score, bestMove: parsed.bestMove, top3: parsed.top3 };
      entry.results[ply] = result;
      if (resolve) resolve(result);
    } catch (err) {
      console.warn(`[sf-incremental] ply ${ply} failed:`, err?.message);
      if (resolve) resolve(null);
    }
  }
  entry.processing = false;
}

async function initGameEngine(gameId) {
  if (gameEngines.has(gameId)) return;
  const sf    = new ServerStockfish();
  const entry = { sf, queue: [], results: {}, processing: false };
  gameEngines.set(gameId, entry);
  try {
    await sf.init();
    console.log(`[sf-incremental] Engine ready for game ${gameId}`);
    // Analyse starting position (ply 0)
    entry.queue.push({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ply: 0, resolve: null });
    _processQueue(entry);
  } catch (err) {
    console.error(`[sf-incremental] Engine init failed for ${gameId}:`, err?.message);
    gameEngines.delete(gameId);
  }
}

function queuePosition(gameId, fen, ply) {
  const entry = gameEngines.get(gameId);
  if (!entry) return Promise.resolve(null);
  return new Promise((resolve) => {
    entry.queue.push({ fen, ply, resolve });
    _processQueue(entry);
  });
}

async function flushGameAnalysis(gameId) {
  const entry = gameEngines.get(gameId);
  if (!entry) return [];

  // Wait for queue to drain (max 5 min)
  const deadline = Date.now() + 300_000;
  while ((entry.queue.length > 0 || entry.processing) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 250));
  }

  entry.sf.terminate();
  gameEngines.delete(gameId);

  const results = Object.values(entry.results).sort((a, b) => a.ply - b.ply);
  console.log(`[sf-incremental] ✓ Flushed game ${gameId}: ${results.length} positions`);
  return results;
}

function destroyGameEngine(gameId) {
  const entry = gameEngines.get(gameId);
  if (!entry) return;
  try { entry.sf.terminate(); } catch {}
  gameEngines.delete(gameId);
}

// ── Batch analysis (fallback for old games) ───────────────────────────────────

async function analyseGameServerSide(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const moves = chess.history();
  if (!moves.length) return [];

  const fens = [];
  const temp = new Chess();
  fens.push(temp.fen());
  for (const m of moves) { temp.move(m); fens.push(temp.fen()); }

  const sf = new ServerStockfish();
  try {
    await sf.init();
    console.log(`[sf-batch] Analysing ${fens.length} positions at depth ${DEPTH}`);
    const results = [];
    for (let i = 0; i < fens.length; i++) {
      const { lines, bestmoveLine } = await sf.evaluatePosition(fens[i]);
      const parsed = parseLines(lines, bestmoveLine);
      results.push({ ply: i, score: toWhitePerspective(parsed.score, fens[i]), bestMove: parsed.bestMove, top3: parsed.top3 });
      if (i > 0 && i % 10 === 0) console.log(`[sf-batch] ${i}/${fens.length} done`);
    }
    console.log(`[sf-batch] ✓ ${results.length} positions complete`);
    return results;
  } finally {
    sf.terminate();
  }
}

module.exports = { initGameEngine, queuePosition, flushGameAnalysis, destroyGameEngine, analyseGameServerSide };
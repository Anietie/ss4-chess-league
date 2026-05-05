/**
 * stockfish-analysis.js
 *
 * Server-side Stockfish analysis for anti-cheat pipeline.
 * Uses the `stockfish` npm package (UCI-compatible, runs in Node.js).
 *
 * Analysis is time-limited (`movetime`) not depth-limited:
 *   - movetime 1500ms per position
 *   - MultiPV 3 to capture top-3 candidate moves
 *   - A 60-move game (121 positions) takes ~3 minutes in the background
 *
 * All analysis runs asynchronously after a game ends — players have no
 * involvement and cannot tamper with the results.
 */

'use strict';

const { Chess }  = require('chess.js');
const stockfish = require('../public/stockfish.js');

const MOVETIME_MS = 1500;   // ms per position — strong enough for anti-cheat
const MULTIPV     = 3;      // top-3 candidate moves per position

// ── Low-level UCI wrapper ─────────────────────────────────────────────────────
// Creates a fresh Stockfish instance and exposes a Promise-based evaluate().
// Each instance is used for one game then discarded.

class ServerStockfish {
  constructor() {
    this.engine  = null;
    this.ready   = false;
    this.pending = null;   // { resolve, reject, id, lines }
  }

  async init() {
    return new Promise((resolve, reject) => {
      try {
        this.engine = Stockfish();
        this.engine.onmessage = (line) => this._onLine(
          typeof line === 'object' ? line.data : line
        );
        this.engine.onerror = reject;
        this.engine.postMessage('uci');
        this._waitUciOk(resolve, reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  _waitUciOk(resolve, reject) {
    const originalHandler = this.engine.onmessage;
    const timeout = setTimeout(() => reject(new Error('Stockfish uciok timeout')), 8000);
    this.engine.onmessage = (line) => {
      const msg = typeof line === 'object' ? line.data : line;
      if (msg === 'uciok') {
        clearTimeout(timeout);
        this.engine.onmessage = (l) => this._onLine(typeof l === 'object' ? l.data : l);
        this.ready = true;
        resolve();
      }
    };
  }

  _onLine(line) {
    if (!this.pending) return;
    const { lines } = this.pending;

    if (line.startsWith('info depth')) {
      lines.push(line);
    } else if (line.startsWith('bestmove')) {
      const p = this.pending;
      this.pending = null;
      p.resolve({ lines, bestmoveLine: line });
    }
  }

  send(cmd) { this.engine?.postMessage(cmd); }

  evaluatePosition(fen) {
    return new Promise((resolve, reject) => {
      if (!this.ready) return reject(new Error('Engine not ready'));
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error(`Stockfish timeout for FEN: ${fen}`));
      }, MOVETIME_MS + 5000);

      this.pending = {
        lines: [],
        resolve: (result) => { clearTimeout(timeout); resolve(result); },
        reject:  (err)    => { clearTimeout(timeout); reject(err); },
      };

      this.send(`setoption name MultiPV value ${MULTIPV}`);
      this.send('ucinewgame');
      this.send(`position fen ${fen}`);
      this.send(`go movetime ${MOVETIME_MS}`);
    });
  }

  terminate() {
    try { this.engine?.postMessage('quit'); } catch {}
    this.engine = null;
    this.ready  = false;
  }
}

// ── Parse UCI info lines into structured result ───────────────────────────────

function parseLines(lines, bestmoveLine) {
  // topMoves[1..3]: best first move for each PV at highest depth seen
  const topMoves = {};
  let bestScore = 0;
  let bestMate  = null;

  for (const line of lines) {
    const depthM  = line.match(/depth (\d+)/);
    const mpvM    = line.match(/multipv (\d+)/);
    const pvM     = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
    const scoreM  = line.match(/score cp (-?\d+)/);
    const mateM   = line.match(/score mate (-?\d+)/);

    if (!depthM) continue;

    if (mpvM && pvM) {
      const mpv = parseInt(mpvM[1]);
      topMoves[mpv] = pvM[1];
    }

    // Collect score from PV-1 only
    if (!mpvM || mpvM[1] === '1') {
      if (scoreM) { bestScore = parseInt(scoreM[1]); bestMate = null; }
      if (mateM)  { bestMate  = parseInt(mateM[1]);
                    bestScore = bestMate > 0 ? 30000 : -30000; }
    }
  }

  const fallback = bestmoveLine.split(' ')[1] ?? '';
  const bestMove = topMoves[1] ?? fallback;
  const top3 = [topMoves[1], topMoves[2], topMoves[3]].filter(Boolean);
  if (bestMove && !top3.includes(bestMove)) top3.unshift(bestMove);

  return { score: bestScore, mate: bestMate, bestMove, top3 };
}

// ── Main exported function ────────────────────────────────────────────────────
// Analyses all positions in a game PGN, returns analysis_json array.
// Score is ALWAYS from White's perspective.

async function analyseGameServerSide(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const moves = chess.history();
  if (!moves.length) return [];

  // Build FEN array: fen[0] = starting position, fen[n] = after move n
  const fens = [];
  const temp = new Chess();
  fens.push(temp.fen());
  for (const m of moves) { temp.move(m); fens.push(temp.fen()); }

  const sf = new ServerStockfish();

  try {
    await sf.init();
    console.log(`[stockfish-server] init OK — analysing ${fens.length} positions (${MOVETIME_MS}ms each)`);

    const results = [];
    for (let i = 0; i < fens.length; i++) {
      const fen = fens[i];
      const { lines, bestmoveLine } = await sf.evaluatePosition(fen);
      const parsed = parseLines(lines, bestmoveLine);

      // Convert score to White's perspective using FEN active-colour field
      const sideToMove = fen.split(' ')[1];   // 'w' or 'b'
      const score = sideToMove === 'w' ? parsed.score : -parsed.score;

      results.push({
        ply:      i,
        score,
        bestMove: parsed.bestMove,
        top3:     parsed.top3,
      });

      if (i > 0 && i % 10 === 0) {
        console.log(`[stockfish-server]   ${i}/${fens.length} positions done`);
      }
    }

    console.log(`[stockfish-server] ✓ Analysis complete — ${results.length} positions`);
    return results;

  } finally {
    sf.terminate();
  }
}

module.exports = { analyseGameServerSide };
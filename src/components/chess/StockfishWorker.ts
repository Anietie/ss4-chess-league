/**
 * StockfishWorker.ts
 * Wraps Stockfish 18 ASM (saved as /stockfish.js) in a Web Worker.
 *
 * Anti-cheat analysis uses:
 *   - depth 20  (≈ "genius" strength — accurate enough for correlation scoring)
 *   - MultiPV 3 (captures top-3 candidate moves per position)
 *
 * Usage:
 *   const sf = new StockfishWorker();
 *   await sf.init();
 *   const analysis = await sf.analyseGame(fens);   // returns top3 per ply
 *   sf.terminate();
 */

export interface EvalResult {
  score: number;       // centipawns (positive = white advantage)
  mate: number | null; // null if not a mate score
  bestMove: string;    // UCI move e.g. 'e2e4'
  depth: number;
}

export interface MultiPVResult extends EvalResult {
  top3: string[];      // top-3 UCI moves from MultiPV analysis
}

export interface AnalysisEntry {
  ply: number;
  score: number;       // centipawns from white's perspective
  bestMove: string;
  top3: string[];      // always populated — at least [bestMove]
}

export class StockfishWorker {
  private worker: Worker | null = null;
  private ready = false;
  private listeners: Map<string, (line: string) => void> = new Map();

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker('/stockfish.js');
        this.worker.onmessage = (e: MessageEvent) => {
          const line: string = e.data;
          if (line === 'uciok') {
            this.ready = true;
            resolve();
          }
          this.listeners.forEach(fn => fn(line));
        };
        this.worker.onerror = reject;
        this.worker.postMessage('uci');
        setTimeout(() => reject(new Error('Stockfish init timeout')), 5000);
      } catch (err) {
        reject(err);
      }
    });
  }

  private send(cmd: string) { this.worker?.postMessage(cmd); }

  // ── Single-best-move evaluation (MultiPV 1) ──────────────────────────────
  evaluate(fen: string, depth = 20): Promise<EvalResult> {
    return new Promise((resolve) => {
      let latestScore = 0, latestMate: number | null = null, latestDepth = 0;

      const id = `eval-${Date.now()}-${Math.random()}`;
      this.listeners.set(id, (line: string) => {
        if (line.startsWith('info depth')) {
          const depthMatch = line.match(/depth (\d+)/);
          const scoreMatch = line.match(/score cp (-?\d+)/);
          const mateMatch  = line.match(/score mate (-?\d+)/);
          if (depthMatch) latestDepth = parseInt(depthMatch[1]);
          if (scoreMatch) { latestScore = parseInt(scoreMatch[1]); latestMate = null; }
          if (mateMatch)  { latestMate  = parseInt(mateMatch[1]);  latestScore = latestMate > 0 ? 30000 : -30000; }
        }
        if (line.startsWith('bestmove')) {
          this.listeners.delete(id);
          const bestMove = line.split(' ')[1] ?? '';
          resolve({ score: latestScore, mate: latestMate, bestMove, depth: latestDepth });
        }
      });

      this.send('setoption name MultiPV value 1');
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  // ── Multi-PV evaluation — captures top-3 candidate moves ─────────────────
  //
  // Stockfish emits one "info … multipv N … pv <move> …" line per candidate
  // at each depth. We collect the first move of each PV at the deepest level
  // and return them as top3.
  evaluateMultiPV(fen: string, depth = 20, multiPV = 3): Promise<MultiPVResult> {
    return new Promise((resolve) => {
      // topMoves[1], [2], [3] hold the latest first-move for each PV line
      const topMoves: Record<number, string> = {};
      let latestScore = 0, latestMate: number | null = null, latestDepth = 0;

      const id = `eval-mpv-${Date.now()}-${Math.random()}`;
      this.listeners.set(id, (line: string) => {
        if (line.startsWith('info depth')) {
          const depthMatch  = line.match(/depth (\d+)/);
          const multipvMatch = line.match(/multipv (\d+)/);
          // The pv field lists moves space-separated; the first one is the candidate
          const pvMatch     = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
          const scoreMatch  = line.match(/score cp (-?\d+)/);
          const mateMatch   = line.match(/score mate (-?\d+)/);

          if (depthMatch) latestDepth = parseInt(depthMatch[1]);

          if (multipvMatch && pvMatch) {
            const mpv = parseInt(multipvMatch[1]);
            topMoves[mpv] = pvMatch[1];
          }

          // Score from multipv 1 only (that's the principal variation)
          if (!multipvMatch || multipvMatch[1] === '1') {
            if (scoreMatch) { latestScore = parseInt(scoreMatch[1]); latestMate = null; }
            if (mateMatch)  { latestMate  = parseInt(mateMatch[1]);  latestScore = latestMate > 0 ? 30000 : -30000; }
          }
        }

        if (line.startsWith('bestmove')) {
          this.listeners.delete(id);
          const fallback = line.split(' ')[1] ?? '';
          const bestMove = topMoves[1] ?? fallback;
          const top3 = ([topMoves[1], topMoves[2], topMoves[3]]
            .filter(Boolean) as string[]);
          // Always include at least bestMove
          if (!top3.includes(bestMove) && bestMove) top3.unshift(bestMove);
          resolve({ score: latestScore, mate: latestMate, bestMove, top3, depth: latestDepth });
        }
      });

      this.send(`setoption name MultiPV value ${multiPV}`);
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  // ── Full-game analysis — used by the anti-cheat pipeline ─────────────────
  //
  // Returns one entry per FEN (ply 0 = starting position, ply 1 = after move 1…).
  // Score is ALWAYS from White's perspective (positive = white winning).
  // We derive the sign from the FEN's active colour field — not from ply parity —
  // so the orientation is correct even after captures that don't change ply parity.
  //
  // depth 22 gives strong accuracy; chess.com uses 18–22 for cloud analysis.
  async analyseGame(fens: string[], depth = 22): Promise<AnalysisEntry[]> {
    const results: AnalysisEntry[] = [];

    for (let i = 0; i < fens.length; i++) {
      const r = await this.evaluateMultiPV(fens[i], depth, 3);
      // Determine whose turn it is from the FEN string ('w' or 'b' is field 2)
      const sideToMove = fens[i].split(' ')[1];
      // Stockfish reports score from the perspective of the side to move.
      // Convert to White's perspective:
      const score = sideToMove === 'w' ? r.score : -r.score;
      results.push({ ply: i, score, bestMove: r.bestMove, top3: r.top3 });
    }

    // Reset MultiPV to 1 so the worker can be reused for single-move eval
    this.send('setoption name MultiPV value 1');

    return results;
  }

  terminate() { this.worker?.terminate(); this.worker = null; this.ready = false; }
}
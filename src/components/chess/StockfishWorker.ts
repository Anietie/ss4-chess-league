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
  // Uses movetime (ms) not depth — predictable timing, still very strong.
  // 800ms → ~depth 18 on typical hardware. Good enough for review display.
  evaluate(fen: string, moveTimeMs = 800): Promise<EvalResult> {
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
      this.send(`go movetime ${moveTimeMs}`);
    });
  }

  // ── Multi-PV evaluation — captures top-3 candidate moves ─────────────────
  //
  // Stockfish emits one "info … multipv N … pv <move> …" line per candidate
  // ── Multi-PV evaluation — captures top-3 candidate moves ─────────────────
  // Uses movetime (ms) — NOT depth. Depth-based search is the reason review
  // took 1 minute per ply. movetime 800ms gives ~depth 18 on typical hardware
  // which is strong enough for review display and far faster.
  evaluateMultiPV(fen: string, moveTimeMs = 800, multiPV = 3): Promise<MultiPVResult> {
    return new Promise((resolve) => {
      const topMoves: Record<number, string> = {};
      let latestScore = 0, latestMate: number | null = null, latestDepth = 0;

      const id = `eval-mpv-${Date.now()}-${Math.random()}`;
      this.listeners.set(id, (line: string) => {
        if (line.startsWith('info depth')) {
          const depthMatch   = line.match(/depth (\d+)/);
          const multipvMatch = line.match(/multipv (\d+)/);
          const pvMatch      = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
          const scoreMatch   = line.match(/score cp (-?\d+)/);
          const mateMatch    = line.match(/score mate (-?\d+)/);

          if (depthMatch) latestDepth = parseInt(depthMatch[1]);
          if (multipvMatch && pvMatch) topMoves[parseInt(multipvMatch[1])] = pvMatch[1];
          if (!multipvMatch || multipvMatch[1] === '1') {
            if (scoreMatch) { latestScore = parseInt(scoreMatch[1]); latestMate = null; }
            if (mateMatch)  { latestMate  = parseInt(mateMatch[1]);  latestScore = latestMate > 0 ? 30000 : -30000; }
          }
        }
        if (line.startsWith('bestmove')) {
          this.listeners.delete(id);
          const fallback = line.split(' ')[1] ?? '';
          const bestMove = topMoves[1] ?? fallback;
          const top3 = ([topMoves[1], topMoves[2], topMoves[3]].filter(Boolean) as string[]);
          if (!top3.includes(bestMove) && bestMove) top3.unshift(bestMove);
          resolve({ score: latestScore, mate: latestMate, bestMove, top3, depth: latestDepth });
        }
      });

      this.send(`setoption name MultiPV value ${multiPV}`);
      this.send(`position fen ${fen}`);
      this.send(`go movetime ${moveTimeMs}`);   // movetime NOT depth
    });
  }

  // ── Full-game analysis for the review page ────────────────────────────────
  // Server handles anti-cheat independently. This method is only for review UX.
  // moveTimeMs 800ms × ~100 positions = ~80 seconds for a 40-move game.
  // Compare to depth 22: potentially 60+ minutes. movetime is the correct approach.
  async analyseGame(fens: string[], moveTimeMs = 800): Promise<AnalysisEntry[]> {
    const results: AnalysisEntry[] = [];
    for (let i = 0; i < fens.length; i++) {
      const r = await this.evaluateMultiPV(fens[i], moveTimeMs, 3);
      const sideToMove = fens[i].split(' ')[1];   // 'w' or 'b' from FEN
      const score = sideToMove === 'w' ? r.score : -r.score;  // always White's perspective
      results.push({ ply: i, score, bestMove: r.bestMove, top3: r.top3 });
    }
    this.send('setoption name MultiPV value 1');
    return results;
  }

  terminate() { this.worker?.terminate(); this.worker = null; this.ready = false; }
}
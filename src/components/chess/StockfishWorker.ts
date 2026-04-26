/**
 * StockfishWorker.ts
 * Wraps Stockfish 16 WASM in a Web Worker for non-blocking analysis.
 * Usage (from a component):
 *   const sf = new StockfishWorker();
 *   await sf.init();
 *   const { score, bestMove } = await sf.evaluate(fen, 18);
 *   sf.terminate();
 *
 * Stockfish WASM must be served from /stockfish/ in your public directory.
 * Download from: https://github.com/official-stockfish/Stockfish/releases
 * Files needed: stockfish-nnue-16.js, stockfish-nnue-16.wasm
 */

export interface EvalResult {
  score: number;      // centipawns (positive = white advantage)
  mate: number | null; // null if not a mate score
  bestMove: string;   // UCI move e.g. 'e2e4'
  depth: number;
}

export class StockfishWorker {
  private worker: Worker | null = null;
  private ready = false;
  private listeners: Map<string, (line: string) => void> = new Map();

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker('/stockfish/stockfish-nnue-16.js');
        this.worker.onmessage = (e: MessageEvent) => {
          const line: string = e.data;
          if (line === 'uciok') { this.ready = true; resolve(); }
          // Dispatch to active listener
          this.listeners.forEach(fn => fn(line));
        };
        this.worker.onerror = reject;
        this.worker.postMessage('uci');
        // Timeout after 5s
        setTimeout(() => reject(new Error('Stockfish init timeout')), 5000);
      } catch (err) {
        reject(err);
      }
    });
  }

  private send(cmd: string) { this.worker?.postMessage(cmd); }

  evaluate(fen: string, depth = 18): Promise<EvalResult> {
    return new Promise((resolve) => {
      let latestScore = 0, latestMate: number | null = null, latestDepth = 0;

      const id = `eval-${Date.now()}`;
      this.listeners.set(id, (line: string) => {
        if (line.startsWith('info depth')) {
          const depthMatch = line.match(/depth (\d+)/);
          const scoreMatch = line.match(/score cp (-?\d+)/);
          const mateMatch  = line.match(/score mate (-?\d+)/);
          if (depthMatch) latestDepth = parseInt(depthMatch[1]);
          if (scoreMatch) { latestScore = parseInt(scoreMatch[1]); latestMate = null; }
          if (mateMatch)  { latestMate = parseInt(mateMatch[1]); latestScore = latestMate > 0 ? 30000 : -30000; }
        }
        if (line.startsWith('bestmove')) {
          this.listeners.delete(id);
          const bestMove = line.split(' ')[1] ?? '';
          resolve({ score: latestScore, mate: latestMate, bestMove, depth: latestDepth });
        }
      });

      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  /** Analyse all positions in a game and return eval array */
  async analyseGame(fens: string[], depth = 16): Promise<{ ply: number; score: number; bestMove: string }[]> {
    const results = [];
    for (let i = 0; i < fens.length; i++) {
      const r = await this.evaluate(fens[i], depth);
      // Flip score for black's perspective
      const score = i % 2 === 0 ? r.score : -r.score;
      results.push({ ply: i, score, bestMove: r.bestMove });
    }
    return results;
  }

  terminate() { this.worker?.terminate(); this.worker = null; this.ready = false; }
}
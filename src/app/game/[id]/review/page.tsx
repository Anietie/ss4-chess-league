'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Chess } from 'chess.js';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Download, RotateCcw, ArrowLeft, Loader2,
} from 'lucide-react';

// react-chessboard exposes Square and Arrow from the root in v4+
// Fallback: define locally so the build never fails on version differences
type Square = `${'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'}${'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'}`;
type Arrow  = [Square, Square] | [Square, Square, string];

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvalPoint { ply: number; score: number; best_move?: string; bestMove?: string; }

type MoveClass = 'brilliant' | 'great' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'miss';

interface AnnotatedMove {
  san: string;
  fen: string;          // position AFTER this move
  fenBefore: string;    // position BEFORE this move
  ply: number;          // 1-indexed
  evalBefore: number | null;
  evalAfter: number | null;
  cpLoss: number | null;  // centipawn loss (always ≥ 0)
  classification: MoveClass;
  bestMove?: string;
}

// ─── Opening table (ECO subset — most common openings) ───────────────────────

const OPENINGS: { moves: string; name: string }[] = [
  { moves: 'e4 e5', name: "King's Pawn Game" },
  { moves: 'e4 e5 Nf3 Nc6 Bb5', name: 'Ruy Lopez' },
  { moves: 'e4 e5 Nf3 Nc6 Bc4', name: 'Italian Game' },
  { moves: 'e4 e5 Nf3 Nc6 d4', name: 'Scotch Game' },
  { moves: 'e4 e5 Nf3 f5', name: "King's Gambit" },
  { moves: 'e4 e5 Nf3 Nc6 f4', name: "King's Gambit" },
  { moves: 'e4 c5', name: 'Sicilian Defence' },
  { moves: 'e4 c5 Nf3 d6 d4', name: 'Sicilian — Open' },
  { moves: 'e4 c5 Nf3 Nc6 d4', name: 'Sicilian — Open' },
  { moves: 'e4 c5 Nc3', name: 'Sicilian — Closed' },
  { moves: 'e4 e6', name: 'French Defence' },
  { moves: 'e4 e6 d4 d5 Nc3', name: 'French — Classical' },
  { moves: 'e4 e6 d4 d5 e5', name: 'French — Advance' },
  { moves: 'e4 c6', name: 'Caro-Kann Defence' },
  { moves: 'e4 d5', name: 'Scandinavian Defence' },
  { moves: 'e4 g6', name: 'Modern Defence' },
  { moves: 'e4 d6', name: 'Pirc Defence' },
  { moves: 'd4 d5', name: "Queen's Pawn Game" },
  { moves: 'd4 d5 c4', name: "Queen's Gambit" },
  { moves: 'd4 d5 c4 e6', name: "Queen's Gambit Declined" },
  { moves: 'd4 d5 c4 c6', name: 'Slav Defence' },
  { moves: 'd4 d5 c4 dxc4', name: "Queen's Gambit Accepted" },
  { moves: 'd4 Nf6', name: "Indian Game" },
  { moves: 'd4 Nf6 c4 e6 Nf3 b6', name: "Queen's Indian" },
  { moves: 'd4 Nf6 c4 e6 Nc3 Bb4', name: 'Nimzo-Indian' },
  { moves: 'd4 Nf6 c4 g6', name: "King's Indian" },
  { moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4', name: "King's Indian — Classical" },
  { moves: 'd4 Nf6 c4 c5', name: 'Benoni Defence' },
  { moves: 'Nf3 Nf6 c4', name: "English Opening" },
  { moves: 'c4', name: 'English Opening' },
  { moves: 'Nf3', name: "Réti Opening" },
];

function detectOpening(moves: string[]): string {
  const joined = moves.slice(0, 10).join(' ');
  let best = '';
  for (const o of OPENINGS) {
    if (joined.startsWith(o.moves) && o.moves.length > best.length) best = o.name;
  }
  return best || 'Unknown Opening';
}

// ─── Move classification ──────────────────────────────────────────────────────

// Eval is in centipawns from White's perspective throughout.
// cpLoss = how many centipawns the SIDE THAT MOVED lost by playing this move.
function classifyMove(cpLoss: number | null, evalBefore: number | null, evalAfter: number | null): MoveClass {
  if (cpLoss === null) return 'good';
  // Mate detection: large absolute evals (>= 9000) indicate forced mate
  const mateSwing =
    (evalBefore !== null && Math.abs(evalBefore) >= 9000) ||
    (evalAfter  !== null && Math.abs(evalAfter)  >= 9000);

  if (mateSwing && cpLoss > 200) return 'blunder';
  if (cpLoss <= 0)    return 'best';
  if (cpLoss <= 20)   return 'good';
  if (cpLoss <= 60)   return 'inaccuracy';
  if (cpLoss <= 150)  return 'mistake';
  return 'blunder';
}

// chess.com accuracy formula
function cpLossToAccuracy(cpLoss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * cpLoss) - 3.1668));
}

function computeAccuracy(moves: AnnotatedMove[], color: 'w' | 'b'): number {
  const playerMoves = moves.filter((_, i) => color === 'w' ? i % 2 === 0 : i % 2 !== 0);
  const scored = playerMoves.filter(m => m.cpLoss !== null);
  if (!scored.length) return 0;
  const avg = scored.reduce((s, m) => s + cpLossToAccuracy(m.cpLoss!), 0) / scored.length;
  return Math.round(avg * 10) / 10;
}

// ─── Classification badge ──────────────────────────────────────────────────────

const CLASS_CONFIG: Record<MoveClass, { label: string; symbol: string; color: string; bg: string }> = {
  brilliant:  { label: 'Brilliant',  symbol: '!!', color: '#22d3ee', bg: 'rgba(34,211,238,0.15)' },
  great:      { label: 'Great',      symbol: '!',  color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  best:       { label: 'Best',       symbol: '✓',  color: '#4ade80', bg: 'rgba(74,222,128,0.15)' },
  good:       { label: 'Good',       symbol: '',   color: '#94a3b8', bg: 'transparent' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#facc15', bg: 'rgba(250,204,21,0.15)' },
  mistake:    { label: 'Mistake',    symbol: '?',  color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  blunder:    { label: 'Blunder',    symbol: '??', color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
  miss:       { label: 'Miss',       symbol: '□',  color: '#c084fc', bg: 'rgba(192,132,252,0.15)' },
};

function ClassBadge({ cls, size = 'sm' }: { cls: MoveClass; size?: 'sm' | 'xs' }) {
  const c = CLASS_CONFIG[cls];
  if (!c.symbol) return null;
  return (
    <span
      className={`inline-flex items-center justify-center rounded font-mono font-bold ${size === 'xs' ? 'text-[10px] px-1 py-0' : 'text-xs px-1.5 py-0.5'}`}
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.color}40` }}
    >
      {c.symbol}
    </span>
  );
}

// ─── Eval graph ───────────────────────────────────────────────────────────────

function EvalGraph({ evals, curIdx, onSeek }: { evals: EvalPoint[]; curIdx: number; onSeek: (ply: number) => void }) {
  if (!evals.length) return null;
  const W = 600; const H = 80;
  const clamp = (v: number) => Math.max(-800, Math.min(800, v));
  const toY = (v: number) => H / 2 - (clamp(v) / 800) * (H / 2 - 4);
  const totalPlies = evals.length;
  const toX = (i: number) => (i / Math.max(totalPlies - 1, 1)) * W;

  const whitePoints: string[] = [];
  const blackPoints: string[] = [];

  evals.forEach((e, i) => {
    const x = toX(i); const y = toY(e.score);
    whitePoints.push(`${x},${y}`);
    blackPoints.push(`${x},${H / 2}`);
  });

  const whitePath = `M ${whitePoints.join(' L ')} L ${W},${H / 2} L 0,${H / 2} Z`;
  const blackPath = `M ${whitePoints.join(' L ')} L ${W},0 L 0,0 Z`;

  const curX = curIdx < totalPlies ? toX(curIdx) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`} className="w-full cursor-pointer select-none"
      style={{ height: 56 }}
      onClick={(e) => {
        const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        const ply = Math.round(pct * (totalPlies - 1));
        onSeek(Math.max(0, Math.min(totalPlies - 1, ply)));
      }}
    >
      {/* Black wins region */}
      <path d={blackPath} fill="#1a1a2e" />
      {/* White wins region */}
      <path d={whitePath} fill="#e8e8e8" />
      {/* Midline */}
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#ffffff20" strokeWidth="1" />
      {/* Cursor */}
      {curX !== null && (
        <line x1={curX} y1={0} x2={curX} y2={H} stroke="#f59e0b" strokeWidth="2" opacity="0.9" />
      )}
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function GameReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [game, setGame] = useState<any>(null);
  const [annotated, setAnnotated] = useState<AnnotatedMove[]>([]);
  const [positions, setPositions] = useState<string[]>([]);  // fen[0] = start, fen[n] = after move n
  const [curIdx, setCurIdx] = useState(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [analysisReady, setAnalysisReady] = useState(false);
  const [loading, setLoading] = useState(true);
  // Stockfish progress state
  const [sfRunning, setSfRunning] = useState(false);
  const [sfProgress, setSfProgress] = useState(0);  // 0–100
  const [sfTotal, setSfTotal] = useState(0);
  const moveListRef = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);

  // ── Run Stockfish depth-22 analysis client-side ──────────────────────────
  // Called after game loads. Runs full MultiPV-3 depth-22 analysis,
  // then POSTs to /api/games/[id]/anticheat to save (overwrites fallback PST data).
  const runStockfishAnalysis = useCallback(async (fens: string[], gameId: string) => {
    if (typeof window === 'undefined') return;
    setSfRunning(true);
    setSfProgress(0);
    setSfTotal(fens.length);

    try {
      const { StockfishWorker } = await import('@/components/chess/StockfishWorker');
      const sf = new StockfishWorker();
      await sf.init();

      const results: EvalPoint[] = [];
      for (let i = 0; i < fens.length; i++) {
        // Depth 22: highest practical depth — chess.com uses 18-22 for cloud analysis.
        // MultiPV 3 captures top-3 candidates for anti-cheat correlation scoring.
        // 800ms per position: 100 positions ≈ 80 seconds. Previously depth 22 = 60+ min.
        const r = await sf.evaluateMultiPV(fens[i], 3000, 3);
        // Score is always from white's perspective
        const score = i % 2 === 0 ? r.score : -r.score;
        results.push({ ply: i, score, best_move: r.bestMove });
        setSfProgress(Math.round(((i + 1) / fens.length) * 100));
      }
      sf.terminate();

      // Save to DB via anticheat API (overwrites fallback PST data)
      // The anticheat API expects { ply, score, bestMove, top3 } with camelCase bestMove
      const anticheatPayload = results.map(r => ({
        ply: r.ply,
        score: r.score,
        bestMove: r.best_move ?? '',
        top3: r.best_move ? [r.best_move] : [],
      }));
      await fetch(`/api/games/${gameId}/anticheat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_json: anticheatPayload }),
      }).catch(() => null);

      // Update local state with the fresh high-quality analysis
      setGame((g: any) => g ? { ...g, analysis_json: results } : g);
      setAnalysisReady(true);
      processEvalData(results);
    } catch (err) {
      console.error('[review] Stockfish analysis failed:', err);
    } finally {
      setSfRunning(false);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build annotated moves from eval data ─────────────────────────────────
  const processEvalData = useCallback((evalData: EvalPoint[]) => {
    setAnnotated(prev => {
      // prev has sans/fens already; we just enrich with eval
      return prev.map(m => {
        const epBefore = evalData.find(e => e.ply === m.ply - 1)?.score ?? null;
        const epAfter  = evalData.find(e => e.ply === m.ply)?.score ?? null;
        let cpLoss: number | null = null;
        if (epBefore !== null && epAfter !== null) {
          cpLoss = m.ply % 2 === 1
            ? Math.max(0, epBefore - epAfter)
            : Math.max(0, epAfter - epBefore);
        }
        const ev = evalData.find(e => e.ply === m.ply - 1);
        return {
          ...m,
          evalBefore: epBefore, evalAfter: epAfter, cpLoss,
          classification: classifyMove(cpLoss, epBefore, epAfter),
          bestMove: ev?.best_move ?? ev?.bestMove,
        };
      });
    });
  }, []);

  const processGame = useCallback((g: any) => {
    if (!g?.pgn) return;

    const chess = new Chess();
    try { chess.loadPgn(g.pgn); } catch { return; }
    const moves = chess.history();
    if (!moves.length) return;

    // Rebuild per-ply positions
    const temp = new Chess();
    const fens: string[] = [temp.fen()];
    for (const m of moves) { temp.move(m); fens.push(temp.fen()); }
    setPositions(fens);

    // Build annotated moves skeleton (evals filled in below)
    const evalData: EvalPoint[] = (g.analysis_json ?? []).map((e: any) => ({
      ply: e.ply,
      score: e.score,
      // Handle both camelCase (StockfishWorker / anticheat API) and
      // snake_case (legacy server queueAnalysis) field names
      best_move: e.bestMove ?? e.best_move ?? '',
    }));

    const evalMap = new Map<number, EvalPoint>(evalData.map(e => [e.ply, e]));
    const hasRealAnalysis = evalData.length > 0;
    setAnalysisReady(hasRealAnalysis);

    const temp2 = new Chess();
    const annots: AnnotatedMove[] = moves.map((san, i) => {
      const ply = i + 1;
      const fenBefore = temp2.fen();
      temp2.move(san);
      const fenAfter = temp2.fen();

      const epBefore = evalMap.get(ply - 1)?.score ?? null;
      const epAfter  = evalMap.get(ply)?.score ?? null;

      let cpLoss: number | null = null;
      if (epBefore !== null && epAfter !== null) {
        cpLoss = ply % 2 === 1
          ? Math.max(0, epBefore - epAfter)
          : Math.max(0, epAfter - epBefore);
      }

      return {
        san, fen: fenAfter, fenBefore, ply,
        evalBefore: epBefore, evalAfter: epAfter,
        cpLoss, classification: classifyMove(cpLoss, epBefore, epAfter),
        bestMove: evalMap.get(ply - 1)?.best_move,
      };
    });

    setAnnotated(annots);
    setCurIdx(fens.length - 1);

    return { fens, hasRealAnalysis };
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const res = await fetch(`/api/games/${id}`).catch(() => null);
      if (!res?.ok) { setLoading(false); return; }
      const { game: g } = await res.json();
      setGame(g);
      const result = processGame(g);
      setLoading(false);

      if (!result) return;
      const { fens, hasRealAnalysis } = result;

      // Always run Stockfish depth-22 for the best possible analysis.
      // The server-side fallback (PST evaluator, depth-1) is intentionally
      // overwritten by this. Analysis is saved back to DB via anticheat API.
      runStockfishAnalysis(fens, id as string);
    };
    load();
  }, [id, processGame, runStockfishAnalysis]);

  // Scroll move list to keep current move visible — WITHOUT scrolling the page.
  // scrollIntoView() on the element scrolls the entire document on mobile.
  // Instead we manually adjust the container's scrollTop.
  useEffect(() => {
    const container = moveListRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-ply="${curIdx}"]`);
    if (!el) return;
    const elTop    = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const ctTop    = container.scrollTop;
    const ctBottom = ctTop + container.clientHeight;
    if (elTop < ctTop) {
      container.scrollTop = elTop - 8;
    } else if (elBottom > ctBottom) {
      container.scrollTop = elBottom - container.clientHeight + 8;
    }
  }, [curIdx]);

  // Show best-move arrow when analysis is ready
  useEffect(() => {
    if (!analysisReady || curIdx === 0) { setArrows([]); return; }
    const move = annotated[curIdx - 1];
    if (move?.bestMove && move.bestMove.length >= 4) {
      const from = move.bestMove.slice(0, 2) as Square;
      const to   = move.bestMove.slice(2, 4) as Square;
      setArrows([[from, to, '#f59e0b']]);
    } else {
      setArrows([]);
    }
  }, [curIdx, annotated, analysisReady]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  setCurIdx(p => Math.max(0, p - 1));
      if (e.key === 'ArrowRight') setCurIdx(p => Math.min(positions.length - 1, p + 1));
      if (e.key === 'ArrowUp')    setCurIdx(0);
      if (e.key === 'ArrowDown')  setCurIdx(positions.length - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [positions.length]);

  const currentFen = positions[curIdx] ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const curMove = curIdx > 0 ? annotated[curIdx - 1] : null;

  // Current eval for bar
  const rawEvals: EvalPoint[] = game?.analysis_json ?? [];
  const evalAtPly = rawEvals.find(e => e.ply === curIdx)?.score ?? null;
  // White's advantage as 0–100 percentage
  const clampedEval = evalAtPly !== null ? Math.max(-800, Math.min(800, evalAtPly)) : 0;
  const whiteAdvPct = evalAtPly !== null ? 50 + (clampedEval / 800) * 46 : 50;

  // Accuracy per player
  const whiteAccuracy = annotated.length ? computeAccuracy(annotated, 'w') : null;
  const blackAccuracy = annotated.length ? computeAccuracy(annotated, 'b') : null;

  // Move counts per classification per player
  const countCls = (color: 'w' | 'b', cls: MoveClass) =>
    annotated.filter((m, i) => (color === 'w' ? i % 2 === 0 : i % 2 !== 0) && m.classification === cls).length;

  // Opening
  const opening = annotated.length ? detectOpening(annotated.map(m => m.san)) : '';

  // Pairs of moves for display
  const pairs: AnnotatedMove[][] = [];
  for (let i = 0; i < annotated.length; i += 2)
    pairs.push([annotated[i], annotated[i + 1]].filter(Boolean) as AnnotatedMove[]);

  const downloadPgn = () => {
    if (!game?.pgn) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([game.pgn], { type: 'text/plain' }));
    a.download = `ss4-game-${id}.pgn`;
    a.click();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-ink-400" size={24} />
    </div>
  );

  if (!game) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-ink-400">Game not found.</p>
      <Link href="/" className="btn-ghost btn-sm">Go home</Link>
    </div>
  );

  const evalLabel = evalAtPly !== null
    ? (evalAtPly > 0 ? `+${(evalAtPly / 100).toFixed(1)}` : (evalAtPly / 100).toFixed(1))
    : '=';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        {/* Back button — goes to the play page for this game */}
        <Link
          href={`/play/${id}`}
          className="btn-ghost p-2 rounded-lg"
          title="Back to game"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-bold text-chalk truncate">
            {game.white_player?.full_name ?? 'White'}
            <span className="text-ink-500 mx-2">vs</span>
            {game.black_player?.full_name ?? 'Black'}
          </h1>
          <p className="text-xs text-ink-400 mt-0.5">
            {opening && <span className="text-gold mr-2">{opening}</span>}
            <span className="capitalize">{game.league?.replace(/_/g, ' ')}</span>
            {game.played_at && <span> · {game.played_at.slice(0, 10)}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={downloadPgn} className="btn-ghost btn-sm gap-1.5">
            <Download size={13} /> PGN
          </button>
          <button
            onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')}
            className="btn-ghost btn-sm gap-1.5"
          >
            <RotateCcw size={13} /> Flip
          </button>
        </div>
      </div>

      {/* ── Analysis progress banner ─────────────────────────────────────────── */}
      {sfRunning && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-ink-800 border border-ink-700 text-sm text-ink-300 space-y-2">
          <div className="flex items-center gap-2.5">
            <Loader2 size={14} className="animate-spin text-gold flex-shrink-0" />
            <span>Analysing game… {sfProgress}% ({Math.round(sfProgress * sfTotal / 100)}/{sfTotal} positions · ~{Math.round((sfTotal - Math.round(sfProgress * sfTotal / 100)) * 0.8 / 60)} min left)</span>
          </div>
          <div className="h-1 rounded-full bg-ink-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-gold transition-all duration-500"
              style={{ width: `${sfProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

        {/* ── LEFT: Board ─────────────────────────────────────────────────── */}
        <div className="space-y-2.5">

          {/* Vertical eval bar + board row */}
          <div className="flex gap-2.5 items-stretch">

            {/* Vertical eval bar */}
            <div className="flex flex-col w-4 rounded overflow-hidden border border-ink-700 flex-shrink-0 relative"
              style={{ background: '#0d1117' }}>
              {/* White section */}
              <div
                className="transition-all duration-300 bg-chalk"
                style={{ height: `${100 - whiteAdvPct}%` }}
              />
              {/* Black section fills the rest */}
            </div>

            {/* Board */}
            <div className="flex-1 board-wrapper touch-none select-none">
              <Chessboard
                position={currentFen}
                boardOrientation={orientation}
                arePiecesDraggable={false}
                customDarkSquareStyle={{ backgroundColor: '#4a6080' }}
                customLightSquareStyle={{ backgroundColor: '#b0bcce' }}
                animationDuration={150}
                customArrows={arrows}
              />
            </div>
          </div>

          {/* Eval label */}
          {analysisReady && (
            <div className="text-center text-xs font-mono text-ink-400">
              Eval: <span className={evalAtPly !== null && evalAtPly > 0 ? 'text-chalk' : evalAtPly !== null && evalAtPly < 0 ? 'text-ink-300' : 'text-ink-400'}>{evalLabel}</span>
              {curMove && curMove.classification !== 'good' && (
                <span className="ml-3">
                  <ClassBadge cls={curMove.classification} size="xs" />
                  <span className="ml-1.5" style={{ color: CLASS_CONFIG[curMove.classification].color }}>
                    {CLASS_CONFIG[curMove.classification].label}
                  </span>
                  {curMove.cpLoss !== null && curMove.cpLoss > 0 && (
                    <span className="text-ink-500 ml-1">({(curMove.cpLoss / 100).toFixed(2)} pawns)</span>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Nav controls — touch-action:none prevents mobile page scroll on tap */}
          <div className="flex items-center justify-center gap-1.5 touch-none select-none">
            <button
              onPointerDown={e => { e.preventDefault(); setCurIdx(0); }}
              onClick={() => setCurIdx(0)}
              disabled={curIdx === 0}
              className="btn-ghost p-2 disabled:opacity-30"
            ><ChevronsLeft size={15} /></button>
            <button
              onPointerDown={e => { e.preventDefault(); setCurIdx(p => Math.max(0, p - 1)); }}
              onClick={() => setCurIdx(p => Math.max(0, p - 1))}
              disabled={curIdx === 0}
              className="btn-ghost p-2 disabled:opacity-30"
            ><ChevronLeft size={15} /></button>
            <span className="text-xs text-ink-500 w-20 text-center tabular-nums">
              {curIdx > 0 ? `Move ${Math.ceil(curIdx / 2)} (${curIdx % 2 === 1 ? 'White' : 'Black'})` : 'Start'}
            </span>
            <button
              onPointerDown={e => { e.preventDefault(); setCurIdx(p => Math.min(positions.length - 1, p + 1)); }}
              onClick={() => setCurIdx(p => Math.min(positions.length - 1, p + 1))}
              disabled={curIdx >= positions.length - 1}
              className="btn-ghost p-2 disabled:opacity-30"
            ><ChevronRight size={15} /></button>
            <button
              onPointerDown={e => { e.preventDefault(); setCurIdx(positions.length - 1); }}
              onClick={() => setCurIdx(positions.length - 1)}
              disabled={curIdx >= positions.length - 1}
              className="btn-ghost p-2 disabled:opacity-30"
            ><ChevronsRight size={15} /></button>
          </div>
          <p className="text-center text-[11px] text-ink-600">← → arrow keys · ↑↓ jump to start/end · Click graph to seek</p>

          {/* Eval graph */}
          {analysisReady && rawEvals.length > 1 && (
            <div className="card p-2 rounded-xl overflow-hidden">
              <EvalGraph evals={rawEvals} curIdx={curIdx} onSeek={setCurIdx} />
            </div>
          )}
        </div>

        {/* ── RIGHT: Analysis panel ────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Player accuracy cards */}
          <div className="card p-4 space-y-3">
            {(
              [
                { side: 'White', player: game.white_player, before: game.white_rating_before, after: game.white_rating_after, acc: whiteAccuracy, color: 'w' as const },
                { side: 'Black', player: game.black_player, before: game.black_rating_before, after: game.black_rating_after, acc: blackAccuracy, color: 'b' as const },
              ] as const
            ).map(({ side, player, before, after, acc, color }) => (
              <div key={side}>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="text-[10px] text-ink-500 uppercase tracking-widest">{side}</span>
                    <div className="text-sm font-semibold text-chalk">{player?.full_name ?? side}</div>
                  </div>
                  <div className="text-right">
                    {before != null && (
                      <div className="text-xs font-mono text-gold">{Math.round(before)}{after != null && (
                        <span className={after - before >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {' '}{after - before >= 0 ? '+' : ''}{Math.round(after - before)}
                        </span>
                      )}</div>
                    )}
                    {acc !== null && analysisReady && (
                      <div className="text-[11px] text-ink-400">{acc}% accuracy</div>
                    )}
                  </div>
                </div>

                {/* Accuracy bar */}
                {acc !== null && analysisReady && (
                  <div className="h-1.5 rounded-full bg-ink-700 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${acc}%`,
                        background: acc >= 85 ? '#4ade80' : acc >= 70 ? '#facc15' : acc >= 50 ? '#f97316' : '#f87171',
                      }}
                    />
                  </div>
                )}

                {/* Classification breakdown */}
                {analysisReady && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(['blunder', 'mistake', 'inaccuracy', 'best', 'good'] as MoveClass[]).map(cls => {
                      const n = countCls(color, cls);
                      if (!n && (cls === 'blunder' || cls === 'mistake' || cls === 'inaccuracy')) return null;
                      if (!n) return null;
                      const cfg = CLASS_CONFIG[cls];
                      return (
                        <span key={cls}
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30` }}
                        >
                          {n} {cfg.label}{n !== 1 ? 's' : ''}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Result */}
          <div className="card p-3 flex items-center justify-between">
            <span className="text-xs text-ink-400">
              {game.result === '1-0' ? 'White wins' : game.result === '0-1' ? 'Black wins' : game.result === '0.5-0.5' ? 'Draw' : '—'}
            </span>
            <span className="font-mono font-bold text-gold text-lg">{game.result}</span>
          </div>

          {/* Move list */}
          <div className="card p-3">
            <div className="section-label mb-2.5">Moves</div>
            <div
              ref={moveListRef}
              className="max-h-96 overflow-y-auto space-y-0.5 pr-1 no-scrollbar text-sm font-mono"
            >
              {pairs.map((pair, pairIdx) => (
                <div key={pairIdx} className="flex gap-1 items-center">
                  <span className="text-ink-600 w-7 flex-shrink-0 text-xs">{pairIdx + 1}.</span>
                  {pair.map((m) => {
                    const isActive = curIdx === m.ply;
                    const cfg = CLASS_CONFIG[m.classification];
                    return (
                      <button
                        key={m.ply}
                        data-ply={m.ply}
                        onClick={() => setCurIdx(m.ply)}
                        className="flex-1 text-left flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
                        style={isActive ? { background: 'rgba(245,158,11,0.2)', color: '#f59e0b' } : {}}
                      >
                        <span className={isActive ? 'text-gold' : 'text-chalk-700 hover:text-chalk'}>
                          {m.san}
                        </span>
                        {analysisReady && m.classification !== 'good' && cfg.symbol && (
                          <span className="text-[10px] font-bold flex-shrink-0" style={{ color: cfg.color }}>
                            {cfg.symbol}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {pair.length === 1 && <div className="flex-1" />}
                </div>
              ))}
              {!annotated.length && (
                <p className="text-ink-500 italic text-center py-6 text-xs">No moves recorded.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
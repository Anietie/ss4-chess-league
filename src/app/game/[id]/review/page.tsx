'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Chess } from 'chess.js';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, BarChart2 } from 'lucide-react';
import Link from 'next/link';

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false });

interface EvalPoint { ply: number; score: number; }

export default function GameReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<any>(null);
  const [chess] = useState(() => new Chess());
  const [positions, setPositions] = useState<string[]>([]);
  const [moveList, setMoveList] = useState<string[]>([]);
  const [curIdx, setCurIdx] = useState(0);
  const [evals, setEvals] = useState<EvalPoint[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    fetch(`/api/games/${id}`).then(r => r.json()).then(({ game: g }) => {
      if (!g) return;
      setGame(g);
      if (g.pgn) {
        chess.loadPgn(g.pgn);
        const moves = chess.history();
        const fens: string[] = [];
        const temp = new Chess();
        fens.push(temp.fen());
        for (const m of moves) { temp.move(m); fens.push(temp.fen()); }
        setPositions(fens);
        setMoveList(moves);
        setCurIdx(fens.length - 1);
        if (g.analysis_json) setEvals(g.analysis_json);
      }
    });

    // Keyboard navigation
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  setCurIdx(p => Math.max(0, p - 1));
      if (e.key === 'ArrowRight') setCurIdx(p => Math.min(positions.length - 1, p + 1));
      if (e.key === 'ArrowUp')    setCurIdx(0);
      if (e.key === 'ArrowDown')  setCurIdx(positions.length - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  const currentFen = positions[curIdx] ?? chess.fen();
  const pairs: [string, string?][] = [];
  for (let i = 0; i < moveList.length; i += 2) pairs.push([moveList[i], moveList[i + 1]]);

  const evalAtPly = (ply: number) => evals.find(e => e.ply === ply)?.score ?? null;
  const curEval = evalAtPly(curIdx);
  const evalPct = curEval !== null ? Math.max(0, Math.min(100, 50 + (curEval / 10))) : 50;

  const downloadPgn = () => {
    if (!game?.pgn) return;
    const blob = new Blob([game.pgn], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ss4-game-${id}.pgn`;
    a.click();
  };

  if (!game) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-ink-400">Loading game…</div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-bold text-chalk">
            {game.white_player?.full_name} <span className="text-ink-400">vs</span> {game.black_player?.full_name}
          </h1>
          <div className="text-sm text-ink-400 mt-1 capitalize">
            {game.league?.replace('_', ' ')} · {game.played_at?.slice(0, 10)} · {game.result}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadPgn} className="btn-ghost btn-sm gap-1.5"><Download size={13} /> PGN</button>
          <button onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')} className="btn-ghost btn-sm">Flip</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Board side */}
        <div className="space-y-3">
          {/* Eval bar */}
          {evals.length > 0 && (
            <div className="h-3 rounded-full overflow-hidden bg-ink-800 border border-ink-700 relative">
              <div className="h-full bg-chalk transition-all duration-300" style={{ width: `${evalPct}%` }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-mono font-bold mix-blend-difference text-white">
                  {curEval !== null ? (curEval > 0 ? `+${(curEval / 100).toFixed(1)}` : (curEval / 100).toFixed(1)) : '='}
                </span>
              </div>
            </div>
          )}

          <div className="board-wrapper">
            <Chessboard
              position={currentFen}
              boardOrientation={orientation}
              arePiecesDraggable={false}
              customDarkSquareStyle={{ backgroundColor: '#4a6080' }}
              customLightSquareStyle={{ backgroundColor: '#b0bcce' }}
              animationDuration={100}
            />
          </div>

          {/* Navigation controls */}
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => setCurIdx(0)} disabled={curIdx === 0} className="btn-ghost p-2 disabled:opacity-30"><ChevronsLeft size={16} /></button>
            <button onClick={() => setCurIdx(p => Math.max(0, p - 1))} disabled={curIdx === 0} className="btn-ghost p-2 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <span className="text-xs text-ink-400 w-20 text-center">Move {curIdx}/{moveList.length}</span>
            <button onClick={() => setCurIdx(p => Math.min(positions.length - 1, p + 1))} disabled={curIdx === positions.length - 1} className="btn-ghost p-2 disabled:opacity-30"><ChevronRight size={16} /></button>
            <button onClick={() => setCurIdx(positions.length - 1)} disabled={curIdx === positions.length - 1} className="btn-ghost p-2 disabled:opacity-30"><ChevronsRight size={16} /></button>
          </div>
          <p className="text-center text-xs text-ink-500">← → arrow keys also work</p>
        </div>

        {/* Move list side */}
        <div className="space-y-4">
          {/* Player cards */}
          <div className="card p-4 space-y-2">
            {[['♔ White', game.white_player, game.white_rating_before, game.white_rating_after],
              ['♚ Black', game.black_player, game.black_rating_before, game.black_rating_after]].map(([side, p, before, after]: any) => (
              <div key={side} className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-ink-400">{side}</span>
                  <div className="text-sm font-medium text-chalk">{p?.full_name}</div>
                </div>
                {before && <div className="text-right">
                  <div className="text-sm font-mono text-gold">{Math.round(before)}</div>
                  {after && <div className={`text-xs ${after - before >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {after - before >= 0 ? '+' : ''}{Math.round(after - before)}
                  </div>}
                </div>}
              </div>
            ))}
          </div>

          {/* Move list */}
          <div className="card p-4">
            <div className="section-label mb-3">Moves</div>
            <div className="max-h-80 overflow-y-auto font-mono text-sm space-y-0.5 no-scrollbar">
              {pairs.map(([w, b], i) => (
                <div key={i} className="flex gap-1">
                  <span className="text-ink-500 w-7 flex-shrink-0">{i + 1}.</span>
                  <button onClick={() => setCurIdx(i * 2 + 1)}
                    className={`flex-1 text-left px-1 rounded hover:bg-ink-700 ${curIdx === i * 2 + 1 ? 'bg-gold/20 text-gold' : 'text-chalk'}`}>
                    {w}
                  </button>
                  {b && <button onClick={() => setCurIdx(i * 2 + 2)}
                    className={`flex-1 text-left px-1 rounded hover:bg-ink-700 ${curIdx === i * 2 + 2 ? 'bg-gold/20 text-gold' : 'text-chalk-700'}`}>
                    {b}
                  </button>}
                </div>
              ))}
              {!moveList.length && <div className="text-ink-500 italic text-center py-4">No moves recorded.</div>}
            </div>
          </div>

          {/* Result */}
          <div className="card p-4 text-center">
            <div className="text-2xl font-mono font-bold text-gold">{game.result}</div>
            <div className="text-xs text-ink-400 mt-1">
              {game.result === '1-0' ? 'White wins' : game.result === '0-1' ? 'Black wins' : game.result === '0.5-0.5' ? 'Draw' : 'In progress'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
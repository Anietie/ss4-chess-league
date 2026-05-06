'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Chess } from 'chess.js';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, SkipBack, SkipForward, Download, BarChart2 } from 'lucide-react';
import { formatRating } from '@/lib/glicko2';
import { leagueDisplayName } from '@/lib/snake-draft';

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false });

export default function GameReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<any>(null);
  const [chess] = useState(() => new Chess());
  const [moves, setMoves] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [fens, setFens] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/games/${id}`).then(r => r.json()).then(d => {
      setGame(d.game);
      if (d.game?.pgn) {
        chess.loadPgn(d.game.pgn);
        const history = chess.history();
        setMoves(history);

        // Build FEN array: position after each move
        const fenList: string[] = [];
        const replay = new Chess();
        fenList.push(replay.fen()); // starting position
        for (const move of history) {
          replay.move(move);
          fenList.push(replay.fen());
        }
        setFens(fenList);
        setCursor(fenList.length - 1); // start at last position
      }
      setLoading(false);
    });
  }, [id]);

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, fens.length - 1));
    setCursor(clamped);
  }, [fens.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(cursor - 1);
      if (e.key === 'ArrowRight') goTo(cursor + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cursor, goTo]);

  const downloadPGN = () => {
    if (!game?.pgn) return;
    const blob = new Blob([game.pgn], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ss4-game-${id?.slice(0, 8)}.pgn`;
    a.click();
  };

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-ink-400 animate-pulse">Loading game…</div>;
  if (!game) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-ink-500">Game not found.</div>;

  const currentFen = fens[cursor] || new Chess().fen();
  const isWhiteWon = game.result === '1-0';
  const isBlackWon = game.result === '0-1';
  const isDraw = game.result === '0.5-0.5';

  const movePairs: [string, string?][] = [];
  for (let i = 0; i < moves.length; i += 2) movePairs.push([moves[i], moves[i + 1]]);

  const analysis = game.analysis_json;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-enter">

      {/* Back */}
      <Link href={`/players/${game.white_player_id}`} className="flex items-center gap-2 text-ink-400 hover:text-chalk text-sm mb-6 transition-colors w-fit">
        <ArrowLeft size={14} /> Back
      </Link>

      {/* Game header */}
      <div className="card p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* White */}
          <div className="flex-1 text-right">
            <Link href={`/players/${game.white_player_id}`} className={`font-display text-xl font-bold transition-colors ${isWhiteWon ? 'text-chalk hover:text-gold' : 'text-ink-400 hover:text-chalk'}`}>
              {game.white_player?.full_name}
            </Link>
            <div className="text-xs text-ink-500 mt-0.5 font-mono">
              {game.white_rating_before ? formatRating(game.white_rating_before, game.white_rd_before || 200) : '—'}
              {game.white_rating_after && game.white_rating_before && (
                <span className={`ml-2 ${game.white_rating_after > game.white_rating_before ? 'text-green-400' : 'text-red-400'}`}>
                  {game.white_rating_after > game.white_rating_before ? '+' : ''}{Math.round(game.white_rating_after - game.white_rating_before)}
                </span>
              )}
            </div>
            <div className="text-xs text-ink-600 mt-1">♔ White</div>
          </div>

          {/* Result */}
          <div className="text-center flex-shrink-0">
            <div className={`text-3xl font-mono font-black px-6 py-2 rounded-xl border ${
              isDraw ? 'bg-ink-700 border-ink-600 text-chalk' : 'bg-gold/15 border-gold/30 text-gold'
            }`}>
              {game.result === '0.5-0.5' ? '½-½' : game.result}
            </div>
            <div className="text-xs text-ink-500 mt-2">
              {leagueDisplayName(game.league)}
              {game.round ? ` · R${game.round}` : ''}
            </div>
            <div className="text-xs text-ink-600">
              {game.time_control} · {game.played_at ? new Date(game.played_at).toLocaleDateString() : ''}
            </div>
          </div>

          {/* Black */}
          <div className="flex-1">
            <Link href={`/players/${game.black_player_id}`} className={`font-display text-xl font-bold transition-colors ${isBlackWon ? 'text-chalk hover:text-gold' : 'text-ink-400 hover:text-chalk'}`}>
              {game.black_player?.full_name}
            </Link>
            <div className="text-xs text-ink-500 mt-0.5 font-mono">
              {game.black_rating_before ? formatRating(game.black_rating_before, game.black_rd_before || 200) : '—'}
              {game.black_rating_after && game.black_rating_before && (
                <span className={`ml-2 ${game.black_rating_after > game.black_rating_before ? 'text-green-400' : 'text-red-400'}`}>
                  {game.black_rating_after > game.black_rating_before ? '+' : ''}{Math.round(game.black_rating_after - game.black_rating_before)}
                </span>
              )}
            </div>
            <div className="text-xs text-ink-600 mt-1">♚ Black</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

        {/* Board + controls */}
        <div className="space-y-3">
          <div className="board-wrapper">
            {typeof window !== 'undefined' && (
              <Chessboard
                id="review"
                position={currentFen}
                arePiecesDraggable={false}
                customDarkSquareStyle={{ backgroundColor: '#4a6080' }}
                customLightSquareStyle={{ backgroundColor: '#b0bcce' }}
                animationDuration={100}
              />
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button onClick={() => goTo(0)} disabled={cursor === 0} className="btn-ghost p-2 disabled:opacity-30"><SkipBack size={16} /></button>
            <button onClick={() => goTo(cursor - 1)} disabled={cursor === 0} className="btn-ghost p-2 disabled:opacity-30"><ArrowLeft size={16} /></button>
            <div className="flex-1 text-center text-sm text-ink-400 font-mono">
              {cursor === 0 ? 'Start' : cursor === fens.length - 1 ? 'End' : `Move ${cursor}`}
            </div>
            <button onClick={() => goTo(cursor + 1)} disabled={cursor >= fens.length - 1} className="btn-ghost p-2 disabled:opacity-30"><ArrowRight size={16} /></button>
            <button onClick={() => goTo(fens.length - 1)} disabled={cursor >= fens.length - 1} className="btn-ghost p-2 disabled:opacity-30"><SkipForward size={16} /></button>
            <button onClick={downloadPGN} className="btn-ghost p-2 ml-2" title="Download PGN"><Download size={16} /></button>
          </div>

          <p className="text-xs text-ink-600 text-center">← → arrow keys to navigate moves</p>

          {/* Analysis if available */}
          {analysis && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={16} className="text-gold" />
                <h3 className="font-semibold text-chalk">Stockfish Analysis</h3>
                <span className="text-xs text-ink-500 ml-auto">Engine: Stockfish 16</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="section-label mb-2">White ♔</div>
                  <div className="space-y-1.5">
                    {[
                      ['Accuracy', `${analysis.accuracy_white?.toFixed(1)}%`],
                      ['Blunders', analysis.blunders_white],
                      ['Mistakes', analysis.mistakes_white],
                      ['Inaccuracies', analysis.inaccuracies_white],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="flex justify-between">
                        <span className="text-ink-400">{label}</span>
                        <span className="font-mono text-chalk">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="section-label mb-2">Black ♚</div>
                  <div className="space-y-1.5">
                    {[
                      ['Accuracy', `${analysis.accuracy_black?.toFixed(1)}%`],
                      ['Blunders', analysis.blunders_black],
                      ['Mistakes', analysis.mistakes_black],
                      ['Inaccuracies', analysis.inaccuracies_black],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="flex justify-between">
                        <span className="text-ink-400">{label}</span>
                        <span className="font-mono text-chalk">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Move list */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-700 flex items-center justify-between">
            <h3 className="font-semibold text-chalk">Moves</h3>
            <span className="text-xs text-ink-500 font-mono">{moves.length} moves</span>
          </div>
          <div className="p-3 max-h-[600px] overflow-y-auto font-mono text-sm">
            {movePairs.length === 0 ? (
              <div className="text-ink-500 text-center py-8 italic">No moves recorded</div>
            ) : (
              movePairs.map(([w, b], i) => {
                const wIdx = i * 2 + 1;
                const bIdx = i * 2 + 2;
                return (
                  <div key={i} className="flex items-center gap-1 py-0.5 hover:bg-ink-700/30 rounded px-1 -mx-1">
                    <span className="text-ink-600 w-8 text-right flex-shrink-0">{i + 1}.</span>
                    <button
                      onClick={() => goTo(wIdx)}
                      className={`flex-1 text-left px-1.5 py-0.5 rounded transition-colors ${cursor === wIdx ? 'bg-gold/20 text-gold font-bold' : 'text-chalk hover:bg-ink-700'}`}
                    >
                      {w}
                    </button>
                    {b && (
                      <button
                        onClick={() => goTo(bIdx)}
                        className={`flex-1 text-left px-1.5 py-0.5 rounded transition-colors ${cursor === bIdx ? 'bg-gold/20 text-gold font-bold' : 'text-chalk-700 hover:bg-ink-700'}`}
                      >
                        {b}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className="px-4 py-3 border-t border-ink-700 text-center font-mono text-sm">
            <span className={`font-bold ${isWhiteWon ? 'text-chalk' : isBlackWon ? 'text-chalk' : 'text-ink-400'}`}>
              {game.result === '0.5-0.5' ? '½-½' : game.result}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
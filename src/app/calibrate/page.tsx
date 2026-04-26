'use client';
import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Chess } from 'chess.js';
import { CheckCircle, ArrowRight, Bot } from 'lucide-react';
import Link from 'next/link';
import { BOT_LEVELS } from '@/lib/chess-com-api';

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false });

// Stockfish via web worker (public/stockfish.js must be included)
function useStockfish(level: number) {
  const [engine, setEngine] = useState<Worker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const worker = new Worker('/stockfish.js');
      worker.postMessage('uci');
      worker.postMessage(`setoption name Skill Level value ${Math.min(level * 2, 20)}`);
      worker.postMessage('ucinewgame');
      setEngine(worker);
      return () => worker.terminate();
    } catch { /* Stockfish not available in dev */ }
  }, [level]);

  const getBestMove = useCallback((fen: string): Promise<string> => {
    return new Promise(resolve => {
      if (!engine) { resolve(''); return; }
      engine.onmessage = (e: MessageEvent) => {
        const line = e.data as string;
        if (line.startsWith('bestmove')) {
          const move = line.split(' ')[1];
          resolve(move || '');
        }
      };
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage('go movetime 1000');
    });
  }, [engine]);

  return { getBestMove };
}

export default function CalibratePage() {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [state, setState] = useState<any>(null);
  const [gameActive, setGameActive] = useState(false);
  const [gameResult, setGameResult] = useState<'win' | 'loss' | 'draw' | null>(null);
  const [thinking, setThinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pgn, setPgn] = useState('');

  const playerId = typeof window !== 'undefined' ? localStorage.getItem('player_id') : null;
  const currentBotLevel = state?.next_bot?.level ?? 3;
  const { getBestMove } = useStockfish(currentBotLevel);

  useEffect(() => {
    if (!playerId) { setLoading(false); return; }
    fetch(`/api/calibration?player_id=${playerId}`)
      .then(r => r.json()).then(d => { setState(d); setLoading(false); });
  }, [playerId]);

  const startGame = () => {
    chess.reset();
    setFen(chess.fen());
    setGameActive(true);
    setGameResult(null);
    setPgn('');
  };

  const endCalibrationGame = async (result: 'win' | 'loss' | 'draw') => {
    setGameActive(false);
    setGameResult(result);
    setPgn(chess.pgn());
    setSubmitting(true);

    try {
      const res = await fetch('/api/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: playerId,
          bot_level: currentBotLevel,
          result,
          pgn: chess.pgn(),
        }),
      });
      const data = await res.json();
      setState(data.calibration_complete
        ? { ...state, calibration_complete: true, current_rating: data.final_rating, games_played: data.game_number }
        : { ...state, games_played: data.game_number, games_remaining: data.games_remaining, next_bot: data.next_bot }
      );
    } finally { setSubmitting(false); }
  };

  const onDrop = useCallback((src: string, tgt: string) => {
    if (!gameActive || thinking) return false;

    // Player move (always plays White in calibration)
    if (chess.turn() !== 'w') return false;
    try {
      const result = chess.move({ from: src, to: tgt, promotion: 'q' });
      if (!result) return false;
      setFen(chess.fen());

      if (chess.isGameOver()) {
        const r = chess.isCheckmate() ? 'win' : 'draw';
        endCalibrationGame(r);
        return true;
      }

      // Bot response (handled asynchronously)
      setThinking(true);
      getBestMove(chess.fen()).then((bestMove) => {
        if (bestMove && bestMove !== '(none)') {
          chess.move(bestMove);
          setFen(chess.fen());

          if (chess.isGameOver()) {
            const r = chess.isCheckmate() ? 'loss' : 'draw';
            endCalibrationGame(r);
          }
        }
        setThinking(false);
      });
      
      return true;
    } catch { return false; }
  }, [gameActive, thinking, chess, getBestMove]);

  if (!playerId) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <Bot className="text-gold w-12 h-12 mx-auto mb-4" />
        <h1 className="font-display text-3xl font-black text-chalk mb-3">Bot Calibration</h1>
        <p className="text-ink-400 mb-6">You need to register and log in first.</p>
        <Link href="/register" className="btn-gold">Register</Link>
      </div>
    );
  }

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-ink-400 animate-pulse">Loading calibration…</div>;

  if (state?.calibration_complete) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center page-enter">
        <CheckCircle className="text-green-400 w-16 h-16 mx-auto mb-4" />
        <h1 className="font-display text-3xl font-black text-chalk mb-3">Calibration Complete!</h1>
        <p className="text-ink-300 mb-2">Your starting SS4 rating has been determined.</p>
        <div className="card p-6 mb-6 text-center">
          <div className="text-xs text-ink-400 mb-2">Starting Rating</div>
          <div className="font-display text-6xl font-black text-gold">{state.current_rating}</div>
          <div className="text-xs text-ink-500 mt-2">Rating Deviation: ±200 (provisional)</div>
        </div>
        <p className="text-xs text-ink-500 mb-6">Your rating will be updated by the snake draft before the season starts.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/dashboard" className="btn-gold">Go to Dashboard <ArrowRight size={14} /></Link>
          <Link href="/players" className="btn-ghost">View Players</Link>
        </div>
      </div>
    );
  }

  const gamesPlayed = state?.games_played || 0;
  const gamesRemaining = state?.games_remaining || 5;
  const nextBot = state?.next_bot || BOT_LEVELS[3];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-enter">

      <div className="text-center mb-8">
        <Bot className="text-gold w-10 h-10 mx-auto mb-3" />
        <h1 className="font-display text-3xl font-black text-chalk mb-2">Bot Calibration</h1>
        <p className="text-ink-400">Play {gamesRemaining} more game{gamesRemaining !== 1 ? 's' : ''} to determine your starting rating.</p>
      </div>

      {/* Progress */}
      <div className="max-w-lg mx-auto mb-8">
        <div className="flex gap-2 justify-center mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${
              i < gamesPlayed ? 'bg-gold' : i === gamesPlayed ? 'bg-gold/40 animate-pulse' : 'bg-ink-700'
            }`} />
          ))}
        </div>
        <div className="text-center text-xs text-ink-500">{gamesPlayed}/5 games completed</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

        {/* Board */}
        <div className="space-y-3">
          {/* Opponent info */}
          <div className="card p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-ink-700 flex items-center justify-center">
              <Bot size={20} className="text-gold" />
            </div>
            <div>
              <div className="font-medium text-chalk text-sm">{nextBot?.name || 'Bot'}</div>
              <div className="text-xs text-ink-400">~{nextBot?.elo || 1100} Elo · Stockfish {currentBotLevel}</div>
            </div>
            {thinking && <span className="ml-auto text-xs text-ink-400 animate-pulse">Thinking…</span>}
          </div>

          <div className="board-wrapper">
            {typeof window !== 'undefined' && (
              <Chessboard
                position={fen}
                onPieceDrop={onDrop}
                boardOrientation="white"
                arePiecesDraggable={gameActive && chess.turn() === 'w' && !thinking}
                customDarkSquareStyle={{ backgroundColor: '#4a6080' }}
                customLightSquareStyle={{ backgroundColor: '#b0bcce' }}
                animationDuration={150}
              />
            )}
          </div>

          {/* You */}
          <div className="card p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center text-sm font-bold text-gold">You</div>
            <div>
              <div className="font-medium text-chalk text-sm">You ♔ White</div>
              <div className="text-xs text-ink-400">10 minutes · no increment</div>
            </div>
          </div>

          {/* Controls */}
          {!gameActive && !gameResult && (
            <button onClick={startGame} className="btn-gold w-full justify-center btn-lg">
              Start Game {gamesPlayed + 1} of 5 <ArrowRight size={16} />
            </button>
          )}

          {gameActive && (
            <div className="flex gap-2">
              <button onClick={() => endCalibrationGame('draw')} className="btn-ghost flex-1 text-sm">Offer Draw</button>
              <button onClick={() => endCalibrationGame('loss')} className="btn-danger flex-1 text-sm">Resign</button>
            </div>
          )}

          {/* Result of last game */}
          {gameResult && !submitting && (
            <div className={`card p-4 text-center border ${
              gameResult === 'win' ? 'border-green-700 bg-green-900/20' :
              gameResult === 'loss' ? 'border-red-800 bg-red-900/20' :
              'border-ink-600 bg-ink-700/50'
            }`}>
              <div className="text-2xl mb-1">
                {gameResult === 'win' ? '🎉' : gameResult === 'loss' ? '🤝' : '🤝'}
              </div>
              <div className={`font-bold text-sm ${gameResult === 'win' ? 'text-green-400' : gameResult === 'loss' ? 'text-red-400' : 'text-chalk'}`}>
                {gameResult === 'win' ? 'You Won!' : gameResult === 'loss' ? 'Bot Won' : 'Draw!'}
              </div>
              {gamesRemaining > 0 && (
                <button onClick={startGame} className="mt-3 btn-gold btn-sm">
                  Next Game <ArrowRight size={12} />
                </button>
              )}
            </div>
          )}

          {submitting && <div className="text-center text-ink-400 text-sm animate-pulse">Saving result…</div>}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="card p-4">
            <div className="section-label mb-3">How Calibration Works</div>
            <div className="space-y-3 text-xs text-ink-400 leading-relaxed">
              <p>You play 5 games against Stockfish bots. The bot difficulty adapts based on your results:</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2"><span className="text-green-400">Win →</span> Next bot is harder (~+300 Elo)</div>
                <div className="flex items-center gap-2"><span className="text-red-400">Loss →</span> Next bot is easier (~-300 Elo)</div>
                <div className="flex items-center gap-2"><span className="text-ink-300">Draw →</span> Same difficulty</div>
              </div>
              <p>After 5 games, your SS4 starting rating is calculated from a weighted average. Games 4 and 5 are weighted more heavily.</p>
            </div>
          </div>

          <div className="card p-4">
            <div className="section-label mb-3">Bot Levels</div>
            <div className="space-y-1.5">
              {BOT_LEVELS.map((bot, i) => (
                <div key={bot.level} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  i === currentBotLevel && gameActive ? 'bg-gold/10 border border-gold/20' : 'hover:bg-ink-700/30'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${i < currentBotLevel ? 'bg-green-400' : i === currentBotLevel ? 'bg-gold animate-pulse' : 'bg-ink-600'}`} />
                  <span className="font-medium text-chalk flex-1">{bot.name}</span>
                  <span className="font-mono text-ink-400">~{bot.elo}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <div className="section-label mb-3">Tips</div>
            <div className="space-y-2 text-xs text-ink-400">
              <p>• You always play White (easier to measure)</p>
              <p>• 10 minutes per game, no increment</p>
              <p>• Your true strength emerges across 5 games — don't stress about any one result</p>
              <p>• The RD starts high (200), dropping as you play more rated games</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
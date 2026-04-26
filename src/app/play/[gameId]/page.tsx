'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import dynamic from 'next/dynamic';
import { Chess } from 'chess.js';
import { Flag, Handshake, Eye, Download, RotateCcw } from 'lucide-react';
import Link from 'next/link';

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false });

function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { text: `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`, isLow: ms < 30_000 };
}

function Clock({ name, rating, timeMs, isActive, color }: any) {
  const [display, setDisplay] = useState(timeMs);
  const lastRef = useRef(Date.now());
  const ref = useRef<any>();

  useEffect(() => {
    setDisplay(timeMs);
    if (isActive) {
      lastRef.current = Date.now();
      ref.current = setInterval(() => {
        const now = Date.now(); const el = now - lastRef.current; lastRef.current = now;
        setDisplay((p: number) => Math.max(0, p - el));
      }, 100);
    }
    return () => clearInterval(ref.current);
  }, [timeMs, isActive]);

  const { text, isLow } = formatTime(display);
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${isActive ? 'bg-ink-700 border-ink-500' : 'bg-ink-900 border-ink-800'}`}>
      <div>
        <div className="text-xs text-ink-400">{color === 'white' ? '♔ White' : '♚ Black'}</div>
        <div className={`font-medium text-sm ${isActive ? 'text-chalk' : 'text-ink-400'}`}>{name}</div>
        <div className="text-xs text-ink-500">±{Math.round(rating)}</div>
      </div>
      <span className={`font-mono text-2xl font-bold tabular-nums ${!isActive ? 'text-ink-400' : isLow ? 'text-red-400' : 'text-chalk'}`}>{text}</span>
    </div>
  );
}

function MoveHistory({ moves }: { moves: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [moves]);
  const pairs: [string, string?][] = [];
  for (let i = 0; i < moves.length; i += 2) pairs.push([moves[i], moves[i+1]]);
  return (
    <div ref={ref} className="h-40 overflow-y-auto font-mono text-sm space-y-0.5 no-scrollbar">
      {pairs.map(([w, b], i) => (
        <div key={i} className="flex gap-2">
          <span className="text-ink-500 w-6">{i+1}.</span>
          <span className="flex-1 text-chalk">{w}</span>
          <span className="flex-1 text-chalk-700">{b || ''}</span>
        </div>
      ))}
      {!moves.length && <div className="text-ink-500 italic text-center py-4">No moves yet</div>}
    </div>
  );
}

export default function GameRoomPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [status, setStatus] = useState<'loading'|'waiting'|'active'|'ended'>('loading');
  const [result, setResult] = useState<string|null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [drawOffered, setDrawOffered] = useState(false);
  const [spectators, setSpectators] = useState(0);
  const socketRef = useRef<Socket|null>(null);
  const myColorRef = useRef<'white'|'black'|null>(null);

  const [white, setWhite] = useState({ name: 'White', rating: 1200, timeMs: 600_000, isActive: false });
  const [black, setBlack] = useState({ name: 'Black', rating: 1200, timeMs: 600_000, isActive: false });

  const myPlayerId = typeof window !== 'undefined' ? localStorage.getItem('player_id') : null;

  useEffect(() => {
    const sock = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001');
    socketRef.current = sock;
    sock.emit('join_game', { game_id: gameId, player_id: myPlayerId, is_spectator: !myPlayerId });

    sock.on('game_state', d => {
      if (d.pgn) chess.loadPgn(d.pgn);
      setFen(d.fen || chess.fen()); setMoves(chess.history()); setStatus(d.status === 'active' ? 'active' : 'waiting'); setSpectators(d.spectator_count || 0);
      setWhite(p => ({ ...p, timeMs: d.white_time, isActive: d.current_turn === 'w' && d.status === 'active' }));
      setBlack(p => ({ ...p, timeMs: d.black_time, isActive: d.current_turn === 'b' && d.status === 'active' }));
    });

    sock.on('game_started', d => {
      setStatus('active');
      if (myPlayerId === d.white_player_id) myColorRef.current = 'white';
      if (myPlayerId === d.black_player_id) myColorRef.current = 'black';
      setWhite(p => ({ ...p, timeMs: d.white_time, isActive: true }));
      setBlack(p => ({ ...p, timeMs: d.black_time, isActive: false }));
    });

    sock.on('move_made', d => {
      chess.load(d.fen); setFen(d.fen); setMoves(chess.history());
      setWhite(p => ({ ...p, timeMs: d.white_time, isActive: d.current_turn === 'w' }));
      setBlack(p => ({ ...p, timeMs: d.black_time, isActive: d.current_turn === 'b' }));
    });

    sock.on('game_ended', d => { setStatus('ended'); setResult(d.result); setWhite(p => ({ ...p, isActive: false })); setBlack(p => ({ ...p, isActive: false })); });
    sock.on('draw_offered', ({ by_player_id }) => { if (by_player_id !== myPlayerId) setDrawOffered(true); });
    sock.on('spectator_count', ({ count }) => setSpectators(count));

    // FIX: Added curly braces so it returns void instead of the Socket instance
    return () => {
      sock.disconnect();
    };
  }, [gameId, chess, myPlayerId]);

  const onDrop = useCallback((src: string, tgt: string) => {
    const sock = socketRef.current;
    if (status !== 'active' || !sock) return false;
    const isMyTurn = (chess.turn() === 'w' && myColorRef.current === 'white') || (chess.turn() === 'b' && myColorRef.current === 'black');
    if (!isMyTurn) return false;
    sock.emit('make_move', { game_id: gameId, player_id: myPlayerId, move: { from: src, to: tgt, promotion: 'q' } });
    return true;
  }, [status, chess, gameId, myPlayerId]);

  const orientation = myColorRef.current === 'black' ? 'black' : 'white';
  const isSpectator = !myPlayerId || myColorRef.current === null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {status === 'active' && <span className="live-dot" />}
          <span className="text-sm font-medium text-chalk capitalize">{status}</span>
          {result && <span className="text-sm font-bold px-2 py-0.5 rounded bg-gold/20 text-gold">{result === '0.5-0.5' ? 'Draw' : result === '1-0' ? 'White wins' : 'Black wins'}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-400"><Eye size={12} /> {spectators}</div>
      </div>

      {drawOffered && (
        <div className="mb-4 p-4 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-between">
          <span className="text-sm text-chalk">Draw offered — accept?</span>
          <div className="flex gap-2">
            <button onClick={() => { socketRef.current?.emit('accept_draw', { game_id: gameId }); setDrawOffered(false); }} className="btn-gold btn-sm">Accept</button>
            <button onClick={() => setDrawOffered(false)} className="btn-ghost btn-sm">Decline</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-3">
          <Clock {...(orientation === 'white' ? { ...black, color: 'black' } : { ...white, color: 'white' })} />
          <div className="board-wrapper">
            {typeof window !== 'undefined' && (
              <Chessboard
                position={fen} onPieceDrop={onDrop} boardOrientation={orientation}
                customDarkSquareStyle={{ backgroundColor: '#4a6080' }}
                customLightSquareStyle={{ backgroundColor: '#b0bcce' }}
                arePiecesDraggable={status === 'active' && !isSpectator}
                animationDuration={150}
              />
            )}
          </div>
          <Clock {...(orientation === 'white' ? { ...white, color: 'white' } : { ...black, color: 'black' })} />
          {!isSpectator && status === 'active' && (
            <div className="flex gap-2">
              <button onClick={() => socketRef.current?.emit('offer_draw', { game_id: gameId, player_id: myPlayerId })} className="btn-ghost flex-1 gap-2 text-sm"><Handshake size={14} /> Offer Draw</button>
              <button onClick={() => confirm('Resign?') && socketRef.current?.emit('resign', { game_id: gameId, player_id: myPlayerId })} className="btn-danger flex-1 gap-2 text-sm"><Flag size={14} /> Resign</button>
            </div>
          )}
          {status === 'ended' && (
            <div className="flex gap-2">
              <Link href={`/game/${gameId}`} className="btn-ghost flex-1 justify-center gap-2 text-sm"><RotateCcw size={14} /> Analysis</Link>
              <button onClick={() => { const blob = new Blob([chess.pgn()], {type:'text/plain'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `game-${gameId}.pgn`; a.click(); }} className="btn-ghost flex-1 justify-center gap-2 text-sm"><Download size={14} /> PGN</button>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="card p-4"><div className="section-label mb-3">Move History</div><MoveHistory moves={moves} /></div>
          <div className="card p-4">
            <div className="section-label mb-3">Game Info</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-400">Status</span><span className="text-chalk capitalize">{status}</span></div>
              <div className="flex justify-between"><span className="text-ink-400">Spectators</span><span className="text-chalk">{spectators}</span></div>
            </div>
          </div>
          {status === 'waiting' && <div className="card p-6 text-center border-dashed border-ink-600"><div className="text-2xl mb-2">⏳</div><div className="text-sm text-ink-400">Waiting for both players…</div></div>}
        </div>
      </div>
    </div>
  );
}